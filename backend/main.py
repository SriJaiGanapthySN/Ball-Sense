"""FastAPI backend exposing the gans features (chat, series predictor, live matches)
to the React frontend. Run with: uvicorn backend.main:app --port 8000
"""
import os
from datetime import datetime, timezone
from typing import Literal, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.routes import dashboard as dashboard_routes
from backend.routes import hand_multiplayer as hand_multiplayer_routes
from backend.routes import player_comparison as player_comparison_routes
from src import chat_assistant, cricapi_client, db
from src.series_predictor import load_or_train

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
CRICAPI_KEY = os.getenv("CRICAPI_KEY", "")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")

db.build_database()
_model = load_or_train()

app = FastAPI(title="gans API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(player_comparison_routes.router)
app.include_router(dashboard_routes.router)
app.include_router(hand_multiplayer_routes.router)

Format = Literal["ODI", "Test", "T20I"]


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    question: str
    history: list[ChatMessage] = []


class ChatResponse(BaseModel):
    answer: str
    notice: str | None = None


class PredictRequest(BaseModel):
    team_a: str
    team_b: str
    format: Format
    neutral: bool = False


class TeamStats(BaseModel):
    series_played: int
    series_won: int
    win_rate: Optional[float]
    home_win_rate: Optional[float]
    away_win_rate: Optional[float]


class PredictResponse(BaseModel):
    prob_team_a: float
    team_a_stats: TeamStats
    team_b_stats: TeamStats


@app.get("/api/status")
def status():
    return {"gemini_configured": bool(chat_assistant.configured_api_keys(GEMINI_API_KEY)), "cricapi_configured": bool(CRICAPI_KEY)}


@app.get("/api/teams")
def teams(format: Format = "ODI"):
    return {"teams": _model.teams_by_format.get(format, [])}


@app.post("/api/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    if req.team_a == req.team_b:
        raise HTTPException(400, "Pick two different teams.")
    prob = _model.predict_proba(req.team_a, req.team_b, req.format, neutral=req.neutral)
    return PredictResponse(
        prob_team_a=prob,
        team_a_stats=TeamStats(**_model.get_team_summary(req.team_a, req.format)),
        team_b_stats=TeamStats(**_model.get_team_summary(req.team_b, req.format)),
    )


@app.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    if not chat_assistant.configured_api_keys(GEMINI_API_KEY):
        raise HTTPException(400, "GEMINI_API_KEY is not configured on the server.")
    notices = []
    try:
        answer = chat_assistant.ask(
            req.question, [m.model_dump() for m in req.history], GEMINI_API_KEY, GEMINI_MODEL,
            on_retry=notices.append,
        )
    except Exception:  # noqa: BLE001
        raise HTTPException(503, chat_assistant.UNAVAILABLE_NOTICE) from None
    return ChatResponse(answer=answer, notice=notices[-1] if notices else None)


@app.get("/api/live-matches")
def live_matches():
    if not CRICAPI_KEY:
        raise HTTPException(400, "CRICAPI_KEY is not configured on the server.")
    try:
        feed = cricapi_client.get_current_matches_feed(CRICAPI_KEY)
    except cricapi_client.CricApiError as exc:
        raise HTTPException(exc.status_code, str(exc), headers={"Retry-After": "300"}) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, "Live match data is temporarily unavailable.") from exc

    enriched = []
    for match in feed["matches"]:
        match_teams = match.get("teams") or []
        name = match.get("name", "Unknown match")
        prediction = None
        fmt_guess = {"t20": "T20I", "t20i": "T20I", "odi": "ODI", "test": "Test"}.get(str(match.get("matchType", "")).lower())
        if len(match_teams) == 2 and fmt_guess:
            known = set(_model.teams_by_format.get(fmt_guess, []))
            if match_teams[0] in known and match_teams[1] in known:
                prediction = {
                    "team": match_teams[0],
                    "prob": _model.predict_proba(match_teams[0], match_teams[1], fmt_guess, neutral=True),
                    "basis": "historical_series",
                }
        start_time = None
        if match.get("dateTimeGMT"):
            try:
                parsed_time = datetime.fromisoformat(str(match["dateTimeGMT"]).replace("Z", "+00:00"))
                start_time = (parsed_time if parsed_time.tzinfo else parsed_time.replace(tzinfo=timezone.utc)).isoformat()
            except ValueError:
                pass
        enriched.append(
            {
                "id": match.get("id"),
                "name": name,
                "status": match.get("status", ""),
                "teams": match_teams,
                "prediction": prediction,
                # These come free as part of the currentMatches list (no extra CricAPI hit).
                "venue": match.get("venue"),
                "date": match.get("date"),
                "start_time": start_time,
                "match_started": match.get("matchStarted"),
                "match_ended": match.get("matchEnded"),
                "match_type": match.get("matchType"),
                "score": match.get("score") or [],
                "toss_winner": match.get("tossWinner"),
                "toss_choice": match.get("tossChoice"),
            }
        )
    return {**feed, "matches": enriched}
