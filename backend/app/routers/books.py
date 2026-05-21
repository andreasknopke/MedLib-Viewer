import re
import shutil
from datetime import datetime
from pathlib import Path
from threading import Thread
from uuid import UUID, uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from pdf2image import convert_from_path
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.metadata import lookup_metadata, ocr_cover_text
from app.models import Book, BookPage, MediaPlacement, MediaType, OcrJob, Role, User
from app.ocr import count_pdf_pages, run_ocr_job
from app.schemas import BookRead, OcrJobRead, PageRead, SearchHit
from app.security import get_current_user, get_current_user_for_asset, require_roles


def _build_tsquery(text: str) -> str | None:
    """Translate user query into a Postgres ``to_tsquery`` expression.

    Supports trailing ``*`` for prefix matching, leading ``-`` for negation,
    and ``OR`` between tokens. Anything else is AND-combined.
    """
    tokens: list[str] = []
    operator = "&"
    for raw in re.split(r"\s+", text.strip()):
        if not raw:
            continue
        if raw.upper() == "OR":
            operator = "|"
            continue
        negated = raw.startswith("-")
        body = raw[1:] if negated else raw
        prefix = body.endswith("*")
        if prefix:
            body = body[:-1]
        body = re.sub(r"[&|!()<>:\\'\"]", " ", body).strip()
        if not body:
            continue
        parts = [p for p in body.split() if p]
        if not parts:
            continue
        for idx, part in enumerate(parts):
            lex = f"{part}:*" if (prefix and idx == len(parts) - 1) else part
            if negated:
                lex = f"!{lex}"
            if tokens:
                tokens.append(operator)
            tokens.append(lex)
            operator = "&"  # reset after consumption
    return " ".join(tokens) if tokens else None

router = APIRouter()


def _inspect_dir() -> Path:
    path = get_settings().storage_dir / "_pending"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _cover_dir() -> Path:
    path = get_settings().storage_dir / "_covers"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _safe_storage_name(prefix: str, original: str | None) -> str:
    """Compose a storage filename that fits within ext4's 255-byte limit.

    Keeps the original extension, trims the stem if necessary, and strips
    characters that are problematic on disk.
    """
    raw = Path(original or "book.pdf").name
    # Replace any path separator artifacts.
    raw = raw.replace("/", "_").replace("\\", "_")
    stem = Path(raw).stem or "book"
    suffix = Path(raw).suffix or ".pdf"
    # ext4 limit is 255 bytes for the filename. Leave generous headroom.
    max_total = 200
    overhead = len(prefix.encode("utf-8")) + 1 + len(suffix.encode("utf-8"))
    budget = max(20, max_total - overhead)
    stem_bytes = stem.encode("utf-8")[:budget]
    # Decode safely (ignore split multibyte chars).
    stem_trimmed = stem_bytes.decode("utf-8", errors="ignore") or "book"
    return f"{prefix}-{stem_trimmed}{suffix}"


