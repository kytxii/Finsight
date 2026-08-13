from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from app.dependencies import get_db, get_current_user
from app.models import User
from app.schemas.recurring_payment import (
    CreateRecurringPayment,
    RecurringPaymentResponse,
    UpdateRecurringPayment,
    ConfirmRecurringPayment,
    UpcomingRecurringPaymentResponse,
)
from app.schemas.transaction import TransactionResponse
from app.services import recurring_payment_service, transaction_service

router = APIRouter(prefix="/recurring-payments", tags=["recurring-payments"])

@router.get("/", response_model=list[RecurringPaymentResponse])
async def get_recurring_payments(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await recurring_payment_service.get_recurring_payments(current_user.id, db)
    return result

# Declared before /{recurring_payment_id} - a literal path must win over the
# UUID-typed param route, or "upcoming" fails UUID parsing.
@router.get("/upcoming", response_model=list[UpcomingRecurringPaymentResponse])
async def get_upcoming_recurring_payments(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await transaction_service.get_upcoming_recurring_payments(current_user.id, db)
    return result

@router.get("/{recurring_payment_id}", response_model=RecurringPaymentResponse)
async def get_recurring_payment_by_id(recurring_payment_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        result = await recurring_payment_service.get_recurring_payment_by_id(recurring_payment_id, current_user.id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return result

@router.post("/", response_model=RecurringPaymentResponse, status_code=201)
async def create_recurring_payments(recurring_payment: CreateRecurringPayment, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        result = await recurring_payment_service.create_recurring_payment(recurring_payment, current_user.id, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result

@router.patch("/{recurring_payment_id}", response_model=RecurringPaymentResponse)
async def update_recurring_payments(recurring_payment_id: UUID, data: UpdateRecurringPayment, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        result = await recurring_payment_service.update_recurring_payment(recurring_payment_id, data, current_user.id, db)
    except recurring_payment_service.InvalidRecurringPaymentError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return result

@router.delete("/{recurring_payment_id}", status_code=204)
async def delete_recurring_payment(recurring_payment_id: UUID , current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        result = await recurring_payment_service.delete_recurring_payment(recurring_payment_id, current_user.id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return result

@router.post("/{recurring_payment_id}/confirm", response_model=TransactionResponse)
async def confirm_pending_bill(recurring_payment_id: UUID, data: ConfirmRecurringPayment, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        result = await transaction_service.confirm_pending_bill(recurring_payment_id, data.amount, current_user.id, db)
    except transaction_service.InvalidRecurringPaymentError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return result

@router.post("/{recurring_payment_id}/skip", status_code=204)
async def skip_pending_bill(recurring_payment_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        await transaction_service.skip_pending_bill(recurring_payment_id, current_user.id, db)
    except transaction_service.InvalidRecurringPaymentError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
