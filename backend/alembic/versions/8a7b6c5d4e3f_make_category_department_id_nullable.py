"""make_category_department_id_nullable

Revision ID: 8a7b6c5d4e3f
Revises: c25821eeb357
Create Date: 2026-05-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = '8a7b6c5d4e3f'
down_revision: Union[str, Sequence[str], None] = 'c25821eeb357'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Make department_id nullable in categories
    with op.batch_alter_table('categories', schema=None) as batch_op:
        batch_op.alter_column('department_id',
               existing_type=UUID(as_uuid=True),
               nullable=True)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('categories', schema=None) as batch_op:
        batch_op.alter_column('department_id',
               existing_type=UUID(as_uuid=True),
               nullable=False)
