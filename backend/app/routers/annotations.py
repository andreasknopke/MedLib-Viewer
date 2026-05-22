from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Bookmark, Book, Highlight, Note, User
from app.schemas import BookmarkCreate, BookmarkRead, HighlightCreate, HighlightRead, NoteCreate, NoteRead
from app.security import get_current_user

router = APIRouter()


def ensure_book(db: Session, book_id: UUID) -> None:
    if not db.get(Book, book_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")


@router.get("/books/{book_id}/notes", response_model=list[NoteRead])
def list_notes(book_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[Note]:
    return list(db.scalars(select(Note).where(Note.book_id == book_id, Note.user_id == user.id).order_by(Note.created_at.desc())))


@router.post("/notes", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
def create_note(payload: NoteCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Note:
    ensure_book(db, payload.book_id)
    note = Note(user_id=user.id, **payload.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.get("/books/{book_id}/bookmarks", response_model=list[BookmarkRead])
def list_bookmarks(book_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[Bookmark]:
    return list(db.scalars(select(Bookmark).where(Bookmark.book_id == book_id, Bookmark.user_id == user.id).order_by(Bookmark.page_number)))


@router.post("/bookmarks", response_model=BookmarkRead, status_code=status.HTTP_201_CREATED)
def create_bookmark(payload: BookmarkCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Bookmark:
    ensure_book(db, payload.book_id)
    bookmark = Bookmark(user_id=user.id, **payload.model_dump())
    db.add(bookmark)
    db.commit()
    db.refresh(bookmark)
    return bookmark


@router.get("/books/{book_id}/highlights", response_model=list[HighlightRead])
def list_highlights(book_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[Highlight]:
    return list(db.scalars(select(Highlight).where(Highlight.book_id == book_id, Highlight.user_id == user.id).order_by(Highlight.created_at.desc())))


@router.post("/highlights", response_model=HighlightRead, status_code=status.HTTP_201_CREATED)
def create_highlight(payload: HighlightCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Highlight:
    ensure_book(db, payload.book_id)
    highlight = Highlight(user_id=user.id, **payload.model_dump())
    db.add(highlight)
    db.commit()
    db.refresh(highlight)
    return highlight


@router.delete("/highlights/{highlight_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_highlight(highlight_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> None:
    highlight = db.get(Highlight, highlight_id)
    if not highlight or highlight.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Highlight not found")
    db.delete(highlight)
    db.commit()


@router.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(note_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> None:
    note = db.get(Note, note_id)
    if not note or note.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    db.delete(note)
    db.commit()


@router.delete("/bookmarks/{bookmark_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bookmark(bookmark_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> None:
    bookmark = db.get(Bookmark, bookmark_id)
    if not bookmark or bookmark.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bookmark not found")
    db.delete(bookmark)
    db.commit()
