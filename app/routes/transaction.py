from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from app.dependencies import get_db, get_current_user
from app.models import User
from app.schemas.transaction import CreateTransaction, TransactionResponse, UpdateTransaction
from app.schemas.tip_deposit import TipDepositResponse
from app.services import transaction_service, tip_deposit_service

router = APIRouter(prefix="/transactions", tags=["transactions"])

@router.get("/", response_model=list[TransactionResponse])
async def get_transactions(
    limit: int = Query(500, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # apply_recurring_payments/apply_installments both materialize new
    # transaction rows as a side effect of this GET (#110) - gated to the
    # first page so paging through results doesn't re-run them once per page
    # for no reason. A client that only ever requests offset > 0 would miss
    # this entirely; neither dashboard does that today.
    if offset == 0:
        await transaction_service.apply_recurring_payments(current_user.id, db)
        await transaction_service.apply_installments(current_user.id, db)
    result = await transaction_service.get_transactions(current_user.id, db, limit, offset)
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

@router.post("/{transaction_id}/convert-to-tip-deposit", response_model=TipDepositResponse)
async def convert_transaction_to_tip_deposit(transaction_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await tip_deposit_service.convert_transaction_to_tip_deposit(transaction_id, current_user.id, db)
    except ValueError as e:
        status_code = 404 if str(e) == "Transaction not found" else 400
        raise HTTPException(status_code=status_code, detail=str(e))