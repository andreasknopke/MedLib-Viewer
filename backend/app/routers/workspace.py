from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Bookmark, Book, Note, SavedMedia, User
from app.schemas import SavedMediaRead, UserBookmarkOverview, UserNoteOverview, UserWorkspaceRead
from app.security import get_current_user

router = APIRouter()


@router.get("", response_model=UserWorkspaceRead)
def my_workspace(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> UserWorkspaceRead:
    saved_media = list(
        db.scalars(
            select(SavedMedia)
            .where(SavedMedia.user_id == user.id)
            .order_by(SavedMedia.created_at.desc())
        )
    )
    bookmarks = [
        UserBookmarkOverview(
            id=bookmark.id,
            book_id=book.id,
            book_title=book.title,
            page_number=bookmark.page_number,
            label=bookmark.label,
            created_at=bookmark.created_at,
        )
        for bookmark, book in db.execute(
            select(Bookmark, Book)
            .join(Book, Book.id == Bookmark.book_id)
            .where(Bookmark.user_id == user.id)
            .order_by(Bookmark.created_at.desc())
        ).all()
    ]
    notes = [
        UserNoteOverview(
            id=note.id,
            book_id=book.id,
            book_title=book.title,
            page_number=note.page_number,
            body=note.body,
            created_at=note.created_at,
        )
        for note, book in db.execute(
            select(Note, Book)
            .join(Book, Book.id == Note.book_id)
            .where(Note.user_id == user.id)
            .order_by(Note.created_at.desc())
        ).all()
    ]
    return UserWorkspaceRead(saved_media=saved_media, bookmarks=bookmarks, notes=notes)


@router.post("/saved/{book_id}", response_model=SavedMediaRead, status_code=status.HTTP_201_CREATED)
def save_media(book_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> SavedMedia:
    if not db.get(Book, book_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    existing = db.scalar(select(SavedMedia).where(SavedMedia.user_id == user.id, SavedMedia.book_id == book_id))
    if existing:
        return existing
    saved = SavedMedia(user_id=user.id, book_id=book_id)
    db.add(saved)
    db.commit()
    db.refresh(saved)
    return saved


@router.delete("/saved/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
def unsave_media(book_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> None:
    saved = db.scalar(select(SavedMedia).where(SavedMedia.user_id == user.id, SavedMedia.book_id == book_id))
    if saved:
        db.delete(saved)
        db.commit()