@router.get("", response_model=list[BookRead])
def list_books(
    q: str | None = None,
    specialty: str | None = None,
    clinic_id: UUID | None = None,
    department_id: UUID | None = None,
    category_id: UUID | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[Book]:
    statement = select(Book).order_by(Book.created_at.desc())
    if q:
        wildcard = q.replace("*", "%")
        like = f"%{wildcard}%"
        statement = statement.where(
            or_(
                Book.title.ilike(like),
                Book.authors.ilike(like),
                Book.publisher.ilike(like),
                Book.isbn.ilike(like),
                Book.specialty.ilike(like),
            )
        )
    if specialty:
        statement = statement.where(Book.specialty == specialty)
    if clinic_id or department_id or category_id:
        statement = statement.join(MediaPlacement, MediaPlacement.book_id == Book.id)
        if clinic_id:
            statement = statement.where(MediaPlacement.clinic_id == clinic_id)
        if department_id:
            statement = statement.where(MediaPlacement.department_id == department_id)
        if category_id:
            statement = statement.where(MediaPlacement.category_id == category_id)
        statement = statement.distinct()
    return list(db.scalars(statement.limit(500)))


@router.post("", response_model=BookRead, status_code=status.HTTP_201_CREATED)
async def upload_book(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(...),
    subtitle: str | None = Form(None),
    authors: str | None = Form(None),
    publisher: str | None = Form(None),
    isbn: str | None = Form(None),
    year: int | None = Form(None),
    edition: str | None = Form(None),
    specialty: str | None = Form(None),
    media_type: MediaType = Form(MediaType.book),
    tags: str = Form(""),
    description: str | None = Form(None),
    is_downloadable: bool = Form(True),
    _: User = Depends(require_roles(Role.admin, Role.librarian)),
    db: Session = Depends(get_db),
) -> Book:
    settings = get_settings()
    if file.content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only PDF uploads are supported")
    safe_name = _safe_storage_name(str(uuid4()), file.filename)
    target_path = settings.storage_dir / safe_name
    with target_path.open("wb") as output_file:
        shutil.copyfileobj(file.file, output_file)

    book = Book(
        title=title,
        subtitle=subtitle,
        authors=authors,
        publisher=publisher,
        isbn=isbn,
        year=year,
        edition=edition,
        specialty=specialty,
        media_type=media_type,
        tags=[tag.strip() for tag in tags.split(",") if tag.strip()],
        description=description,
        is_downloadable=is_downloadable,
        source_filename=file.filename or safe_name,
        storage_path=str(target_path),
        page_count=count_pdf_pages(target_path),
    )
    db.add(book)
    db.commit()
    db.refresh(book)

    job = OcrJob(book_id=book.id, message="Queued after upload")
    db.add(job)
    db.commit()
    background_tasks.add_task(run_ocr_job, job.id, settings.ocr_language)
    return book


# --------------------------------------------------------------------------- #
# Auto-metadata: inspect → commit
# --------------------------------------------------------------------------- #


class InspectMetadata(BaseModel):
    source: str | None = None
    title: str | None = None
    subtitle: str | None = None
    authors: str | None = None
    publisher: str | None = None
    isbn: str | None = None
    year: int | None = None
    description: str | None = None
    language: str | None = None


class InspectResponse(BaseModel):
    temp_id: str
    filename: str
    cover_text: str
    detected_isbn: str | None = None
    suggested_query: str | None = None
    best: InspectMetadata | None = None
    candidates: list[InspectMetadata] = []


class CommitRequest(BaseModel):
    temp_id: str
    title: str
    subtitle: str | None = None
    authors: str | None = None
    publisher: str | None = None
    isbn: str | None = None
    year: int | None = None
    edition: str | None = None
    specialty: str | None = None
    media_type: MediaType = MediaType.book
    language: str = "de"
    tags: list[str] = []
    description: str | None = None
    is_downloadable: bool = True


@router.post("/inspect", response_model=InspectResponse)
async def inspect_book(
    file: UploadFile = File(...),
    _: User = Depends(require_roles(Role.admin, Role.librarian)),
) -> InspectResponse:
    """OCR the cover page and look the book up online; no DB write."""
    if file.content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only PDF uploads are supported")
    temp_id = str(uuid4())
    safe_name = _safe_storage_name(temp_id, file.filename)
    temp_path = _inspect_dir() / safe_name
    with temp_path.open("wb") as output_file:
        shutil.copyfileobj(file.file, output_file)

    settings = get_settings()

    # OCR + outbound HTTP must not block the event loop, and must never
    # raise (otherwise the whole upload flow returns 504/500).
    def _run() -> tuple[str, object]:
        try:
            text = ocr_cover_text(temp_path, language=settings.ocr_language)
        except Exception:
            text = ""
        try:
            res = lookup_metadata(text, filename=file.filename)
        except Exception:
            from app.metadata import LookupResult

            res = LookupResult(cover_text=text, isbn=None, suggested_query="", best=None)
        return text, res

    cover_text, result = await run_in_threadpool(_run)

    return InspectResponse(
        temp_id=temp_id,
        filename=file.filename or safe_name,
        cover_text=cover_text,
        detected_isbn=result.isbn,
        suggested_query=result.suggested_query or None,
        best=InspectMetadata(**result.best.to_dict()) if result.best else None,
        candidates=[InspectMetadata(**c.to_dict()) for c in result.candidates],
    )


@router.post("/from-inspection", response_model=BookRead, status_code=status.HTTP_201_CREATED)
async def commit_inspected_book(
    payload: CommitRequest,
    background_tasks: BackgroundTasks,
    _: User = Depends(require_roles(Role.admin, Role.librarian)),
    db: Session = Depends(get_db),
) -> Book:
    settings = get_settings()
    pending_dir = _inspect_dir()
    matches = list(pending_dir.glob(f"{payload.temp_id}-*"))
    if not matches:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Inspection payload expired – please upload the file again",
        )
    temp_path = matches[0]
    # Strip the temp_id prefix to recover the original filename portion.
    pending_stem = temp_path.name[len(payload.temp_id) + 1 :] if temp_path.name.startswith(payload.temp_id + "-") else temp_path.name
    final_name = _safe_storage_name(str(uuid4()), pending_stem)
    final_path = settings.storage_dir / final_name
    shutil.move(str(temp_path), final_path)

    book = Book(
        title=payload.title,
        subtitle=payload.subtitle,
        authors=payload.authors,
        publisher=payload.publisher,
        isbn=payload.isbn,
        year=payload.year,
        edition=payload.edition,
        specialty=payload.specialty,
        media_type=payload.media_type,
        language=payload.language,
        tags=payload.tags,
        description=payload.description,
        is_downloadable=payload.is_downloadable,
        source_filename=final_name,
        storage_path=str(final_path),
        page_count=count_pdf_pages(final_path),
    )
    db.add(book)
    db.commit()
    db.refresh(book)

    job = OcrJob(book_id=book.id, message="Queued after auto-metadata commit")
    db.add(job)
    db.commit()
    background_tasks.add_task(run_ocr_job, job.id, settings.ocr_language)
    return book


