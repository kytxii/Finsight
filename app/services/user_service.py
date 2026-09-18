from sqlalchemy.ext.asyncio import AsyncSession
from app.models import User
from app.schemas import UpdateUser, UserResponse
from app.core.config import settings


def is_admin(email_address: str) -> bool:
    return email_address in settings.ADMIN_EMAILS


def to_user_response(user: User) -> UserResponse:
    """UserResponse.is_admin has no backing column, so building the response
    straight off the ORM object would silently leave it False everywhere.
    Every route returning a UserResponse goes through here."""
    response = UserResponse.model_validate(user)
    response.is_admin = is_admin(user.email_address)
    return response


async def update_user(data: UpdateUser, current_user: User, db: AsyncSession):
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(current_user, key, value)
    await db.commit()
    await db.refresh(current_user)
    return current_user

async def delete_user(current_user: User, db: AsyncSession):
    await db.delete(current_user)
    await db.commit()