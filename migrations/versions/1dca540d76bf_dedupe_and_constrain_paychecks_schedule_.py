"""dedupe and constrain paychecks (schedule_id, pay_date)

Revision ID: 1dca540d76bf
Revises: f8c54bb87b0d
Create Date: 2026-08-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '1dca540d76bf'
down_revision: Union[str, Sequence[str], None] = 'f8c54bb87b0d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # _backfill_paychecks does a check-then-insert with no DB-level guard - two
    # concurrent requests can both see a pay_date as missing and both insert
    # it. Clean up existing duplicates first (keep the row with an amount set
    # if one exists, else the oldest) before the unique constraint can go on.
    op.execute("""
        WITH ranked AS (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY schedule_id, pay_date
                       ORDER BY (amount IS NULL) ASC, created_at ASC, id ASC
                   ) AS rn
            FROM paychecks
        )
        DELETE FROM paychecks WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
    """)
    op.create_unique_constraint('uq_paychecks_schedule_id_pay_date', 'paychecks', ['schedule_id', 'pay_date'])


def downgrade() -> None:
    op.drop_constraint('uq_paychecks_schedule_id_pay_date', 'paychecks', type_='unique')
