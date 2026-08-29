from pydantic import BaseModel, ConfigDict, Field
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


# A new charge is always allocated in full against the payment it's added to
# (#147) - there's no partial/rollover concept, so there's nothing here to
# say how much of it this payment covers.
class AllocateToNewCharge(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    total_amount: Decimal = Field(gt=0)
    category: Category
    charge_date: date


# A third allocate shape: reuse an existing, unlinked transaction as the
# charge instead of retyping it. Always applied in full - the point is that
# this transaction already IS the charge, not a fresh partial payment toward
# a new one - so there's no amount_applied to set.
class AllocateExistingTransaction(BaseModel):
    transaction_id: UUID
