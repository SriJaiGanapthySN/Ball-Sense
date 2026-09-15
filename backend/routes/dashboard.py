"""Analytics dashboard routes (Feature: Cricket Analytics Dashboard).

All data is derived from the local dataset/ CSVs — see src/dashboard_stats.py for the
caveats around what "trend"/"by format" mean given the available columns.
"""
from typing import Literal

from fastapi import APIRouter, HTTPException

from src import dashboard_stats

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

Format = Literal["ODI", "Test", "T20I"]


def _check_team(team: str | None) -> None:
    if team and team not in dashboard_stats.available_teams():
        raise HTTPException(400, "Choose a team from the analytics team list.")


@router.get("/teams")
def teams():
    return {"teams": dashboard_stats.available_teams()}


@router.get("/leaderboards")
def leaderboards(format: Format = "ODI", limit: int = 10, team: str | None = None):
    _check_team(team)
    return {
        "format": format,
        "team": team,
        "top_run_scorers": dashboard_stats.top_run_scorers(format, limit=limit, team=team),
        "top_wicket_takers": dashboard_stats.top_wicket_takers(format, limit=limit, team=team),
        "economy_leaders": dashboard_stats.economy_leaders(format, limit=limit, team=team),
    }


@router.get("/runs-by-year")
def runs_by_year(format: Format = "ODI", team: str | None = None):
    _check_team(team)
    return {"format": format, "team": team, "runs_by_year": dashboard_stats.runs_by_year(format, team=team)}


@router.get("/team-performance")
def team_performance(team: str | None = None):
    _check_team(team)
    return {
        "team": team,
        "win_pct_by_format": dashboard_stats.win_pct_by_format(team=team),
        "home_vs_away_by_format": dashboard_stats.home_vs_away_by_format(team=team),
        "decisive_series_distribution": dashboard_stats.decisive_series_distribution(team=team),
    }
