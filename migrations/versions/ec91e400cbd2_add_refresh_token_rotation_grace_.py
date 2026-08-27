"""fix(auth): add refresh token rotation grace columns

Revision ID: ec91e400cbd2
Revises: 1dca540d76bf
Create Date: 2026-08-26

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'ec91e400cbd2'
down_revision: Union[str, Sequence[str], None] = '1dca540d76bf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('refresh_tokens', sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('refresh_tokens', sa.Column('replaced_by_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_refresh_tokens_replaced_by_id',
        'refresh_tokens', 'refresh_tokens',
        ['replaced_by_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_refresh_tokens_replaced_by_id', 'refresh_tokens', type_='foreignkey')
    op.drop_column('refresh_tokens', 'replaced_by_id')
    op.drop_column('refresh_tokens', 'revoked_at')
