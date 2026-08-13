from pydantic import BaseModel, ConfigDict, Field, field_validator
from datetime import datetime, date
from decimal import Decimal
from typing import Literal
from uuid import UUID
from app.models.category import Category

# Recurring payments generate scheduled outflows (plus REIMBURSEMENT). INCOME is
# blocked because PaycheckSchedule already generates Category.INCOME transactions
# (paycheck_service.py) - two systems producing scheduled income risks double
# counting in the spendable-surplus math. TIPS is blocked because it has
# cash-on-hand semantics (_balance_delta returns 0 for it) that a scheduled
# recurring payment doesn't model.
_BLOCKED_CATEGORIES = {Category.INCOME, Category.TIPS}

def _reject_income_and_tips(category: Category | None) -> Category | None:
    if category in _BLOCKED_CATEGORIES:
        raise ValueError(f"{category.value} is not a valid category for a recurring payment")
    return category

class RecurringPaymentBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    amount: Decimal
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    category: Category
    is_estimate: bool = False
    active: bool = True

    @field_validator("category")
    @classmethod
    def check_category_allowed(cls, v: Category) -> Category:
        return _reject_income_and_tips(v)

class CreateRecurringPayment(RecurringPaymentBase):
    pass

class UpdateRecurringPayment(BaseModel):
    name: str | None =  Field(default=None, min_length=1, max_length=100)
    amount: Decimal | None = None
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    category: Category | None = None
    is_estimate: bool | None = None
    active: bool | None = None

    @field_validator("category")
    @classmethod
    def check_category_allowed(cls, v: Category | None) -> Category | None:
        return _reject_income_and_tips(v)

class RecurringPaymentResponse(RecurringPaymentBase):
    id: UUID
    created_at: datetime
    created_by: UUID
    updated_at: datetime
    updated_by: UUID

    model_config = ConfigDict(from_attributes=True)

class ConfirmRecurringPayment(BaseModel):
    amount: Decimal = Field(gt=0)

class UpcomingRecurringPaymentResponse(BaseModel):
    id: UUID
    name: str
    category: Category
    due_date: date
    status: Literal["paid", "skipped", "pending", "upcoming"]
    is_estimate: bool
    amount: Decimal
    actual_amount: Decimal | None = None
    estimated_amount: Decimal | None = None

    model_config = ConfigDict(from_attributes=True)
