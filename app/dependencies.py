from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import jwt
import uuid
from app.database import AsyncSessionLocal
from app.models import User
from app.core.security import decode_access_token
from app.services import user_service

security = HTTPBearer()
                                                                            
async def get_db():
    async with AsyncSessionLocal() as session:                               
        yield session

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: AsyncSession = Depends(get_db)) -> User:
    try:
        user_id = decode_access_token(credentials.credentials)
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    return user


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Gate for admin-only endpoints. Nothing uses it yet - the dev tools panel
    is entirely client-side - but hiding UI is not access control, so the first
    server-backed admin endpoint should not have to invent this under pressure."""
    if not user_service.is_admin(current_user.email_address):
        raise HTTPException(status_code=403, detail="Forbidden")
    return current_user
