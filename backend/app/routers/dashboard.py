from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Bookmark, Book, BookPage, Highlight, Note, OcrJob, OcrStatus, User
from app.schemas import (
    DashboardImportRead,
    DashboardJobRead,
    DashboardMetric,
    DashboardOverviewRead,
    DashboardSpecialtyRead,
)
from app.security import get_current_user

router = APIRouter()


def get_storage_size_bytes(paths: list[str]) -> int:
    total_bytes = 0
    for storage_path in paths:
        file_path = Path(storage_path)
        if file_path.exists() and file_path.is_file():
            total_bytes += file_path.stat().st_size
    return total_bytes


@router.get("/overview", response_model=DashboardOverviewRead)
def dashboard_overview(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> DashboardOverviewRead:
    total_books = db.scalar(select(func.count()).select_from(Book)) or 0
    total_pages = db.scalar(select(func.coalesce(func.sum(Book.page_count), 0)).select_from(Book)) or 0
    total_users = db.scalar(select(func.count()).select_from(User)) or 0
    active_users = db.scalar(select(func.count()).select_from(User).where(User.is_active.is_(True))) or 0
    total_notes = db.scalar(select(func.count()).select_from(Note)) or 0
    total_bookmarks = db.scalar(select(func.count()).select_from(Bookmark)) or 0
    total_highlights = db.scalar(select(func.count()).select_from(Highlight)) or 0
    total_ocr_jobs = db.scalar(select(func.count()).select_from(OcrJob)) or 0
    total_book_pages = db.scalar(select(func.count()).select_from(BookPage)) or 0
    downloadable_books = db.scalar(select(func.count()).select_from(Book).where(Book.is_downloadable.is_(True))) or 0
    storage_paths = list(db.scalars(select(Book.storage_path)))
    storage_bytes = get_storage_size_bytes(storage_paths)
    specialties_count = db.scalar(select(func.count(func.distinct(Book.specialty))).where(Book.specialty.is_not(None))) or 0

    metrics = [
        DashboardMetric(key="books", label="Bücher", value=total_books),
        DashboardMetric(key="pages", label="Seiten", value=total_pages),
        DashboardMetric(key="users", label="Nutzer", value=total_users),
        DashboardMetric(key="storage_bytes", label="Speicher (Bytes)", value=storage_bytes),
    ]

    records_by_table = [
        DashboardMetric(key="book_records", label="Buchtabellen", value=total_books),
        DashboardMetric(key="ocr_pages", label="OCR-Seiten", value=total_book_pages),
        DashboardMetric(key="ocr_jobs", label="OCR-Jobs", value=total_ocr_jobs),
        DashboardMetric(key="notes", label="Notizen", value=total_notes),
        DashboardMetric(key="bookmarks", label="Lesezeichen", value=total_bookmarks),
        DashboardMetric(key="highlights", label="Markierungen", value=total_highlights),
        DashboardMetric(key="active_users", label="Aktive Nutzer", value=active_users),
        DashboardMetric(key="specialties", label="Fachgebiete", value=specialties_count),
        DashboardMetric(key="downloadable_books", label="Downloadbare Bücher", value=downloadable_books),
    ]

    job_status_counts = {
        status.value: db.scalar(select(func.count()).select_from(OcrJob).where(OcrJob.status == status)) or 0
        for status in OcrStatus
    }

    recent_jobs = [
        DashboardJobRead(
            id=job.id,
            book_id=book.id,
            book_title=book.title,
            status=job.status,
            progress=job.progress,
            message=job.message,
            created_at=job.created_at,
            updated_at=job.updated_at,
        )
        for job, book in db.execute(
            select(OcrJob, Book)
            .join(Book, Book.id == OcrJob.book_id)
            .order_by(OcrJob.created_at.desc())
            .limit(10)
        ).all()
    ]

    recent_imports: list[DashboardImportRead] = []
    recent_books = list(db.scalars(select(Book).order_by(Book.created_at.desc()).limit(8)))
    for book in recent_books:
        latest_job = db.scalar(
            select(OcrJob)
            .where(OcrJob.book_id == book.id)
            .order_by(OcrJob.created_at.desc())
            .limit(1)
        )
        recent_imports.append(
            DashboardImportRead(
                book_id=book.id,
                title=book.title,
                authors=book.authors,
                specialty=book.specialty,
                source_filename=book.source_filename,
                page_count=book.page_count,
                created_at=book.created_at,
                ocr_status=latest_job.status if latest_job else None,
                ocr_progress=latest_job.progress if latest_job else None,
            )
        )

    top_specialties = [
        DashboardSpecialtyRead(specialty=specialty or "Unbekannt", count=count)
        for specialty, count in db.execute(
            select(Book.specialty, func.count(Book.id))
            .where(Book.specialty.is_not(None))
            .group_by(Book.specialty)
            .order_by(func.count(Book.id).desc(), Book.specialty.asc())
            .limit(8)
        ).all()
    ]

    return DashboardOverviewRead(
        metrics=metrics,
        records_by_table=records_by_table,
        job_status_counts=job_status_counts,
        recent_jobs=recent_jobs,
        recent_imports=recent_imports,
        top_specialties=top_specialties,
    )