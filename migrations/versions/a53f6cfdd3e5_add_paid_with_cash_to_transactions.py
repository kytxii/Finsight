"""feat(models): add paid_with_cash to transactions

Revision ID: a53f6cfdd3e5
Revises: 4818775aa5b0
Create Date: 2026-08-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a53f6cfdd3e5'
down_revision: Union[str, Sequence[str], None] = '4818775aa5b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('transactions', sa.Column('paid_with_cash', sa.Boolean(), server_default=sa.false(), nullable=False))
    # Drop the server default now that existing rows are backfilled - new rows
    # rely on the SQLAlchemy-level default, matching the other boolean columns.
    op.alter_column('transactions', 'paid_with_cash', server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('transactions', 'paid_with_cash')
