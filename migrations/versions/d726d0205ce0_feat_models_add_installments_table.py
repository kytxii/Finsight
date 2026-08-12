"""feat(models): add installments table

Revision ID: d726d0205ce0
Revises: e5f1a2c3d4b6
Create Date: 2026-08-11 00:00:00.000000

Fixed-term payment obligations (debt or fixed-term purchases). Auto-posts to
the transactions feed once a term and due day are set and the day has passed,
same opportunistic pattern as recurring payments - stops once paid off.
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy.dialects.postgresql import ENUM as PGEnum
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd726d0205ce0'
down_revision: Union[str, Sequence[str], None] = 'e5f1a2c3d4b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'installments',
        sa.Column('id', sa.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('total_amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('period_months', sa.Integer(), nullable=True),
        sa.Column('monthly_payment', sa.Numeric(10, 2), nullable=True),
        sa.Column('day_of_month', sa.Integer(), nullable=True),
        sa.Column('category', PGEnum(name='category', create_type=False), nullable=False),
        sa.Column('payments_made', sa.Integer(), nullable=False),
        sa.Column('last_applied_month', sa.String(length=7), nullable=True),
        sa.Column('active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_by', sa.UUID(as_uuid=True), nullable=False),
        sa.Column('updated_by', sa.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('installments')
