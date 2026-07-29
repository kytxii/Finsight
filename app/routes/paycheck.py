from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from decimal import Decimal
from app.dependencies import get_db, get_current_user
from app.models import User
from app.schemas.paycheck import (
    CreatePaycheckSchedule,
    UpdatePaycheckSchedule,
    PaycheckScheduleResponse,
    UpdatePaycheckAmount,
    PaycheckResponse,
    PaycheckListResponse,
    SpendableSurplusResponse,
    BillBreakdownItem,
    SetBalanceAnchor,
    BalanceAnchorResponse,
    RunningBalanceResponse,
    SetSpendingReserve,
    SpendingReserveResponse,
    EstimatedSavingsResponse,
)
from app.services import paycheck_service

router = APIRouter(prefix="/paychecks", tags=["paychecks"])

@router.post("/schedules", response_model=PaycheckScheduleResponse, status_code=201)
async def create_paycheck_schedule(schedule: CreatePaycheckSchedule, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await paycheck_service.create_paycheck_schedule(schedule, current_user.id, db)
    return result

@router.get("/schedules", response_model=list[PaycheckScheduleResponse])
async def get_paycheck_schedules(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await paycheck_service.get_paycheck_schedules(current_user.id, db)
    return result

@router.patch("/schedules/{schedule_id}", response_model=PaycheckScheduleResponse)
async def update_paycheck_schedule(schedule_id: UUID, data: UpdatePaycheckSchedule, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        result = await paycheck_service.update_paycheck_schedule(schedule_id, data, current_user.id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return result

@router.delete("/schedules/{schedule_id}", status_code=204)
async def delete_paycheck_schedule(schedule_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        result = await paycheck_service.delete_paycheck_schedule(schedule_id, current_user.id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return result

@router.get("/", response_model=PaycheckListResponse)
async def get_paychecks(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    paychecks, pending = await paycheck_service.get_paychecks(current_user.id, db)
    return PaycheckListResponse(paychecks=paychecks, pending_paychecks=pending)

@router.get("/spendable-surplus", response_model=SpendableSurplusResponse)
async def get_spendable_surplus(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        result = await paycheck_service.get_spendable_surplus(current_user.id, current_user.spending_reserve or Decimal("0"), db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return SpendableSurplusResponse(
        next_payday=result.next_payday,
        month_end=result.month_end,
        spendable_surplus=result.spendable_surplus,
        free_to_allocate=result.free_to_allocate,
        bills_before_next_payday=result.bills_before_next_payday,
        next_payday_estimate=result.next_payday_estimate,
        running_balance=result.running_balance,
        projected_income=result.projected_income,
        bills_before_month_end=result.bills_before_month_end,
        bills_breakdown=[
            BillBreakdownItem(
                name=b.name,
                amount=b.amount,
                day_of_month=b.day_of_month,
                due_date=b.due_date,
                category=b.category.value,
            )
            for b in result.bills_breakdown
        ],
    )

@router.get("/savings", response_model=EstimatedSavingsResponse)
async def get_estimated_savings(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        result = await paycheck_service.get_estimated_savings(current_user.id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return EstimatedSavingsResponse(
        month_start=result.month_start,
        month_end=result.month_end,
        estimated_savings=result.estimated_savings,
        saved_so_far=result.saved_so_far,
        projected_income=result.projected_income,
        projected_spending=result.projected_spending,
        committed_recurring=result.committed_recurring,
    )

@router.get("/balance", response_model=BalanceAnchorResponse | None)
async def get_balance_anchor(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await paycheck_service.get_balance_anchor(current_user.id, db)
    return result

@router.put("/balance", response_model=BalanceAnchorResponse)
async def set_balance_anchor(data: SetBalanceAnchor, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await paycheck_service.set_balance_anchor(data, current_user.id, db)
    return result

@router.get("/running-balance", response_model=RunningBalanceResponse)
async def get_running_balance(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        result = await paycheck_service.get_running_balance(current_user.id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return RunningBalanceResponse(balance=result.balance, as_of_date=result.as_of_date)

@router.get("/reserve", response_model=SpendingReserveResponse)
async def get_spending_reserve(current_user: User = Depends(get_current_user)):
    result = await paycheck_service.get_spending_reserve(current_user)
    return SpendingReserveResponse(spending_reserve=result)

@router.patch("/reserve", response_model=SpendingReserveResponse)
async def set_spending_reserve(data: SetSpendingReserve, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await paycheck_service.set_spending_reserve(data, current_user, db)
    return SpendingReserveResponse(spending_reserve=result)

@router.patch("/{paycheck_id}", response_model=PaycheckResponse)
async def update_paycheck_amount(paycheck_id: UUID, data: UpdatePaycheckAmount, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        result = await paycheck_service.update_paycheck_amount(paycheck_id, data, current_user.id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return result
