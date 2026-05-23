from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models import MediaType, OcrStatus, Role


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


class UserStatusUpdate(BaseModel):
    is_active: bool


class UserPasswordUpdate(BaseModel):
    password: str = Field(min_length=10)


class UserRoleUpdate(BaseModel):
    role: Role


class SelfPasswordUpdate(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=10)


class DashboardMetric(BaseModel):
    key: str
    label: str
    value: int


class DashboardJobRead(BaseModel):
    id: UUID
    book_id: UUID
    book_title: str
    status: OcrStatus
    progress: int
    message: str | None
    created_at: datetime
    updated_at: datetime


class DashboardImportRead(BaseModel):
    book_id: UUID
    title: str
    authors: str | None
    specialty: str | None
    source_filename: str
    page_count: int
    created_at: datetime
    ocr_status: OcrStatus | None = None
    ocr_progress: int | None = None


class DashboardSpecialtyRead(BaseModel):
    specialty: str
    count: int


class DashboardOverviewRead(BaseModel):
    metrics: list[DashboardMetric]
    records_by_table: list[DashboardMetric]
    job_status_counts: dict[str, int]
    recent_jobs: list[DashboardJobRead]
    recent_imports: list[DashboardImportRead]
    top_specialties: list[DashboardSpecialtyRead]


class BookCreate(BaseModel):
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


class ClinicCreate(BaseModel):
    name: str
    description: str | None = None


class ClinicRead(ClinicCreate):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


class DepartmentCreate(BaseModel):
    clinic_id: UUID
    name: str
    description: str | None = None


class DepartmentRead(DepartmentCreate):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


class CategoryCreate(BaseModel):
    department_id: UUID
    name: str
    description: str | None = None


class CategoryRead(CategoryCreate):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


class PlacementCreate(BaseModel):
    book_id: UUID
    clinic_id: UUID
    department_id: UUID
    category_id: UUID | None = None


class PlacementRead(PlacementCreate):
    id: UUID
    clinic_name: str | None = None
    department_name: str | None = None
    category_name: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class PlacementUpdate(BaseModel):
    clinic_id: UUID | None = None
    department_id: UUID | None = None
    category_id: UUID | None = None


class SavedMediaRead(BaseModel):
    id: UUID
    book: BookRead
    created_at: datetime

    class Config:
        from_attributes = True


class UserBookmarkOverview(BaseModel):
    id: UUID
    book_id: UUID
    book_title: str
    page_number: int
    label: str | None = None
    created_at: datetime


class UserNoteOverview(BaseModel):
    id: UUID
    book_id: UUID
    book_title: str
    page_number: int | None = None
    body: str
    created_at: datetime


class UserHighlightOverview(BaseModel):
    id: UUID
    book_id: UUID
    book_title: str
    page_number: int
    selected_text: str
    color: str
    created_at: datetime


class UserWorkspaceRead(BaseModel):
    saved_media: list[SavedMediaRead]
    bookmarks: list[UserBookmarkOverview]
    notes: list[UserNoteOverview]
    highlights: list[UserHighlightOverview]
