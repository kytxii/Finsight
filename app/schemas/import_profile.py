from pydantic import BaseModel, Field
from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID
from app.models.category import Category
from app.schemas.transaction import TransactionResponse
from app.schemas.tip_deposit import TipDepositResponse

class ColumnMapping(BaseModel):
    date: str
    amount: str
    name: str

class DuplicateTransactionSummary(BaseModel):
    name: str
    amount: Decimal
    transaction_date: date

class ImportPreviewRow(BaseModel):
    row_number: int
    name: str
    amount: Decimal | None = None
    transaction_date: date | None = None
    category: Category | None = None
    is_duplicate: bool = False
    duplicate_transaction_id: UUID | None = None
    duplicate_transaction: DuplicateTransactionSummary | None = None
    is_tip_deposit_candidate: bool = False
    is_credit_card_payment_candidate: bool = False
    errors: list[str] = Field(default_factory=list)

class ImportPreviewResponse(BaseModel):
    source_format: Literal["csv", "pdf"] = "csv"
    rows: list[ImportPreviewRow]

class ImportCommitRow(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    amount: Decimal
    transaction_date: date
    category: Category
    skip: bool = False

class ImportCommitTipDepositRow(BaseModel):
    amount: Decimal = Field(gt=0)
    deposit_date: date

class ImportCommitRequest(BaseModel):
    rows: list[ImportCommitRow]
    tip_deposit_rows: list[ImportCommitTipDepositRow] = Field(default_factory=list)

class ImportCommitResponse(BaseModel):
    created_count: int
    transactions: list[TransactionResponse] = Field(default_factory=list)
    tip_deposits_created: int = 0
    tip_deposits: list[TipDepositResponse] = Field(default_factory=list)

class AiCleanupRequest(BaseModel):
    names: list[str]

class AiCleanupResponse(BaseModel):
    suggestions: dict[str, str]
