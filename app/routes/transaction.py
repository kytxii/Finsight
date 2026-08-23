from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from app.dependencies import get_db, get_current_user
from app.models import User
from app.schemas.transaction import CreateTransaction, TransactionResponse, UpdateTransaction
from app.services import transaction_service

router = APIRouter(prefix="/transactions", tags=["transactions"])

@router.get("/", response_model=list[TransactionResponse])
async def get_transactions(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await transaction_service.apply_recurring_payments(current_user.id, db)
    await transaction_service.apply_installments(current_user.id, db)
    result = await transaction_service.get_transactions(current_user.id, db)
    return result

@router.get("/{transaction_id}", response_model=TransactionResponse)
async def get_transaction_by_id(transaction_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        result = await transaction_service.get_transaction_by_id(transaction_id, current_user.id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return result

@router.post("/", response_model=TransactionResponse, status_code=201)
async def create_transaction(transaction: CreateTransaction, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        result = await transaction_service.create_transaction(transaction, current_user.id, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result

@router.patch("/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(transaction_id: UUID, data: UpdateTransaction, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        result = await transaction_service.update_transaction(transaction_id, data, current_user.id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return result

@router.delete("/{transaction_id}", status_code=204)
async def delete_transaction(transaction_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        result = await transaction_service.delete_transaction(transaction_id, current_user.id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return result