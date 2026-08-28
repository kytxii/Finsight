"""add due_date to credit_card_payments

Revision ID: 4818775aa5b0
Revises: 3a1e847d211c
Create Date: 2026-08-27 18:36:00.012163

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4818775aa5b0'
down_revision: Union[str, Sequence[str], None] = '3a1e847d211c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("credit_card_payments", sa.Column("due_date", sa.Date(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("credit_card_payments", "due_date")