@router.delete("/inspect/{temp_id}", status_code=status.HTTP_204_NO_CONTENT)
async def discard_inspection(
    temp_id: str,
    _: User = Depends(require_roles(Role.admin, Role.librarian)),
) -> None:
    pending_dir = _inspect_dir()
    for match in pending_dir.glob(f"{temp_id}-*"):
        try:
            match.unlink()
        except OSError:
            pass


@router.get("/search", response_model=list[SearchHit])
def search_books(
    q: str,
    clinic_id: UUID | None = None,
    department_id: UUID | None = None,
    category_id: UUID | None = None,
    limit: int = 60,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[SearchHit]:
    q = q.strip()
    if len(q) < 2:
        return []

    ts_expression = _build_tsquery(q)
    limit = max(1, min(limit, 200))

    def _apply_scope(stmt):
        if clinic_id or department_id or category_id:
            stmt = stmt.join(MediaPlacement, MediaPlacement.book_id == Book.id)
            if clinic_id:
                stmt = stmt.where(MediaPlacement.clinic_id == clinic_id)
            if department_id:
                stmt = stmt.where(MediaPlacement.department_id == department_id)
            if category_id:
                stmt = stmt.where(MediaPlacement.category_id == category_id)
        return stmt

    rows: list = []

    if ts_expression:
        ts_query = func.to_tsquery("german", ts_expression)
        rank = func.ts_rank_cd(func.to_tsvector("german", BookPage.text), ts_query)
        headline = func.ts_headline(
            "german",
            BookPage.text,
            ts_query,
            "MaxFragments=2,MinWords=4,MaxWords=18,StartSel=<mark>,StopSel=</mark>",
        ).label("snippet")
        statement = (
            select(Book, BookPage.page_number, headline)
            .join(BookPage, BookPage.book_id == Book.id)
            .where(func.to_tsvector("german", BookPage.text).op("@@")(ts_query))
        )
        statement = _apply_scope(statement).order_by(rank.desc()).limit(limit)
        try:
            rows = db.execute(statement).all()
        except Exception:  # malformed tsquery → fallback
            rows = []

    if not rows:
        like = f"%{q.replace('*', '%')}%"
        fallback = (
            select(Book, BookPage.page_number, BookPage.text.label("snippet"))
            .join(BookPage, BookPage.book_id == Book.id)
            .where(BookPage.text.ilike(like))
        )
        fallback = _apply_scope(fallback).limit(limit)
        rows = db.execute(fallback).all()

    hits: list[SearchHit] = []
    seen: set[tuple] = set()
    for book, page, snippet in rows:
        key = (book.id, page)
        if key in seen:
            continue
        seen.add(key)
        hits.append(SearchHit(book=book, page_number=page, snippet=(snippet or "")[:500]))
    return hits


@router.get("/{book_id}", response_model=BookRead)
def get_book(book_id: UUID, db: Session = Depends(get_db), _: User = Depends(get_current_user)) -> Book:
    book = db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    return book


@router.get("/{book_id}/pages/{page_number}", response_model=PageRead)
def get_page(
    book_id: UUID,
    page_number: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> BookPage:
    page = db.scalar(select(BookPage).where(BookPage.book_id == book_id, BookPage.page_number == page_number))
    if not page:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Page text not found yet")
    return page


@router.get("/{book_id}/file")
def download_book(book_id: UUID, db: Session = Depends(get_db), _: User = Depends(get_current_user_for_asset)) -> FileResponse:
    book = db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    if not book.is_downloadable:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Download disabled")
    return FileResponse(book.storage_path, filename=book.source_filename, media_type="application/pdf")


@router.get("/{book_id}/viewer")
def view_book(book_id: UUID, db: Session = Depends(get_db), _: User = Depends(get_current_user_for_asset)) -> FileResponse:
    book = db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    return FileResponse(book.storage_path, media_type="application/pdf")


@router.get("/{book_id}/cover")
def get_book_cover(book_id: UUID, db: Session = Depends(get_db), _: User = Depends(get_current_user_for_asset)) -> FileResponse:
    book = db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")

    cover_path = _cover_dir() / f"{book.id}.jpg"
    if not cover_path.exists():
        try:
            images = convert_from_path(
                book.storage_path,
                dpi=110,
                first_page=1,
                last_page=1,
                fmt="jpeg",
                thread_count=1,
                size=(360, None),
            )
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cover preview not available") from exc

        if not images:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cover preview not available")

        images[0].save(cover_path, format="JPEG", quality=82, optimize=True)

    return FileResponse(cover_path, media_type="image/jpeg")


@router.post("/{book_id}/ocr", response_model=OcrJobRead)
def queue_ocr(
    book_id: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(Role.admin, Role.librarian)),
) -> OcrJob:
    if not db.get(Book, book_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    job = OcrJob(book_id=book_id, message="Queued manually")
    db.add(job)
    db.commit()
    db.refresh(job)
    background_tasks.add_task(run_ocr_job, job.id, get_settings().ocr_language)
    return job


@router.get("/{book_id}/ocr", response_model=list[OcrJobRead])
def list_ocr_jobs(book_id: UUID, db: Session = Depends(get_db), _: User = Depends(get_current_user)) -> list[OcrJob]:
    return list(db.scalars(select(OcrJob).where(OcrJob.book_id == book_id).order_by(OcrJob.created_at.desc())))
