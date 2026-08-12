from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from decimal import Decimal
from uuid import UUID
from app.models.category import Category


class InstallmentBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    total_amount: Decimal = Field(gt=0)
    period_months: int | None = Field(default=None, ge=1, le=480)
    day_of_month: int | None = Field(default=None, ge=1, le=31)


class CreateInstallment(InstallmentBase):
    pass


class UpdateInstallment(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    total_amount: Decimal | None = Field(default=None, gt=0)
    period_months: int | None = Field(default=None, ge=1, le=480)
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    active: bool | None = None


class InstallmentResponse(InstallmentBase):
    id: UUID
    monthly_payment: Decimal | None
    category: Category
    payments_made: int
    active: bool
    created_at: datetime
    created_by: UUID
    updated_at: datetime
    updated_by: UUID

    model_config = ConfigDict(from_attributes=True)


# Gain-insights - always 200 (installment-not-found aside); "available" is a
# legitimate widget state, not an error, when there isn't enough budget data
# yet, or when the installment itself has no term set yet.
class InstallmentInsightsResponse(BaseModel):
    available: bool
    reason: str | None = None
    monthly_payment: Decimal | None = None
    available_cash: Decimal | None = None
    ratio: Decimal | None = None
    status: str | None = None  # "dark_green" | "green" | "yellow" | "orange" | "red"
