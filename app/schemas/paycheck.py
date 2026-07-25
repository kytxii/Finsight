from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime, date
from decimal import Decimal
from uuid import UUID
from app.models.paycheck_schedule import PaycheckFrequency

class PaycheckScheduleBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    frequency: PaycheckFrequency
    start_date: date

class CreatePaycheckSchedule(PaycheckScheduleBase):
    pass

class UpdatePaycheckSchedule(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    frequency: PaycheckFrequency | None = None
    start_date: date | None = None
    active: bool | None = None

class PaycheckScheduleResponse(PaycheckScheduleBase):
    id: UUID
    active: bool
    created_at: datetime
    created_by: UUID
    updated_at: datetime
    updated_by: UUID

    model_config = ConfigDict(from_attributes=True)

class UpdatePaycheckAmount(BaseModel):
    amount: Decimal = Field(gt=0)

class PaycheckResponse(BaseModel):
    id: UUID
    schedule_id: UUID
    schedule_name: str | None = None
    pay_date: date
    amount: Decimal | None
    estimated_amount: Decimal | None = None
    created_at: datetime
    created_by: UUID
    updated_at: datetime
    updated_by: UUID

    model_config = ConfigDict(from_attributes=True)

class PaycheckListResponse(BaseModel):
    paychecks: list[PaycheckResponse]
    pending_paychecks: list[PaycheckResponse]

class SpendableSurplusResponse(BaseModel):
    next_payday: date
    month_end: date
    spendable_surplus: Decimal
    free_to_allocate: Decimal
    bills_before_next_payday: Decimal
    next_payday_estimate: Decimal | None = None

class SetBalanceAnchor(BaseModel):
    current_balance: Decimal
    as_of_date: date

class BalanceAnchorResponse(BaseModel):
    id: UUID
    current_balance: Decimal
    as_of_date: date
    created_at: datetime
    created_by: UUID
    updated_at: datetime
    updated_by: UUID

    model_config = ConfigDict(from_attributes=True)

class RunningBalanceResponse(BaseModel):
    balance: Decimal
    as_of_date: date

class SetSpendingReserve(BaseModel):
    spending_reserve: Decimal = Field(ge=0)

class SpendingReserveResponse(BaseModel):
    spending_reserve: Decimal

class EstimatedSavingsResponse(BaseModel):
    month_start: date
    month_end: date
    estimated_savings: Decimal
    saved_so_far: Decimal
    projected_income: Decimal
    projected_spending: Decimal
    committed_recurring: Decimal
