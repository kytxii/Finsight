from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


class IdConflictError(ValueError):
    """A client-supplied id already exists and belongs to someone else.

    UUID4 collisions are astronomically unlikely - this exists to fail loudly
    rather than silently hand back another user's row, not because it's
    expected to fire.
    """


async def find_existing_for_replay(model, id_: UUID | None, current_user: UUID, db: AsyncSession):
    """Idempotent-create support for offline write sync (#204).

    A client generates its own row id while offline (every model's primary
    key already defaults to uuid4, so there is nothing server-side that needs
    to invent one). If the create request that minted a row succeeded but its
    response never reached the client - the tab closed mid-drain, the network
    dropped after the commit - the outbox retries the same create with the
    same id. Without this, that retry either 500s on a duplicate primary key
    or silently creates a second row with a new id, duplicating the entry in
    the user's books.

    Call at the top of every create_* service function. `id_` is None on the
    ordinary online path, where nothing changes.
    """
    if id_ is None:
        return None

    existing = await db.scalar(select(model).where(model.id == id_))
    if existing is None:
        return None
    if existing.created_by != current_user:
        raise IdConflictError("id already in use")
    return existing
