from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from app.dependencies import get_db, get_current_user
from app.models import User
from app.schemas import CreateTipDeposit, UpdateTipDeposit, TipDepositResponse, CashOnHandResponse
from app.services import tip_deposit_service

router = APIRouter(prefix="/tip-deposits", tags=["tip-deposits"])


@router.post("/", response_model=TipDepositResponse, status_code=201)
async def create_tip_deposit(data: CreateTipDeposit, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await tip_deposit_service.create_tip_deposit(data, current_user.id, db)


@router.get("/", response_model=list[TipDepositResponse])
async def get_tip_deposits(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await tip_deposit_service.get_tip_deposits(current_user.id, db)


@router.get("/cash-on-hand", response_model=CashOnHandResponse)
async def get_cash_on_hand(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await tip_deposit_service.get_cash_on_hand(current_user.id, db)
    return CashOnHandResponse(
        cash_on_hand=result.cash_on_hand,
        tips_earned=result.tips_earned,
        tips_deposited=result.tips_deposited,
    )


@router.patch("/{deposit_id}", response_model=TipDepositResponse)
async def update_tip_deposit(deposit_id: UUID, data: UpdateTipDeposit, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await tip_deposit_service.update_tip_deposit(deposit_id, data, current_user.id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{deposit_id}", status_code=204)
async def delete_tip_deposit(deposit_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        await tip_deposit_service.delete_tip_deposit(deposit_id, current_user.id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
