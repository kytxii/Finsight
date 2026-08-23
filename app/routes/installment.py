from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from app.dependencies import get_db, get_current_user
from app.models import User
from app.schemas import (
    CreateInstallment,
    UpdateInstallment,
    InstallmentResponse,
    InstallmentInsightsResponse,
)
from app.services import installment_service

router = APIRouter(prefix="/installments", tags=["installments"])


@router.get("/", response_model=list[InstallmentResponse])
async def get_installments(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await installment_service.get_installments(current_user.id, db)


@router.get("/{installment_id}", response_model=InstallmentResponse)
async def get_installment_by_id(installment_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await installment_service.get_installment_by_id(installment_id, current_user.id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{installment_id}/insights", response_model=InstallmentInsightsResponse)
async def get_installment_insights(installment_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        result = await installment_service.get_installment_insights(installment_id, current_user, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return InstallmentInsightsResponse(
        available=result.available,
        reason=result.reason,
        monthly_payment=result.monthly_payment,
        available_cash=result.available_cash,
        ratio=result.ratio,
        status=result.status,
    )


@router.post("/", response_model=InstallmentResponse, status_code=201)
async def create_installment(data: CreateInstallment, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await installment_service.create_installment(data, current_user.id, db)


@router.patch("/{installment_id}", response_model=InstallmentResponse)
async def update_installment(installment_id: UUID, data: UpdateInstallment, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await installment_service.update_installment(installment_id, data, current_user.id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{installment_id}", status_code=204)
async def delete_installment(installment_id: UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        await installment_service.delete_installment(installment_id, current_user.id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
