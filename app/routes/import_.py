from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies import get_db, get_current_user
from app.models import User
from app.schemas.transaction import TransactionResponse
from app.schemas.tip_deposit import TipDepositResponse
from app.schemas.import_profile import (
    ImportPreviewResponse,
    ImportCommitRequest,
    ImportCommitResponse,
    AiCleanupRequest,
    AiCleanupResponse,
)
from app.services import import_service
from app.services.ai_name_cleanup import suggest_clean_names, AiCleanupUnavailable

router = APIRouter(prefix="/imports", tags=["imports"])

def _is_pdf(file: UploadFile) -> bool:
    if file.content_type == "application/pdf":
        return True
    return (file.filename or "").lower().endswith(".pdf")

@router.post("/preview", response_model=ImportPreviewResponse)
async def preview_import(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    file_bytes = await file.read()
    try:
        if _is_pdf(file):
            result = await import_service.parse_pdf_preview(file_bytes, current_user.id, db)
        else:
            result = await import_service.parse_csv_preview(file_bytes, current_user.id, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result

@router.post("/commit", response_model=ImportCommitResponse)
async def commit_import(data: ImportCommitRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        created, created_deposits = await import_service.commit_import(
            data.rows, data.tip_deposit_rows, current_user.id, db,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ImportCommitResponse(
        created_count=len(created),
        transactions=[TransactionResponse.model_validate(t) for t in created],
        tip_deposits_created=len(created_deposits),
        tip_deposits=[TipDepositResponse.model_validate(t) for t in created_deposits],
    )

@router.post("/ai-cleanup", response_model=AiCleanupResponse)
async def ai_cleanup_names(data: AiCleanupRequest, current_user: User = Depends(get_current_user)):
    try:
        suggestions = await suggest_clean_names(data.names)
    except AiCleanupUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    return AiCleanupResponse(suggestions=suggestions)
