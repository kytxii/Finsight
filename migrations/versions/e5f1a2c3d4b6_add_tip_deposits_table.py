"""feat(models): add tip_deposits table

Revision ID: e5f1a2c3d4b6
Revises: 45699d99feb9
Create Date: 2026-07-29 14:00:00.000000

Lump-sum cash deposits into checking, logged separately from tip entries.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f1a2c3d4b6'
down_revision: Union[str, Sequence[str], None] = '45699d99feb9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'tip_deposits',
        sa.Column('id', sa.UUID(as_uuid=True), nullable=False),
        sa.Column('amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('deposit_date', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_by', sa.UUID(as_uuid=True), nullable=False),
        sa.Column('updated_by', sa.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('tip_deposits')
