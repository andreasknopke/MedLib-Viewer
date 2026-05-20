import shutil
from datetime import datetime
from pathlib import Path
from threading import Thread
from uuid import UUID, uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import Book, BookPage, OcrJob, Role, User
from app.ocr import count_pdf_pages, run_ocr_job
from app.schemas import BookRead, OcrJobRead, PageRead, SearchHit
from app.security import get_current_user, require_roles

router = APIRouter()


@router.get("", response_model=list[BookRead])
def list_books(
    q: str | None = None,
    specialty: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[Book]:
    statement = select(Book).order_by(Book.created_at.desc())
    if q:
        like = f"%{q}%"
        statement = statement.where(or_(Book.title.ilike(like), Book.authors.ilike(like), Book.isbn.ilike(like)))
    if specialty:
        statement = statement.where(Book.specialty == specialty)
    return list(db.scalars(statement.limit(200)))


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
    tags: str = Form(""),
    description: str | None = Form(None),
    is_downloadable: bool = Form(True),
    _: User = Depends(require_roles(Role.admin, Role.librarian)),
    db: Session = Depends(get_db),
) -> Book:
    settings = get_settings()
    if file.content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only PDF uploads are supported")
    safe_name = f"{uuid4()}-{Path(file.filename or 'book.pdf').name}"
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


@router.get("/search", response_model=list[SearchHit])
def search_books(
    q: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[SearchHit]:
    if len(q.strip()) < 2:
        return []
    ts_query = func.plainto_tsquery("german", q)
    rank = func.ts_rank_cd(func.to_tsvector("german", BookPage.text), ts_query)
    statement = (
        select(Book, BookPage.page_number, func.ts_headline("german", BookPage.text, ts_query).label("snippet"))
        .join(BookPage, BookPage.book_id == Book.id)
        .where(func.to_tsvector("german", BookPage.text).op("@@")(ts_query))
        .order_by(rank.desc())
        .limit(50)
    )
    rows = db.execute(statement).all()
    if not rows:
        like = f"%{q}%"
        rows = db.execute(
            select(Book, BookPage.page_number, BookPage.text)
            .join(BookPage, BookPage.book_id == Book.id)
            .where(BookPage.text.ilike(like))
            .limit(50)
        ).all()
    return [SearchHit(book=book, page_number=page, snippet=(snippet or "")[:500]) for book, page, snippet in rows]


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
def download_book(book_id: UUID, db: Session = Depends(get_db), _: User = Depends(get_current_user)) -> FileResponse:
    book = db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    if not book.is_downloadable:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Download disabled")
    return FileResponse(book.storage_path, filename=book.source_filename, media_type="application/pdf")


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
