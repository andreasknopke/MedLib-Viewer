from datetime import datetime
from pathlib import Path
from uuid import UUID

import pytesseract
from pdf2image import convert_from_path
from pypdf import PdfReader
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Book, BookPage, OcrJob, OcrStatus


def count_pdf_pages(path: Path) -> int:
    with path.open("rb") as pdf_file:
        return len(PdfReader(pdf_file).pages)


def _has_meaningful_text(text: str) -> bool:
    return sum(1 for ch in text if ch.isalnum()) >= 20


def _extract_page_text(reader: PdfReader, page_index: int) -> str:
    try:
        return (reader.pages[page_index].extract_text() or "").strip()
    except Exception:
        return ""


def _ocr_page(pdf_path: Path, page_number: int, language: str) -> str:
    images = convert_from_path(
        pdf_path,
        dpi=260,
        first_page=page_number,
        last_page=page_number,
        fmt="png",
        thread_count=1,
    )
    if not images:
        return ""
    return pytesseract.image_to_string(images[0], lang=language).strip()


def run_ocr_job(job_id: UUID, language: str) -> None:
    db = SessionLocal()
    try:
        job = db.get(OcrJob, job_id)
        if not job:
            return
        book = db.get(Book, job.book_id)
        if not book:
            job.status = OcrStatus.failed
            job.message = "Book no longer exists"
            db.commit()
            return

        job.status = OcrStatus.running
        job.progress = 1
        job.updated_at = datetime.utcnow()
        db.commit()

        db.execute(delete(BookPage).where(BookPage.book_id == book.id))
        pdf_path = Path(book.storage_path)
        reader = PdfReader(str(pdf_path))
        total_pages = len(reader.pages)
        book.page_count = total_pages
        db.commit()

        ocr_used = 0
        for page_number in range(1, total_pages + 1):
            text = _extract_page_text(reader, page_number - 1)
            if not _has_meaningful_text(text):
                text = _ocr_page(pdf_path, page_number, language)
                ocr_used += 1
            db.add(BookPage(book_id=book.id, page_number=page_number, text=text))
            job.progress = int(page_number / total_pages * 100)
            job.updated_at = datetime.utcnow()
            db.commit()

        job.status = OcrStatus.completed
        job.message = (
            f"Text extracted ({ocr_used} of {total_pages} pages via OCR)"
            if total_pages
            else "Text extracted"
        )
        job.progress = 100
        job.updated_at = datetime.utcnow()
        book.updated_at = datetime.utcnow()
        db.commit()
    except Exception as exc:
        job = db.scalar(select(OcrJob).where(OcrJob.id == job_id))
        if job:
            job.status = OcrStatus.failed
            job.message = str(exc)
            job.updated_at = datetime.utcnow()
            db.commit()
    finally:
        db.close()

