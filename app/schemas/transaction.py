from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime, date
from decimal import Decimal
from uuid import UUID
from app.models.category import Category

class TransactionBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    amount: Decimal
    transaction_date: date
    category: Category
    note: str | None = Field(default=None, max_length=100)

class CreateTransaction(TransactionBase):
    pass

class UpdateTransaction(TransactionBase):
    name: str | None = None
    amount: Decimal | None = None
    transaction_date: date | None = None
    category: Category | None = None

class TransactionResponse(TransactionBase):
    id: UUID
    created_at: datetime
    created_by: UUID
    updated_at: datetime
    updated_by: UUID
    recurring_payment_id: UUID | None = None
    paycheck_id: UUID | None = None
    installment_id: UUID | None = None
    credit_card_payment_id: UUID | None = None
    credit_card_charge_id: UUID | None = None

    model_config = ConfigDict(from_attributes=True)