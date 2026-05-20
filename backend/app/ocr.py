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
        total_pages = count_pdf_pages(pdf_path)
        book.page_count = total_pages
        db.commit()

        for page_number in range(1, total_pages + 1):
            images = convert_from_path(
                pdf_path,
                dpi=260,
                first_page=page_number,
                last_page=page_number,
                fmt="png",
                thread_count=1,
            )
            text = pytesseract.image_to_string(images[0], lang=language) if images else ""
            db.add(BookPage(book_id=book.id, page_number=page_number, text=text.strip()))
            job.progress = int(page_number / total_pages * 100)
            job.updated_at = datetime.utcnow()
            db.commit()

        job.status = OcrStatus.completed
        job.message = "OCR completed"
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
