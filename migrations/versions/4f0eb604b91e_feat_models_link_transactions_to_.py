"""feat(models): link transactions to installments

Revision ID: 4f0eb604b91e
Revises: d726d0205ce0
Create Date: 2026-08-11 00:00:00.000000

Lets installment_service.apply_installments auto-post a linked transaction
once an installment's due day has passed, same pattern as recurring payments.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4f0eb604b91e'
down_revision: Union[str, Sequence[str], None] = 'd726d0205ce0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('transactions', sa.Column('installment_id', sa.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(None, 'transactions', 'installments', ['installment_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(None, 'transactions', type_='foreignkey')
    op.drop_column('transactions', 'installment_id')
