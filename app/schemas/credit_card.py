from pydantic import BaseModel, ConfigDict, Field, model_validator
from datetime import date
from decimal import Decimal
from uuid import UUID
from app.models.category import Category


class ChargeSummary(BaseModel):
    id: UUID
    name: str
    total_amount: Decimal
    amount_paid: Decimal
    category: Category
    charge_date: date
    settled: bool
    settled_transaction_id: UUID | None

    model_config = ConfigDict(from_attributes=True)


class CreditCardPaymentResponse(BaseModel):
    id: UUID
    name: str
    total_amount: Decimal
    payment_date: date
    due_date: date | None
    paid: Decimal
    left: Decimal
    charges: list[ChargeSummary]

    model_config = ConfigDict(from_attributes=True)


# A plain balance with no linked transaction (#54 follow-up) - distinct from
# create_payment_from_transaction, which anchors the payment to real money
# that's already left the account.
class CreateCreditCardPayment(BaseModel):
    total_amount: Decimal = Field(gt=0)
    payment_date: date
    due_date: date | None = None


class PendingChargeResponse(BaseModel):
    id: UUID
    name: str
    total_amount: Decimal
    amount_paid: Decimal
    remaining: Decimal
    category: Category
    charge_date: date

    model_config = ConfigDict(from_attributes=True)


# Allocate toward either an existing pending charge (charge_id set) or a new
# one (name/total_amount/category/charge_date set) - exactly one shape, not
# a mix, so the service doesn't have to guess intent from a partial payload.
class AllocateToCharge(BaseModel):
    charge_id: UUID
    amount_applied: Decimal = Field(gt=0)


class AllocateToNewCharge(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    total_amount: Decimal = Field(gt=0)
    category: Category
    charge_date: date
    amount_applied: Decimal = Field(gt=0)

    @model_validator(mode="after")
    def amount_applied_within_charge_total(self) -> "AllocateToNewCharge":
        if self.amount_applied > self.total_amount:
            raise ValueError("amount_applied cannot exceed the charge's total_amount")
        return self


# A third allocate shape: reuse an existing, unlinked transaction as the
# charge instead of retyping it. Always applied in full - the point is that
# this transaction already IS the charge, not a fresh partial payment toward
# a new one - so there's no amount_applied to set.
class AllocateExistingTransaction(BaseModel):
    transaction_id: UUID
