"""add_article_media_type

Revision ID: 9f4c2a1b7d6e
Revises: 8a7b6c5d4e3f
Create Date: 2026-05-23 00:00:01.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '9f4c2a1b7d6e'
down_revision: Union[str, Sequence[str], None] = '8a7b6c5d4e3f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("ALTER TYPE mediatype ADD VALUE IF NOT EXISTS 'article'")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("UPDATE books SET media_type = 'journal' WHERE media_type = 'article'")
    op.execute("ALTER TYPE mediatype RENAME TO mediatype_old")
    op.execute("CREATE TYPE mediatype AS ENUM ('book', 'journal')")
    op.execute(
        "ALTER TABLE books ALTER COLUMN media_type TYPE mediatype USING media_type::text::mediatype"
    )
    op.execute("DROP TYPE mediatype_old")
