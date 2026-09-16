from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime, date
from decimal import Decimal
from uuid import UUID


class CreateTipDeposit(BaseModel):
    amount: Decimal = Field(gt=0)
    deposit_date: date
    # Client-generated for offline creates (#204) - see sync_utils.find_existing_for_replay.
    id: UUID | None = None


class UpdateTipDeposit(BaseModel):
    amount: Decimal | None = Field(default=None, gt=0)
    deposit_date: date | None = None


class TipDepositResponse(BaseModel):
    id: UUID
    amount: Decimal
    deposit_date: date
    created_at: datetime
    created_by: UUID
    updated_at: datetime
    updated_by: UUID

    model_config = ConfigDict(from_attributes=True)


class CashOnHandResponse(BaseModel):
    cash_on_hand: Decimal
    tips_earned: Decimal
    tips_deposited: Decimal
