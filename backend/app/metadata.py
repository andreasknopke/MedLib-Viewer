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

HTTP_TIMEOUT = httpx.Timeout(8.0, connect=4.0)


@dataclass
class MetadataCandidate:
    source: str  # "openlibrary" | "googlebooks"
    title: str | None = None
    subtitle: str | None = None
    authors: str | None = None
    publisher: str | None = None
    isbn: str | None = None
    year: int | None = None
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
    names: list[str] = []
    for ref in refs[:3]:
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
# Aggregation
# --------------------------------------------------------------------------- #


def lookup_metadata(cover_text: str) -> LookupResult:
    isbn = extract_isbn(cover_text)
    query = build_query_from_cover(cover_text)
    candidates: list[MetadataCandidate] = []

    with httpx.Client(timeout=HTTP_TIMEOUT, headers={"User-Agent": "MedLib/1.0"}) as client:
        if isbn:
            ol = _openlibrary_by_isbn(client, isbn)
            if ol:
                candidates.append(ol)
            candidates.extend(_googlebooks_search(client, "", isbn=isbn))
        if query:
            candidates.extend(_openlibrary_search(client, query))
            candidates.extend(_googlebooks_search(client, query))

    # Score: complete records first, ISBN match first, googlebooks edges out openlibrary slightly.
    def score(candidate: MetadataCandidate) -> tuple[int, int, int]:
        complete = sum(
            1 for value in (candidate.title, candidate.authors, candidate.publisher, candidate.year) if value
        )
        isbn_match = 1 if (isbn and candidate.isbn and candidate.isbn.replace("-", "") == isbn) else 0
        source_bonus = 1 if candidate.source == "googlebooks" else 0
        return (isbn_match, complete, source_bonus)

    candidates = [c for c in candidates if c.title]
    candidates.sort(key=score, reverse=True)
    best = candidates[0] if candidates else None
    return LookupResult(
        cover_text=cover_text,
        isbn=isbn,
        suggested_query=query,
        best=best,
        candidates=candidates[:5],
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
