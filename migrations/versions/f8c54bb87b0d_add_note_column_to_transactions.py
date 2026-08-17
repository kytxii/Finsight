"""add note column to transactions

Revision ID: f8c54bb87b0d
Revises: 4f0eb604b91e
Create Date: 2026-08-16 22:31:44.418606

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f8c54bb87b0d'
down_revision: Union[str, Sequence[str], None] = '4f0eb604b91e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('transactions', sa.Column('note', sa.String(length=100), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('transactions', 'note')
