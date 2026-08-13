from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from datetime import date
import calendar
from app.models import RecurringPayment, Transaction
from app.schemas import CreateRecurringPayment, UpdateRecurringPayment

# Fields that also exist on Transaction - the only ones safe to mirror onto a
# linked transaction when a recurring payment is edited.
_TRANSACTION_MIRROR_FIELDS = {"name", "amount", "category"}

class InvalidRecurringPaymentError(ValueError):
    pass

async def get_recurring_payments(current_user: UUID, db: AsyncSession):
    result = await db.execute(select(RecurringPayment).where(
        RecurringPayment.created_by == current_user,
        RecurringPayment.active.is_(True),
    ))
    return result.scalars().all()

async def get_recurring_payment_by_id(recurring_payment_id: UUID, current_user: UUID, db: AsyncSession):
    result = await db.execute(select(RecurringPayment).where(RecurringPayment.id == recurring_payment_id))
    recurring_payment = result.scalar_one_or_none()

    if recurring_payment is None:
        raise ValueError("Recurring payment not found")
    if recurring_payment.created_by != current_user:
        raise ValueError("Recurring payment not found")

    return recurring_payment

async def create_recurring_payment(recurring_payment: CreateRecurringPayment, current_user: UUID, db: AsyncSession):
    data = recurring_payment.model_dump()
    new_recurring_payment = RecurringPayment(**data, created_by=current_user, updated_by=current_user)

    db.add(new_recurring_payment)
    await db.commit()
    await db.refresh(new_recurring_payment)
    return new_recurring_payment

async def update_recurring_payment(recurring_payment_id: UUID, data: UpdateRecurringPayment, current_user: UUID, db: AsyncSession):
      result = await db.execute(select(RecurringPayment).where(RecurringPayment.id == recurring_payment_id))
      recurring_payment = result.scalar_one_or_none()

      if recurring_payment is None:
          raise ValueError("Recurring payment not found")
      if recurring_payment.created_by != current_user:
          raise ValueError("Recurring payment not found")

      changes = data.model_dump(exclude_unset=True)
      for key, value in changes.items():
          setattr(recurring_payment, key, value)
      recurring_payment.updated_by = current_user

      today = date.today()
      month_start = today.replace(day=1)
      month_end = today.replace(day=calendar.monthrange(today.year, today.month)[1])

      result = await db.execute(select(Transaction).where(
              Transaction.recurring_payment_id == recurring_payment_id,
              Transaction.transaction_date >= month_start,
              Transaction.transaction_date <= month_end,
              ))
      linked = result.scalars().first()
      if linked:
          for key, value in changes.items():
              if key in _TRANSACTION_MIRROR_FIELDS:
                  setattr(linked, key, value)

      await db.commit()
      await db.refresh(recurring_payment)
      return recurring_payment

async def delete_recurring_payment(recurring_payment_id: UUID, current_user: UUID, db: AsyncSession):
    result = await db.execute(select(RecurringPayment).where(RecurringPayment.id == recurring_payment_id))
    recurring_payment = result.scalar_one_or_none()

    if recurring_payment is None:
        raise ValueError("Recurring payment not found")
    if recurring_payment.created_by != current_user:
        raise ValueError("Recurring payment not found")

    # Soft-deactivate rather than hard delete - preserves transactions.recurring_payment_id history.
    recurring_payment.active = False
    recurring_payment.updated_by = current_user
    await db.commit()
