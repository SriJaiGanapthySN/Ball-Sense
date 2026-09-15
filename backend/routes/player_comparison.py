"""Player search + head-to-head comparison routes (Feature: Player vs Player AI Comparison)."""
import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src import chat_assistant, player_stats

router = APIRouter(prefix="/api/players", tags=["players"])


class ComparePlayersRequest(BaseModel):
    player_a: str
    player_b: str


class PlayerProfile(BaseModel):
    player: str
    image_url: str | None = None
    batting: dict
    bowling: dict


class ComparePlayersResponse(BaseModel):
    player_a: PlayerProfile
    player_b: PlayerProfile
    ai_summary: str | None = None
    notice: str | None = None


@router.get("/search")
def search(q: str = "", limit: int = 15):
    return {"players": player_stats.search_players(q, limit=limit)}


@router.post("/compare", response_model=ComparePlayersResponse)
def compare(req: ComparePlayersRequest):
    if player_stats.canonical_player(req.player_a) == player_stats.canonical_player(req.player_b):
        raise HTTPException(400, "Pick two different players.")
    profile_a = player_stats.get_player_profile(req.player_a)
    profile_b = player_stats.get_player_profile(req.player_b)
    if profile_a is None:
        raise HTTPException(404, f"Unknown player: {req.player_a}")
    if profile_b is None:
        raise HTTPException(404, f"Unknown player: {req.player_b}")

    ai_summary = None
    notices = []
    gemini_api_key = os.getenv("GEMINI_API_KEY", "")
    if chat_assistant.configured_api_keys(gemini_api_key):
        gemini_model = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
        try:
            ai_summary = chat_assistant.summarize_player_comparison(
                profile_a, profile_b, gemini_api_key, gemini_model, on_retry=notices.append
            )
        except Exception:  # noqa: BLE001 - AI insight is best-effort, stats still return
            notices.append(chat_assistant.UNAVAILABLE_NOTICE)

    return ComparePlayersResponse(
        player_a=profile_a, player_b=profile_b, ai_summary=ai_summary,
        notice=notices[-1] if notices else None,
    )
