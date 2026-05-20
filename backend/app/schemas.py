from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models import OcrStatus, Role


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str = Field(min_length=10)
    role: Role = Role.reader


class UserRead(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str
    role: Role
    is_active: bool

    class Config:
        from_attributes = True


class BookCreate(BaseModel):
    title: str
    subtitle: str | None = None
    authors: str | None = None
    publisher: str | None = None
    isbn: str | None = None
    year: int | None = None
    edition: str | None = None
    specialty: str | None = None
    language: str = "de"
    tags: list[str] = []
    description: str | None = None
    is_downloadable: bool = True


class BookRead(BookCreate):
    id: UUID
    source_filename: str
    page_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SearchHit(BaseModel):
    book: BookRead
    page_number: int | None = None
    snippet: str | None = None


class PageRead(BaseModel):
    page_number: int
    text: str

    class Config:
        from_attributes = True


class OcrJobRead(BaseModel):
    id: UUID
    book_id: UUID
    status: OcrStatus
    progress: int
    message: str | None
    updated_at: datetime

    class Config:
        from_attributes = True


class NoteCreate(BaseModel):
    book_id: UUID
    page_number: int | None = None
    body: str


class NoteRead(NoteCreate):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BookmarkCreate(BaseModel):
    book_id: UUID
    page_number: int
    label: str | None = None


class BookmarkRead(BookmarkCreate):
    id: UUID
    user_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


class HighlightCreate(BaseModel):
    book_id: UUID
    page_number: int
    selected_text: str
    color: str = "yellow"
    locator: dict = {}


class HighlightRead(HighlightCreate):
    id: UUID
    user_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True
