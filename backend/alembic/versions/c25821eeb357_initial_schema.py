"""initial_schema

Revision ID: c25821eeb357
Revises: 
Create Date: 2026-05-20 18:09:51.160680

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


# revision identifiers, used by Alembic.
revision: str = 'c25821eeb357'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ── users ──
    op.create_table(
        'users',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('email', sa.String(320), unique=True, nullable=False, index=True),
        sa.Column('full_name', sa.String(200), nullable=False),
        sa.Column('hashed_password', sa.String(255), nullable=False),
        sa.Column('role', sa.Enum('admin', 'librarian', 'clinician', 'reader', name='role'), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )

    # ── books ──
    op.create_table(
        'books',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('title', sa.String(500), nullable=False, index=True),
        sa.Column('subtitle', sa.String(500)),
        sa.Column('authors', sa.String(500), index=True),
        sa.Column('publisher', sa.String(250), index=True),
        sa.Column('isbn', sa.String(40), index=True),
        sa.Column('year', sa.Integer()),
        sa.Column('edition', sa.String(120)),
        sa.Column('specialty', sa.String(180), index=True),
        sa.Column('media_type', sa.Enum('book', 'journal', name='mediatype'), server_default='book', nullable=False, index=True),
        sa.Column('language', sa.String(16), server_default='de', nullable=False),
        sa.Column('tags', JSONB(), server_default='[]', nullable=False),
        sa.Column('source_filename', sa.String(500), nullable=False),
        sa.Column('storage_path', sa.String(1000), nullable=False),
        sa.Column('page_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('is_downloadable', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    # ── clinics ──
    op.create_table(
        'clinics',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(240), unique=True, nullable=False, index=True),
        sa.Column('description', sa.Text()),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )

    # ── departments ──
    op.create_table(
        'departments',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('clinic_id', UUID(as_uuid=True), sa.ForeignKey('clinics.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('name', sa.String(240), nullable=False, index=True),
        sa.Column('description', sa.Text()),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('clinic_id', 'name', name='uq_department_clinic_name'),
    )

    # ── categories ──
    op.create_table(
        'categories',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('department_id', UUID(as_uuid=True), sa.ForeignKey('departments.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('name', sa.String(240), nullable=False, index=True),
        sa.Column('description', sa.Text()),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('department_id', 'name', name='uq_category_department_name'),
    )

    # ── media_placements ──
    op.create_table(
        'media_placements',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('book_id', UUID(as_uuid=True), sa.ForeignKey('books.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('clinic_id', UUID(as_uuid=True), sa.ForeignKey('clinics.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('department_id', UUID(as_uuid=True), sa.ForeignKey('departments.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('category_id', UUID(as_uuid=True), sa.ForeignKey('categories.id', ondelete='SET NULL'), index=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('book_id', 'clinic_id', 'department_id', 'category_id', name='uq_media_placement'),
    )

    # ── book_pages ──
    op.create_table(
        'book_pages',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('book_id', UUID(as_uuid=True), sa.ForeignKey('books.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('page_number', sa.Integer(), nullable=False, index=True),
        sa.Column('text', sa.Text(), server_default='', nullable=False),
        sa.UniqueConstraint('book_id', 'page_number', name='uq_book_page'),
    )

    # ── ocr_jobs ──
    op.create_table(
        'ocr_jobs',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('book_id', UUID(as_uuid=True), sa.ForeignKey('books.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('status', sa.Enum('pending', 'running', 'completed', 'failed', name='ocrstatus'), server_default='pending', nullable=False, index=True),
        sa.Column('progress', sa.Integer(), server_default='0', nullable=False),
        sa.Column('message', sa.Text()),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    # ── notes ──
    op.create_table(
        'notes',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('book_id', UUID(as_uuid=True), sa.ForeignKey('books.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('page_number', sa.Integer()),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    # ── bookmarks ──
    op.create_table(
        'bookmarks',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('book_id', UUID(as_uuid=True), sa.ForeignKey('books.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('page_number', sa.Integer(), nullable=False),
        sa.Column('label', sa.String(200)),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('user_id', 'book_id', 'page_number', name='uq_bookmark'),
    )

    # ── saved_media ──
    op.create_table(
        'saved_media',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('book_id', UUID(as_uuid=True), sa.ForeignKey('books.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('user_id', 'book_id', name='uq_saved_media_user_book'),
    )

    # ── highlights ──
    op.create_table(
        'highlights',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('book_id', UUID(as_uuid=True), sa.ForeignKey('books.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('page_number', sa.Integer(), nullable=False),
        sa.Column('selected_text', sa.Text(), nullable=False),
        sa.Column('color', sa.String(32), server_default='yellow', nullable=False),
        sa.Column('locator', JSONB(), server_default='{}', nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('highlights')
    op.drop_table('saved_media')
    op.drop_table('bookmarks')
    op.drop_table('notes')
    op.drop_table('ocr_jobs')
    op.drop_table('book_pages')
    op.drop_table('media_placements')
    op.drop_table('categories')
    op.drop_table('departments')
    op.drop_table('clinics')
    op.drop_table('books')
    op.drop_table('users')

    # Drop enum types
    op.execute("DROP TYPE IF EXISTS mediatype")
    op.execute("DROP TYPE IF EXISTS ocrstatus")
    op.execute("DROP TYPE IF EXISTS role")
