import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services import ai_name_cleanup
from app.services.ai_name_cleanup import AiCleanupUnavailable, suggest_clean_names


def _fake_client(response_text: str) -> MagicMock:
    client = MagicMock()
    client.aio.models.generate_content = AsyncMock(
        return_value=MagicMock(text=response_text)
    )
    return client


async def test_raises_without_configured_api_key(monkeypatch):
    monkeypatch.setattr(ai_name_cleanup.settings, "GEMINI_API_KEY", None)
    genai_client_cls = MagicMock()
    monkeypatch.setattr(ai_name_cleanup.genai, "Client", genai_client_cls)

    with pytest.raises(AiCleanupUnavailable):
        await suggest_clean_names(["JERSEY MIKES ONLINE UC MANASQUAN NJ"])

    genai_client_cls.assert_not_called()


async def test_returns_empty_dict_for_no_names(monkeypatch):
    monkeypatch.setattr(ai_name_cleanup.settings, "GEMINI_API_KEY", "test-key")
    genai_client_cls = MagicMock()
    monkeypatch.setattr(ai_name_cleanup.genai, "Client", genai_client_cls)

    result = await suggest_clean_names(["", "   "])

    assert result == {}
    genai_client_cls.assert_not_called()


async def test_parses_suggestions_from_response(monkeypatch):
    monkeypatch.setattr(ai_name_cleanup.settings, "GEMINI_API_KEY", "test-key")
    response_text = json.dumps([
        {"original": "JERSEY MIKES ONLINE UC MANASQUAN NJ", "suggested": "Jersey Mikes"},
        {"original": "Already Clean", "suggested": "Already Clean"},
    ])
    fake_client = _fake_client(response_text)
    monkeypatch.setattr(ai_name_cleanup.genai, "Client", MagicMock(return_value=fake_client))

    result = await suggest_clean_names([
        "JERSEY MIKES ONLINE UC MANASQUAN NJ",
        "Already Clean",
        "JERSEY MIKES ONLINE UC MANASQUAN NJ",  # duplicate should be deduped before the call
    ])

    assert result == {
        "JERSEY MIKES ONLINE UC MANASQUAN NJ": "Jersey Mikes",
        "Already Clean": "Already Clean",
    }
    call_kwargs = fake_client.aio.models.generate_content.call_args.kwargs
    assert call_kwargs["contents"].count("JERSEY MIKES ONLINE UC MANASQUAN NJ") == 1


async def test_wraps_call_failures(monkeypatch):
    monkeypatch.setattr(ai_name_cleanup.settings, "GEMINI_API_KEY", "test-key")
    fake_client = MagicMock()
    fake_client.aio.models.generate_content = AsyncMock(side_effect=RuntimeError("network down"))
    monkeypatch.setattr(ai_name_cleanup.genai, "Client", MagicMock(return_value=fake_client))

    with pytest.raises(AiCleanupUnavailable):
        await suggest_clean_names(["Some Merchant"])


async def test_wraps_unparseable_response(monkeypatch):
    monkeypatch.setattr(ai_name_cleanup.settings, "GEMINI_API_KEY", "test-key")
    fake_client = _fake_client("not json")
    monkeypatch.setattr(ai_name_cleanup.genai, "Client", MagicMock(return_value=fake_client))

    with pytest.raises(AiCleanupUnavailable):
        await suggest_clean_names(["Some Merchant"])


async def test_drops_degenerate_suggestions(monkeypatch):
    monkeypatch.setattr(ai_name_cleanup.settings, "GEMINI_API_KEY", "test-key")
    response_text = json.dumps([
        {"original": "Zelle payment from JULIE TILLEY for \"Rent\"", "suggested": "Zelle................."},
        {"original": "Whole Foods", "suggested": "Whole Foods"},
    ])
    fake_client = _fake_client(response_text)
    monkeypatch.setattr(ai_name_cleanup.genai, "Client", MagicMock(return_value=fake_client))

    result = await suggest_clean_names([
        "Zelle payment from JULIE TILLEY for \"Rent\"",
        "Whole Foods",
    ])

    # The degenerate suggestion is dropped entirely (row keeps its original name);
    # the good suggestion still comes through.
    assert result == {"Whole Foods": "Whole Foods"}
