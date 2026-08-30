"""feat(models): add credit card payment allocation tables

Revision ID: 3a1e847d211c
Revises: ec91e400cbd2
Create Date: 2026-08-27 02:12:22.753893

Lets a lump-sum credit card payment transaction be broken down into the
itemized, categorized charges it settles - see CreditCardPayment,
CreditCardCharge, and CreditCardChargeAllocation for the shape (#54).

Note: this file was hand-trimmed after autogenerate. autogenerate also
surfaced unrelated pre-existing drift between the live schema and prior
migrations (a dropped import_profiles table, an oauth_accounts index, and
constraint differences on paychecks/refresh_tokens) - none of that belongs
to this change, so it's deliberately left out here.
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy.dialects.postgresql import ENUM as PGEnum
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '3a1e847d211c'
down_revision: Union[str, Sequence[str], None] = 'ec91e400cbd2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'credit_card_charges',
        sa.Column('id', sa.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('total_amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('category', PGEnum(name='category', create_type=False), nullable=False),
        sa.Column('charge_date', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_by', sa.UUID(as_uuid=True), nullable=False),
        sa.Column('updated_by', sa.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'credit_card_payments',
        sa.Column('id', sa.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('total_amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('payment_date', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_by', sa.UUID(as_uuid=True), nullable=False),
        sa.Column('updated_by', sa.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'credit_card_charge_allocations',
        sa.Column('id', sa.UUID(as_uuid=True), nullable=False),
        sa.Column('charge_id', sa.UUID(as_uuid=True), nullable=False),
        sa.Column('payment_id', sa.UUID(as_uuid=True), nullable=False),
        sa.Column('amount_applied', sa.Numeric(10, 2), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_by', sa.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(['charge_id'], ['credit_card_charges.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['payment_id'], ['credit_card_payments.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.add_column('transactions', sa.Column('credit_card_payment_id', sa.UUID(as_uuid=True), nullable=True))
    op.add_column('transactions', sa.Column('credit_card_charge_id', sa.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(None, 'transactions', 'credit_card_payments', ['credit_card_payment_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key(None, 'transactions', 'credit_card_charges', ['credit_card_charge_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('transactions_credit_card_payment_id_fkey', 'transactions', type_='foreignkey')
    op.drop_constraint('transactions_credit_card_charge_id_fkey', 'transactions', type_='foreignkey')
    op.drop_column('transactions', 'credit_card_charge_id')
    op.drop_column('transactions', 'credit_card_payment_id')
    op.drop_table('credit_card_charge_allocations')
    op.drop_table('credit_card_payments')
    op.drop_table('credit_card_charges')
