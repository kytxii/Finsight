import json
import logging
import re

from google import genai
from google.genai import types

from app.core.config import settings

logger = logging.getLogger(__name__)

# Guards against degenerate model output (e.g. "Zelle................." instead
# of a real name or the unchanged original) slipping past the prompt alone.
_REPEATED_PUNCTUATION_RE = re.compile(r"([^\w\s])\1{2,}")

# The "-latest" alias tracks Google's current lightweight flash-lite model,
# so this doesn't need to be re-pinned by hand every time they retire a
# dated version (e.g. gemini-2.5-flash-lite 404s for new API keys as of
# 2026-08 even though it's still listed by the models API).
MODEL_NAME = "gemini-flash-lite-latest"

PROMPT_TEMPLATE = (
    "You are cleaning up merchant/payee names extracted from a personal bank statement. "
    "For each raw string below, decide what it is and respond accordingly:\n"
    "- If it's a business/merchant name with leftover noise (location codes, order or "
    "reference numbers, franchise/branch suffixes), return just the real business name, "
    "title-cased.\n"
    "- If it's a personal transfer (Zelle, Venmo, PayPal, cash app, etc.), a paycheck, or "
    "already a clean, readable description, return it unchanged, word-for-word.\n"
    "- If you are not confident what the real business name is, return the input unchanged "
    "rather than guessing or abbreviating.\n"
    "Never replace text with placeholders, ellipses, or redacted characters. Every response "
    "must be either the cleaned name or the exact original string — never blank or partial.\n\n"
    "Raw names:\n{names_block}"
)

RESPONSE_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "original": {"type": "string"},
            "suggested": {"type": "string"},
        },
        "required": ["original", "suggested"],
    },
}


class AiCleanupUnavailable(Exception):
    """AI-assisted name cleanup can't run right now (not configured, or the call failed)."""


async def suggest_clean_names(names: list[str]) -> dict[str, str]:
    if not settings.GEMINI_API_KEY:
        raise AiCleanupUnavailable("AI cleanup isn't configured on this server.")

    distinct_names = list(dict.fromkeys(n.strip() for n in names if n and n.strip()))
    if not distinct_names:
        return {}

    prompt = PROMPT_TEMPLATE.format(
        names_block="\n".join(f"- {n}" for n in distinct_names)
    )

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    try:
        response = await client.aio.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=RESPONSE_SCHEMA,
            ),
        )
        parsed = json.loads(response.text)
    except Exception as exc:
        logger.exception("AI name cleanup call failed")
        raise AiCleanupUnavailable("AI cleanup call failed.") from exc

    suggestions: dict[str, str] = {}
    for item in parsed:
        original = item.get("original", "").strip()
        suggested = item.get("suggested", "").strip()
        if original and _looks_valid(suggested):
            suggestions[original] = suggested
    return suggestions


def _looks_valid(suggested: str) -> bool:
    if not suggested or not any(c.isalnum() for c in suggested):
        return False
    return not _REPEATED_PUNCTUATION_RE.search(suggested)
