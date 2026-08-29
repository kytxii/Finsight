from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from datetime import date
from app.dependencies import get_db, get_current_user
from app.models import User
from app.schemas.credit_card import (
    CreditCardPaymentResponse,
    ChargeSummary,
    AllocateToNewCharge,
    AllocateExistingTransaction,
    CreateCreditCardPayment,
)
from app.services import credit_card_service
from app.services.credit_card_service import PaymentDetail

router = APIRouter(prefix="/credit-card-payments", tags=["credit-card-payments"])


def _to_response(detail: PaymentDetail) -> CreditCardPaymentResponse:
    return CreditCardPaymentResponse(
        id=detail.payment.id,
        name=detail.payment.name,
        total_amount=detail.payment.total_amount,
        payment_date=detail.payment.payment_date,
        due_date=detail.payment.due_date,
        paid=detail.paid,
        left=detail.left,
        charges=[
            ChargeSummary(
                id=info.charge.id,
                name=info.charge.name,
                total_amount=info.charge.total_amount,
                amount_paid=info.paid,
                category=info.charge.category,
                charge_date=info.charge.charge_date,
                settled=info.settled_transaction_id is not None,
                settled_transaction_id=info.settled_transaction_id,
            )
            for info in detail.charges
        ],
    )


@router.get("/", response_model=list[CreditCardPaymentResponse])
async def get_payments(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    details = await credit_card_service.get_payments(current_user.id, db)
    return [_to_response(d) for d in details]


@router.post("/", response_model=CreditCardPaymentResponse, status_code=201)
async def create_payment(
    data: CreateCreditCardPayment,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    detail = await credit_card_service.create_payment(data, current_user.id, db)
    return _to_response(detail)


@router.post("/from-transaction/{transaction_id}", response_model=CreditCardPaymentResponse, status_code=201)
async def create_payment_from_transaction(
    transaction_id: UUID, due_date: date | None = None,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    try:
        detail = await credit_card_service.create_payment_from_transaction(transaction_id, current_user.id, db, due_date=due_date)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _to_response(detail)


@router.get("/{payment_id}", response_model=CreditCardPaymentResponse)
async def get_payment(payment_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        detail = await credit_card_service.get_payment_detail(payment_id, current_user.id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _to_response(detail)


@router.post("/{payment_id}/allocate", response_model=CreditCardPaymentResponse)
async def allocate(payment_id: UUID, data: AllocateToNewCharge | AllocateExistingTransaction, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        if isinstance(data, AllocateExistingTransaction):
            detail = await credit_card_service.allocate_existing_transaction(payment_id, data, current_user.id, db)
        else:
            detail = await credit_card_service.allocate(payment_id, data, current_user.id, db)
    except credit_card_service.InvalidAllocationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _to_response(detail)


@router.delete("/{payment_id}", status_code=204)
async def delete_payment(payment_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        await credit_card_service.delete_payment(payment_id, current_user.id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{payment_id}/charges/{charge_id}", response_model=CreditCardPaymentResponse)
async def remove_charge(payment_id: UUID, charge_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        detail = await credit_card_service.remove_charge_from_payment(payment_id, charge_id, current_user.id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _to_response(detail)
