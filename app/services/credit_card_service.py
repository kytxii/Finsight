from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from decimal import Decimal
from datetime import date
from typing import NamedTuple
from app.models import CreditCardPayment, CreditCardCharge, CreditCardChargeAllocation, Transaction
from app.schemas.credit_card import AllocateToCharge, AllocateToNewCharge, AllocateExistingTransaction, CreateCreditCardPayment


class InvalidAllocationError(Exception):
    """A business-rule violation on allocate (amount exceeds what's left,
    charge already settled) - distinct from ValueError's not-found meaning,
    same split as transaction_service.InvalidRecurringPaymentError."""


async def _get_owned_payment(payment_id: UUID, current_user: UUID, db: AsyncSession) -> CreditCardPayment:
    payment = await db.scalar(select(CreditCardPayment).where(CreditCardPayment.id == payment_id))
    if payment is None or payment.created_by != current_user:
        raise ValueError("Credit card payment not found")
    return payment


async def _get_owned_charge(charge_id: UUID, current_user: UUID, db: AsyncSession) -> CreditCardCharge:
    charge = await db.scalar(select(CreditCardCharge).where(CreditCardCharge.id == charge_id))
    if charge is None or charge.created_by != current_user:
        raise ValueError("Charge not found")
    return charge


def _cents(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


async def _amount_applied_total(column, target_id: UUID, db: AsyncSession) -> Decimal:
    total = await db.scalar(
        select(func.coalesce(func.sum(CreditCardChargeAllocation.amount_applied), 0)).where(column == target_id)
    )
    # coalesce's fallback (0) comes back as a bare int with no rows to sum, not
    # a Numeric(10,2)-shaped Decimal - quantize so "paid"/"left" always render
    # as e.g. "0.00" instead of "0".
    return _cents(Decimal(total))


async def _paid_on_payment(payment_id: UUID, db: AsyncSession) -> Decimal:
    return await _amount_applied_total(CreditCardChargeAllocation.payment_id, payment_id, db)


async def _paid_on_charge(charge_id: UUID, db: AsyncSession) -> Decimal:
    return await _amount_applied_total(CreditCardChargeAllocation.charge_id, charge_id, db)


class ChargeInfo(NamedTuple):
    charge: CreditCardCharge
    paid: Decimal
    settled_transaction_id: UUID | None


class PaymentDetail(NamedTuple):
    payment: CreditCardPayment
    paid: Decimal
    left: Decimal
    charges: list[ChargeInfo]


async def _charge_info(charge: CreditCardCharge, db: AsyncSession) -> ChargeInfo:
    return ChargeInfo(
        charge=charge,
        paid=await _paid_on_charge(charge.id, db),
        settled_transaction_id=await _settled_transaction_id(charge.id, db),
    )


async def get_payment_detail(payment_id: UUID, current_user: UUID, db: AsyncSession) -> PaymentDetail:
    payment = await _get_owned_payment(payment_id, current_user, db)
    paid = await _paid_on_payment(payment_id, db)

    charge_ids = (await db.execute(
        select(CreditCardChargeAllocation.charge_id).where(CreditCardChargeAllocation.payment_id == payment_id).distinct()
    )).scalars().all()

    charges: list[ChargeInfo] = []
    for charge_id in charge_ids:
        charge = await db.scalar(select(CreditCardCharge).where(CreditCardCharge.id == charge_id))
        if charge is not None:
            charges.append(await _charge_info(charge, db))
    charges.sort(key=lambda c: (c.charge.charge_date, c.charge.created_at))

    return PaymentDetail(payment=payment, paid=paid, left=payment.total_amount - paid, charges=charges)


async def create_payment(
    data: CreateCreditCardPayment, current_user: UUID, db: AsyncSession
) -> PaymentDetail:
    """Create a plain balance with no linked transaction - a CC balance isn't
    itself an expense event, only the charges later settled against it are,
    so nothing gets written to the transactions table here (#54 follow-up).
    Contrast with create_payment_from_transaction below, which anchors the
    payment to money that's already left the account."""
    payment = CreditCardPayment(
        name="Credit Card Payment",
        total_amount=data.total_amount,
        payment_date=data.payment_date,
        due_date=data.due_date,
        created_by=current_user,
        updated_by=current_user,
    )
    db.add(payment)
    await db.flush()

    await db.commit()
    return await get_payment_detail(payment.id, current_user, db)


async def create_payment_from_transaction(
    transaction_id: UUID, current_user: UUID, db: AsyncSession, due_date: date | None = None
) -> PaymentDetail:
    """Turn an existing, plain transaction into the anchor of a credit card
    payment. The transaction itself is untouched (full amount, own category)
    - see CreditCardPayment's docstring for why."""
    transaction = await db.scalar(select(Transaction).where(Transaction.id == transaction_id))
    if transaction is None or transaction.created_by != current_user:
        raise ValueError("Transaction not found")
    if transaction.credit_card_payment_id is not None:
        raise ValueError("Transaction is already a credit card payment")
    if transaction.credit_card_charge_id is not None:
        raise ValueError("Transaction is a settled credit card charge, not a payment")

    payment = CreditCardPayment(
        name=transaction.name,
        total_amount=transaction.amount,
        payment_date=transaction.transaction_date,
        due_date=due_date,
        created_by=current_user,
        updated_by=current_user,
    )
    db.add(payment)
    await db.flush()

    transaction.credit_card_payment_id = payment.id
    transaction.updated_by = current_user

    await db.commit()
    return await get_payment_detail(payment.id, current_user, db)


async def get_payments(current_user: UUID, db: AsyncSession) -> list[PaymentDetail]:
    """Every credit card payment for this user, most recent first - the
    "Credit Cards" tool's list view (#54)."""
    payments = (await db.scalars(
        select(CreditCardPayment)
        .where(CreditCardPayment.created_by == current_user)
        .order_by(CreditCardPayment.payment_date.desc())
    )).all()
    return [await get_payment_detail(payment.id, current_user, db) for payment in payments]


async def delete_payment(payment_id: UUID, current_user: UUID, db: AsyncSession) -> None:
    """Delete a credit card payment. The anchor transaction is unlinked, not
    deleted - real money left the account regardless of how it was
    categorized, so removing the split shouldn't erase that it happened.
    Charges this payment funded (even partially) are re-evaluated: one that's
    no longer fully paid once this payment's allocations are gone has its
    promoted transaction removed (un-settled); one left with zero allocations
    from any other payment is deleted outright, since without this record it
    never became anything (#54)."""
    payment = await _get_owned_payment(payment_id, current_user, db)

    anchor = await db.scalar(select(Transaction).where(Transaction.credit_card_payment_id == payment_id))
    if anchor is not None:
        anchor.credit_card_payment_id = None
        anchor.updated_by = current_user

    allocations = (await db.scalars(
        select(CreditCardChargeAllocation).where(CreditCardChargeAllocation.payment_id == payment_id)
    )).all()
    contribution_by_charge: dict[UUID, Decimal] = {}
    for a in allocations:
        contribution_by_charge[a.charge_id] = contribution_by_charge.get(a.charge_id, Decimal("0")) + a.amount_applied

    for charge_id, contribution in contribution_by_charge.items():
        charge = await db.scalar(select(CreditCardCharge).where(CreditCardCharge.id == charge_id))
        if charge is None:
            continue

        paid_now = await _paid_on_charge(charge_id, db)
        paid_after = paid_now - contribution

        if paid_now >= charge.total_amount > paid_after:
            settled = await db.scalar(select(Transaction).where(Transaction.credit_card_charge_id == charge_id))
            if settled is not None:
                await db.delete(settled)

        if paid_after <= 0:
            await db.delete(charge)

    await db.delete(payment)
    await db.commit()


async def get_pending_charges(current_user: UUID, db: AsyncSession) -> list[ChargeInfo]:
    """Charges not yet fully paid off, across every payment - surfaced so a
    new payment's allocation tool can offer to finish one instead of only
    ever starting fresh ones (#54). No "settled" column to filter on at the
    query level (see CreditCardCharge's docstring) - settled is amount_paid
    >= total_amount, checked once each charge's paid total is known."""
    charges = (await db.scalars(
        select(CreditCardCharge).where(CreditCardCharge.created_by == current_user)
    )).all()

    infos = [await _charge_info(charge, db) for charge in charges]
    return [info for info in infos if info.paid < info.charge.total_amount]


async def _settled_transaction_id(charge_id: UUID, db: AsyncSession) -> UUID | None:
    return await db.scalar(select(Transaction.id).where(Transaction.credit_card_charge_id == charge_id))


async def _promote_if_settled(charge: CreditCardCharge, current_user: UUID, db: AsyncSession) -> None:
    paid = await _paid_on_charge(charge.id, db)
    if paid < charge.total_amount:
        return

    settled_transaction = Transaction(
        name=charge.name,
        amount=charge.total_amount,
        category=charge.category,
        transaction_date=charge.charge_date,
        credit_card_charge_id=charge.id,
        created_by=current_user,
        updated_by=current_user,
    )
    db.add(settled_transaction)
    await db.flush()


async def allocate_existing_transaction(
    payment_id: UUID,
    data: AllocateExistingTransaction,
    current_user: UUID,
    db: AsyncSession,
) -> PaymentDetail:
    """Reuse an already-recorded, unlinked transaction as a charge instead of
    retyping it (#54 follow-up) - the transaction itself becomes the settled
    row (credit_card_charge_id set directly on it), so no duplicate
    transaction gets created the way a from-scratch charge's promotion does.
    Always applied in full: this transaction already IS the charge."""
    payment = await _get_owned_payment(payment_id, current_user, db)
    transaction = await db.scalar(select(Transaction).where(Transaction.id == data.transaction_id))
    if transaction is None or transaction.created_by != current_user:
        raise ValueError("Transaction not found")
    if transaction.credit_card_payment_id is not None or transaction.credit_card_charge_id is not None:
        raise InvalidAllocationError("Transaction is already linked to a credit card payment or charge")

    left_on_payment = payment.total_amount - await _paid_on_payment(payment_id, db)
    if transaction.amount > left_on_payment:
        raise InvalidAllocationError("Amount exceeds what's left on this payment")

    charge = CreditCardCharge(
        name=transaction.name,
        total_amount=transaction.amount,
        category=transaction.category,
        charge_date=transaction.transaction_date,
        created_by=current_user,
        updated_by=current_user,
    )
    db.add(charge)
    await db.flush()

    db.add(CreditCardChargeAllocation(
        charge_id=charge.id,
        payment_id=payment.id,
        amount_applied=transaction.amount,
        created_by=current_user,
    ))

    transaction.credit_card_charge_id = charge.id
    transaction.updated_by = current_user

    await db.commit()
    return await get_payment_detail(payment_id, current_user, db)


async def allocate(
    payment_id: UUID,
    data: AllocateToCharge | AllocateToNewCharge,
    current_user: UUID,
    db: AsyncSession,
) -> PaymentDetail:
    payment = await _get_owned_payment(payment_id, current_user, db)
    left_on_payment = payment.total_amount - await _paid_on_payment(payment_id, db)
    if data.amount_applied > left_on_payment:
        raise InvalidAllocationError("Amount exceeds what's left on this payment")

    if isinstance(data, AllocateToCharge):
        charge = await _get_owned_charge(data.charge_id, current_user, db)
        paid_on_charge = await _paid_on_charge(charge.id, db)
        if paid_on_charge >= charge.total_amount:
            raise InvalidAllocationError("Charge is already fully paid")
        if data.amount_applied > charge.total_amount - paid_on_charge:
            raise InvalidAllocationError("Amount exceeds what's left on this charge")
    else:
        charge = CreditCardCharge(
            name=data.name,
            total_amount=data.total_amount,
            category=data.category,
            charge_date=data.charge_date,
            created_by=current_user,
            updated_by=current_user,
        )
        db.add(charge)
        await db.flush()

    db.add(CreditCardChargeAllocation(
        charge_id=charge.id,
        payment_id=payment.id,
        amount_applied=data.amount_applied,
        created_by=current_user,
    ))
    await db.flush()

    await _promote_if_settled(charge, current_user, db)

    await db.commit()
    return await get_payment_detail(payment_id, current_user, db)
