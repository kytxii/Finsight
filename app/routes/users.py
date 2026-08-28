from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies import get_db, get_current_user
from app.models.user import User
from app.schemas import UpdateUser, UserResponse
from app.services import user_service, auth_service
from app.core.oauth import OAUTH_PROVIDERS

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/me", response_model=UserResponse)
async def get_user(current_user: User = Depends(get_current_user)):
    return current_user

@router.patch("/me", response_model=UserResponse)
async def update_user(data: UpdateUser, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await user_service.update_user(data, current_user, db)
    return result

@router.delete("/me", status_code=204)
async def delete_user(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await user_service.delete_user(current_user, db)

@router.get("/me/connections", response_model=list[str])
async def get_connections(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await auth_service.get_linked_providers(db, current_user.id)

@router.post("/me/connections/{provider}/start", status_code=204)
async def start_link_provider(provider: str, request: Request, current_user: User = Depends(get_current_user)):
    if provider not in OAUTH_PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown provider")
    request.session["link_user_id"] = str(current_user.id)

@router.delete("/me/connections/{provider}", status_code=204)
async def unlink_provider(provider: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await auth_service.unlink_oauth_account(db, provider, current_user)
