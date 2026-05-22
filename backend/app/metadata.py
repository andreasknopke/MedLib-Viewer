"""Cover OCR and online metadata lookup (OpenLibrary + Google Books).

Both backends are keyless / public. We try ISBN lookup first (most reliable),
then fall back to title-based search using the OCR'ed cover text.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
import pytesseract
from pdf2image import convert_from_path


ISBN_REGEX = re.compile(
    r"(?:ISBN[-\s]*(?:1[03])?[:\s]*)?"
    r"((?:97[89][-\s]?)?(?:\d[-\s]?){9}[\dXx])",
    re.IGNORECASE,
)

# Aggressive timeouts: the inspect endpoint must respond well within nginx's
# default 60s gateway timeout, even when both providers are slow.
HTTP_TIMEOUT = httpx.Timeout(3.5, connect=2.0)


@dataclass
class MetadataCandidate:
    source: str  # "openlibrary" | "googlebooks" | "filename"
    title: str | None = None
    subtitle: str | None = None
    authors: str | None = None
    publisher: str | None = None
    isbn: str | None = None
    year: int | None = None
    edition: str | None = None
    description: str | None = None
    language: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "title": self.title,
            "subtitle": self.subtitle,
            "authors": self.authors,
            "publisher": self.publisher,
            "isbn": self.isbn,
            "year": self.year,
            "edition": self.edition,
            "description": self.description,
            "language": self.language,
        }


@dataclass
class LookupResult:
    cover_text: str
    isbn: str | None
    suggested_query: str
    best: MetadataCandidate | None
    candidates: list[MetadataCandidate] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "cover_text": self.cover_text,
            "isbn": self.isbn,
            "suggested_query": self.suggested_query,
            "best": self.best.to_dict() if self.best else None,
            "candidates": [c.to_dict() for c in self.candidates],
        }


# --------------------------------------------------------------------------- #
# OCR
# --------------------------------------------------------------------------- #


def ocr_cover_text(pdf_path: Path, language: str = "deu+eng") -> str:
    """OCR the first page of the PDF in moderate resolution."""
    try:
        images = convert_from_path(
            pdf_path,
            dpi=240,
            first_page=1,
            last_page=1,
            fmt="png",
            thread_count=1,
        )
    except Exception:
        return ""
    if not images:
        return ""
    try:
        text = pytesseract.image_to_string(images[0], lang=language)
    except Exception:
        # Fall back to English if the requested traineddata is missing.
        try:
            text = pytesseract.image_to_string(images[0], lang="eng")
        except Exception:
            return ""
    return (text or "").strip()


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def extract_isbn(text: str) -> str | None:
    """Find the first valid ISBN-10/13 in text."""
    if not text:
        return None
    for match in ISBN_REGEX.finditer(text):
        candidate = re.sub(r"[-\s]", "", match.group(1))
        if _is_valid_isbn(candidate):
            return candidate
    return None


def _is_valid_isbn(value: str) -> bool:
    if len(value) == 10:
        if not re.fullmatch(r"\d{9}[\dXx]", value):
            return False
        total = sum((10 - i) * (10 if c in "Xx" else int(c)) for i, c in enumerate(value))
        return total % 11 == 0
    if len(value) == 13:
        if not value.isdigit():
            return False
        total = sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(value))
        return total % 10 == 0
    return False


def build_query_from_cover(text: str, max_words: int = 12) -> str:
    """Pull the most title-ish lines out of cover OCR text."""
    if not text:
        return ""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    # Skip very short / non-letter lines (years, fragments, page numbers).
    scored: list[tuple[int, str]] = []
    for line in lines:
        letters = sum(1 for c in line if c.isalpha())
        if letters < 3:
            continue
        # Prefer longer lines with mostly letters and no all-caps "noise".
        score = letters - len(re.findall(r"[^A-Za-zÄÖÜäöüß0-9\s\-:]", line))
        scored.append((score, line))
    scored.sort(key=lambda item: item[0], reverse=True)
    top = [line for _, line in scored[:3]]
    query = " ".join(top)
    words = re.findall(r"[\wÄÖÜäöüß\-]+", query)
    return " ".join(words[:max_words])


# --------------------------------------------------------------------------- #
# OpenLibrary
# --------------------------------------------------------------------------- #


def _openlibrary_by_isbn(client: httpx.Client, isbn: str) -> MetadataCandidate | None:
    try:
        response = client.get(f"https://openlibrary.org/isbn/{isbn}.json")
    except httpx.HTTPError:
        return None
    if response.status_code != 200:
        return None
    data = response.json()
    authors = _resolve_openlibrary_authors(client, data.get("authors") or [])
    publishers = data.get("publishers") or []
    year = _year_from_string(data.get("publish_date") or "")
    return MetadataCandidate(
        source="openlibrary",
        title=data.get("title"),
        subtitle=data.get("subtitle"),
        authors=", ".join(authors) if authors else None,
        publisher=publishers[0] if publishers else None,
        isbn=isbn,
        year=year,
        description=_clean_description(data.get("description")),
        language=_first_language(data.get("languages")),
    )


def _resolve_openlibrary_authors(client: httpx.Client, refs: list[dict[str, Any]]) -> list[str]:
    """Resolve at most one author reference to keep latency bounded."""
    names: list[str] = []
    for ref in refs[:1]:
        key = ref.get("key") if isinstance(ref, dict) else None
        if not key:
            continue
        try:
            resp = client.get(f"https://openlibrary.org{key}.json")
        except httpx.HTTPError:
            continue
        if resp.status_code == 200:
            name = resp.json().get("name")
            if name:
                names.append(name)
    return names


def _openlibrary_search(client: httpx.Client, query: str) -> list[MetadataCandidate]:
    if not query.strip():
        return []
    try:
        response = client.get(
            "https://openlibrary.org/search.json",
            params={"q": query, "limit": 5},
        )
    except httpx.HTTPError:
        return []
    if response.status_code != 200:
        return []
    docs = response.json().get("docs", []) or []
    out: list[MetadataCandidate] = []
    for doc in docs[:5]:
        isbns = doc.get("isbn") or []
        out.append(
            MetadataCandidate(
                source="openlibrary",
                title=doc.get("title"),
                subtitle=doc.get("subtitle"),
                authors=", ".join(doc.get("author_name", [])[:3]) or None,
                publisher=(doc.get("publisher") or [None])[0],
                isbn=isbns[0] if isbns else None,
                year=doc.get("first_publish_year"),
                language=(doc.get("language") or [None])[0],
            )
        )
    return out


# --------------------------------------------------------------------------- #
# Google Books
# --------------------------------------------------------------------------- #


def _googlebooks_search(client: httpx.Client, query: str, isbn: str | None = None) -> list[MetadataCandidate]:
    q = f"isbn:{isbn}" if isbn else query
    if not q.strip():
        return []
    try:
        response = client.get(
            "https://www.googleapis.com/books/v1/volumes",
            params={"q": q, "maxResults": 5, "printType": "books"},
        )
    except httpx.HTTPError:
        return []
    if response.status_code != 200:
        return []
    items = response.json().get("items", []) or []
    out: list[MetadataCandidate] = []
    for item in items[:5]:
        info = item.get("volumeInfo", {}) or {}
        identifiers = info.get("industryIdentifiers", []) or []
        candidate_isbn = None
        for ident in identifiers:
            if ident.get("type") in {"ISBN_13", "ISBN_10"}:
                candidate_isbn = ident.get("identifier")
                if ident.get("type") == "ISBN_13":
                    break
        out.append(
            MetadataCandidate(
                source="googlebooks",
                title=info.get("title"),
                subtitle=info.get("subtitle"),
                authors=", ".join(info.get("authors", [])[:3]) or None,
                publisher=info.get("publisher"),
                isbn=candidate_isbn or isbn,
                year=_year_from_string(info.get("publishedDate") or ""),
                description=info.get("description"),
                language=info.get("language"),
            )
        )
    return out


# --------------------------------------------------------------------------- #
# Filename parsing (libgen / z-lib style)
# --------------------------------------------------------------------------- #


@dataclass
class FilenameHints:
    title: str | None = None
    authors: str | None = None
    publisher: str | None = None
    year: int | None = None
    edition: str | None = None


# Common LibGen-style publisher abbreviations seen in "[Abbr]" prefixes.
_PUBLISHER_ABBREVIATIONS = {
    "thie": "Thieme",
    "sprin": "Springer",
    "spri": "Springer",
    "else": "Elsevier",
    "elsev": "Elsevier",
    "schat": "Schattauer",
    "urban": "Urban & Fischer",
    "wiley": "Wiley",
    "haus": "Hogrefe",
    "hogr": "Hogrefe",
    "deg": "De Gruyter",
}


def parse_filename(filename: str | None) -> FilenameHints:
    """Parse common e-book filename patterns into structured hints.

    Handles patterns like:
      "Author1, Author2 - Title-Publisher (Year).pdf"
      "Author - Title (Year).pdf"
      "Title - Publisher (Year).pdf"
      "[Publisher] Author, Title (2. Aufl. 2013).pdf"  (LibGen DE)
      "Author, Title (Year).pdf"
      "Title.pdf"
    """
    hints = FilenameHints()
    if not filename:
        return hints
    stem = Path(filename).stem

    # Trailing parenthetical: "(2. Aufl. 2013)", "(2013)", "(2nd ed. 2013)"
    paren_match = re.search(r"\s*\(([^)]*)\)\s*$", stem)
    if paren_match:
        paren_text = paren_match.group(1)
        year_in_paren = re.search(r"\b(?:19|20)\d{2}\b", paren_text)
        if year_in_paren:
            try:
                hints.year = int(year_in_paren.group(0))
            except ValueError:
                pass
        edition_match = re.search(
            r"(\d+)\s*(?:st|nd|rd|th)?\s*\.?\s*(?:Aufl(?:age)?|ed(?:ition)?|Ed(?:ition)?)\b",
            paren_text,
        )
        if edition_match:
            hints.edition = edition_match.group(1)
        if hints.year or hints.edition:
            stem = stem[: paren_match.start()].rstrip(" -_")

    # Leading "[Publisher]" tag (common on LibGen scans).
    bracket_match = re.match(r"^\s*\[([^\]]+)\]\s*", stem)
    if bracket_match:
        publisher_hint = bracket_match.group(1).strip().rstrip(".")
        hints.publisher = _PUBLISHER_ABBREVIATIONS.get(
            publisher_hint.lower(), publisher_hint
        )
        stem = stem[bracket_match.end():]

    # Split on " - " (with surrounding spaces).
    parts = [p.strip() for p in re.split(r"\s+-\s+", stem) if p.strip()]
    if len(parts) >= 2:
        # First part: authors (comma-separated capitalised names).
        first = parts[0]
        if "," in first or _looks_like_surname_or_name(first):
            hints.authors = first
            remainder = parts[1:]
        else:
            remainder = parts
        # Title-Publisher merged via single hyphen (no spaces).
        if remainder:
            tail = remainder[-1]
            sub_match = re.match(r"^(.+?)-([A-Z][A-Za-z &.]+)$", tail)
            if sub_match and len(remainder) == 1 and hints.authors:
                hints.title = sub_match.group(1).strip()
                if not hints.publisher:
                    hints.publisher = sub_match.group(2).strip()
            else:
                hints.title = remainder[0].strip()
                if len(remainder) >= 2 and not hints.publisher:
                    hints.publisher = remainder[-1].strip()
    else:
        # No " - " separator. Try first-comma split as "Author, Title".
        comma_match = re.match(r"^([^,]+),\s+(.+)$", stem)
        if (
            comma_match
            and not hints.authors
            and _looks_like_surname_or_name(comma_match.group(1).strip())
        ):
            hints.authors = comma_match.group(1).strip()
            hints.title = comma_match.group(2).strip()
        elif stem:
            hints.title = stem
    return hints


def _looks_like_author(text: str) -> bool:
    """Heuristic: a string of 2-4 Capitalised words is probably a personal name."""
    words = text.split()
    if not 2 <= len(words) <= 4:
        return False
    return all(w[:1].isupper() for w in words if w)


def _looks_like_surname_or_name(text: str) -> bool:
    """A single capitalised surname ("Breitenseher") or a 2-4 word name."""
    if not text:
        return False
    if _looks_like_author(text):
        return True
    words = text.split()
    if len(words) == 1:
        return bool(re.fullmatch(r"[A-ZÄÖÜ][\wÄÖÜäöüß\.\-']{1,}", words[0]))
    return False


# --------------------------------------------------------------------------- #
# Structured OpenLibrary search
# --------------------------------------------------------------------------- #


def _openlibrary_structured(
    client: httpx.Client, title: str | None = None, author: str | None = None
) -> list[MetadataCandidate]:
    params: dict[str, Any] = {"limit": 5}
    if title:
        params["title"] = title
    if author:
        params["author"] = author
    if not (title or author):
        return []
    try:
        response = client.get("https://openlibrary.org/search.json", params=params)
    except httpx.HTTPError:
        return []
    if response.status_code != 200:
        return []
    docs = response.json().get("docs", []) or []
    out: list[MetadataCandidate] = []
    for doc in docs[:5]:
        isbns = doc.get("isbn") or []
        out.append(
            MetadataCandidate(
                source="openlibrary",
                title=doc.get("title"),
                subtitle=doc.get("subtitle"),
                authors=", ".join(doc.get("author_name", [])[:3]) or None,
                publisher=(doc.get("publisher") or [None])[0],
                isbn=isbns[0] if isbns else None,
                year=doc.get("first_publish_year"),
                language=(doc.get("language") or [None])[0],
            )
        )
    return out


# --------------------------------------------------------------------------- #
# Aggregation
# --------------------------------------------------------------------------- #


def lookup_metadata(cover_text: str, filename: str | None = None) -> LookupResult:
    isbn = extract_isbn(cover_text)
    cover_query = build_query_from_cover(cover_text)
    hints = parse_filename(filename)
    # Primary suggested query: prefer filename-derived title when available.
    primary_query = hints.title or cover_query
    candidates: list[MetadataCandidate] = []
    tried_googlebooks = False

    try:
        with httpx.Client(timeout=HTTP_TIMEOUT, headers={"User-Agent": "MedLib/1.0"}) as client:
            if isbn:
                ol = _openlibrary_by_isbn(client, isbn)
                if ol:
                    candidates.append(ol)
                candidates.extend(_googlebooks_search(client, "", isbn=isbn))
                tried_googlebooks = True

            # Structured OL search with filename hints (strongest signal).
            if hints.title or hints.authors:
                candidates.extend(
                    _openlibrary_structured(client, title=hints.title, author=hints.authors)
                )

            # Try at most two query variants to keep total latency bounded.
            queries: list[str] = []
            if hints.title:
                queries.append(hints.title)
            elif cover_query:
                queries.append(cover_query)

            for q in queries[:2]:
                new = _openlibrary_search(client, q)
                candidates.extend(new)
                if new:
                    break

            if not tried_googlebooks and queries:
                candidates.extend(_googlebooks_search(client, queries[0]))
    except Exception:
        # Any unexpected failure (DNS, SSL, etc.) must not break the upload flow.
        candidates = []

    # Score candidates.
    def score(candidate: MetadataCandidate) -> tuple[int, int, int, int]:
        complete = sum(
            1
            for value in (
                candidate.title,
                candidate.authors,
                candidate.publisher,
                candidate.year,
            )
            if value
        )
        isbn_match = 1 if (isbn and candidate.isbn and candidate.isbn.replace("-", "") == isbn) else 0
        # Title overlap with filename title is a strong signal.
        title_match = 0
        if hints.title and candidate.title:
            wanted = set(re.findall(r"\w+", hints.title.lower()))
            got = set(re.findall(r"\w+", candidate.title.lower()))
            if wanted and len(wanted & got) >= max(2, len(wanted) // 2):
                title_match = 1
        source_bonus = 1 if candidate.source == "googlebooks" else 0
        return (isbn_match, title_match, complete, source_bonus)

    candidates = [c for c in candidates if c.title]
    # De-duplicate by (title, year).
    seen: set[tuple[str, int | None]] = set()
    unique: list[MetadataCandidate] = []
    for c in candidates:
        key = ((c.title or "").lower().strip(), c.year)
        if key in seen:
            continue
        seen.add(key)
        unique.append(c)
    unique.sort(key=score, reverse=True)

    # If nothing came back from the web but we have filename hints, return them
    # as a synthetic candidate so the form still autofills.
    if not unique and (hints.title or hints.authors):
        unique.append(
            MetadataCandidate(
                source="filename",
                title=hints.title,
                authors=hints.authors,
                publisher=hints.publisher,
                year=hints.year,
                edition=hints.edition,
                isbn=isbn,
            )
        )

    # Backfill the best candidate with filename hints whenever the online
    # source left a field empty – the user explicitly wants ISBN/author/year
    # populated even if only one source had them.
    if unique:
        top = unique[0]
        if not top.authors and hints.authors:
            top.authors = hints.authors
        if not top.publisher and hints.publisher:
            top.publisher = hints.publisher
        if not top.year and hints.year:
            top.year = hints.year
        if not top.edition and hints.edition:
            top.edition = hints.edition
        if not top.isbn and isbn:
            top.isbn = isbn
        if not top.title and hints.title:
            top.title = hints.title

    best = unique[0] if unique else None
    return LookupResult(
        cover_text=cover_text,
        isbn=isbn,
        suggested_query=primary_query,
        best=best,
        candidates=unique[:5],
    )


# --------------------------------------------------------------------------- #
# small utilities
# --------------------------------------------------------------------------- #


def _year_from_string(value: str) -> int | None:
    match = re.search(r"\b(19|20)\d{2}\b", value or "")
    if not match:
        return None
    try:
        return int(match.group(0))
    except ValueError:
        return None


def _clean_description(value: Any) -> str | None:
    if not value:
        return None
    if isinstance(value, dict):
        return value.get("value")
    return str(value)


def _first_language(value: Any) -> str | None:
    if not value:
        return None
    if isinstance(value, list) and value:
        item = value[0]
        if isinstance(item, dict):
            key = item.get("key", "")
            return key.rsplit("/", 1)[-1] if key else None
        return str(item)
    return None
