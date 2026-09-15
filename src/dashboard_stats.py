"""Aggregate statistics for the analytics dashboard.

Leaderboards merge two sources per player+format (see player_stats.py for the same
pattern): the static leaderboard CSVs (data_loader.py, all-time top-N, scraped once)
and dataset/ball_by_ball_data.csv aggregated via ballbyball_stats.py (2003-2024,
stays fresh for active players). Whichever source shows the larger runs/wickets total
wins, since a smaller total always means that source is missing part of the career.

"Runs by year" comes directly from the ball-by-ball data's `season` column, so unlike
the old all-time-leaderboard-only version of this module, it's a genuine year-by-year
trend (2003-2024) rather than a rank-ordered approximation.
"""
from functools import lru_cache

import pandas as pd

from . import ballbyball_stats, player_stats
from .data_loader import load_all
from .series_predictor import load_or_train, parse_series_title

_BATTING = {"ODI": "odi_batting", "Test": "test_batting", "T20I": "t20_batting"}
_BOWLING = {"ODI": "odi_bowling", "Test": "test_bowling", "T20I": "t20_bowling"}
_SERIES = {"ODI": "odi_series", "Test": "test_series", "T20I": "t20_series"}
FORMATS = ("ODI", "Test", "T20I")


@lru_cache(maxsize=1)
def _tables() -> dict[str, pd.DataFrame]:
    return load_all()


def _merged_batting(fmt: str) -> pd.DataFrame:
    static_df = _tables()[_BATTING[fmt]][["Player", "Runs", "Ave"]].rename(
        columns={"Player": "player", "Runs": "runs", "Ave": "average"}
    )
    fresh_df = ballbyball_stats.load_batting()
    fresh_df = fresh_df.loc[fresh_df["format"] == fmt, ["player", "runs", "average"]]
    combined = pd.concat([static_df, fresh_df], ignore_index=True)
    combined["player"] = combined["player"].map(player_stats.canonical_player)
    # Sorting by runs descending before dropping duplicates keeps each player's larger total.
    return combined.sort_values("runs", ascending=False).drop_duplicates(subset="player", keep="first")


def _static_balls(df: pd.DataFrame) -> pd.Series:
    """ODI/Test bowling CSVs have a `Balls` column; the T20I one has `Overs` (e.g. "347.3")."""
    if "Balls" in df.columns:
        return df["Balls"]
    overs = df["Overs"].astype(str).str.split(".", n=1, expand=True)
    whole = pd.to_numeric(overs[0], errors="coerce").fillna(0)
    remainder = pd.to_numeric(overs[1], errors="coerce").fillna(0) if overs.shape[1] > 1 else 0
    return whole * 6 + remainder


def _merged_bowling(fmt: str) -> pd.DataFrame:
    static_df = _tables()[_BOWLING[fmt]].copy()
    static_df["balls"] = _static_balls(static_df)
    static_df = static_df[["Player", "Wkts", "Econ", "balls"]].rename(
        columns={"Player": "player", "Wkts": "wickets", "Econ": "economy"}
    )
    fresh_df = ballbyball_stats.load_bowling()
    fresh_df = fresh_df.loc[fresh_df["format"] == fmt, ["player", "wickets", "economy", "balls"]]
    combined = pd.concat([static_df, fresh_df], ignore_index=True)
    combined["player"] = combined["player"].map(player_stats.canonical_player)
    return combined.sort_values("wickets", ascending=False).drop_duplicates(subset="player", keep="first")


def _team_players(frame: pd.DataFrame, team: str | None) -> pd.DataFrame:
    if not team:
        return frame
    tag = ballbyball_stats._COUNTRY_TAG.get(team.lower(), team.upper())
    associated = {
        canonical for alias, canonical in player_stats._player_aliases().items()
        if tag in player_stats._identity_parts(alias)[1]
    }
    return frame[frame["player"].isin(associated) | frame["player"].map(
        lambda name: tag in player_stats._identity_parts(name)[1]
    )]


def available_teams() -> list[str]:
    return sorted({team for team, _ in load_or_train().team_stats})


def top_run_scorers(fmt: str, limit: int = 10, team: str | None = None) -> list[dict]:
    df = _team_players(_merged_batting(fmt), team).sort_values("runs", ascending=False).head(limit)
    return [
        {"player": row.player, "runs": int(row.runs), "average": float(row.average) if pd.notna(row.average) else None}
        for row in df.itertuples()
    ]


def top_wicket_takers(fmt: str, limit: int = 10, team: str | None = None) -> list[dict]:
    df = _team_players(_merged_bowling(fmt), team).sort_values("wickets", ascending=False).head(limit)
    return [
        {"player": row.player, "wickets": int(row.wickets), "economy": float(row.economy) if pd.notna(row.economy) else None}
        for row in df.itertuples()
    ]


def economy_leaders(fmt: str, limit: int = 10, min_balls: int = 1000, team: str | None = None) -> list[dict]:
    """Best economy rate among bowlers with at least `min_balls` legal deliveries bowled
    (matches the qualification convention used for official career economy records), to
    avoid noise from part-time/occasional bowlers. Rank-ordered by economy, not chronological."""
    df = _team_players(_merged_bowling(fmt), team)
    df = df[pd.notna(df["economy"]) & (df["balls"].fillna(0) >= min_balls)]
    df = df.sort_values("economy", ascending=True).head(limit)
    return [{"player": row.player, "economy": float(row.economy), "wickets": int(row.wickets)} for row in df.itertuples()]


def runs_by_year(fmt: str, team: str | None = None) -> list[dict]:
    """Genuine year-by-year total runs scored in international `fmt` matches, 2003-2024,
    from the ball-by-ball dataset's `season` column."""
    if team:
        ry = ballbyball_stats.load_team_runs_by_year()
        ry = ry[ry["batting_team"] == team]
    else:
        ry = ballbyball_stats.load_runs_by_year()
    ry = ry[ry["format"] == fmt].sort_values("year")
    return [{"year": int(row.year), "runs": int(row.total_runs), "wickets": int(row.total_wickets)} for row in ry.itertuples()]


def win_pct_by_format(limit: int = 8, min_matches: int = 5, team: str | None = None) -> dict[str, list[dict]]:
    """Top teams by win rate per format, from the series predictor's precomputed team stats."""
    model = load_or_train()
    out: dict[str, list[dict]] = {}
    for fmt in FORMATS:
        rows = [
            {"team": name, "matches": stat["matches"], "win_rate": round(stat["wins"] / stat["matches"], 3)}
            for (name, f), stat in model.team_stats.items()
            if f == fmt and stat["matches"] >= min_matches and (not team or name == team)
        ]
        rows.sort(key=lambda r: r["win_rate"], reverse=True)
        out[fmt] = rows[:limit]
    return out


def home_vs_away_by_format(min_matches: int = 5, team: str | None = None) -> dict[str, dict]:
    """Average home vs away win rate across teams with enough matches, per format."""
    model = load_or_train()
    out: dict[str, dict] = {}
    for fmt in FORMATS:
        home_rates, away_rates = [], []
        for (name, f), stat in model.team_stats.items():
            if f != fmt or (team and name != team):
                continue
            if stat["home_matches"] >= min_matches:
                home_rates.append(stat["home_wins"] / stat["home_matches"])
            if stat["away_matches"] >= min_matches:
                away_rates.append(stat["away_wins"] / stat["away_matches"])
        out[fmt] = {
            "home_win_rate": round(sum(home_rates) / len(home_rates), 3) if home_rates else None,
            "away_win_rate": round(sum(away_rates) / len(away_rates), 3) if away_rates else None,
        }
    return out


def decisive_series_distribution(team: str | None = None) -> list[dict]:
    """Count of decisive (non-drawn/tied/multi-team) series rows per format, for a pie chart."""
    tables = _tables()
    out = []
    for fmt, table_name in _SERIES.items():
        df = tables[table_name]
        count = 0
        for title, winner in zip(df["Series/Tournament"], df["Winner"]):
            team_a, team_b, kind = parse_series_title(title)
            if kind == "multi" or team_a is None:
                continue
            if team and team not in (team_a, team_b):
                continue
            if str(winner).strip() in (team_a, team_b):
                count += 1
        out.append({"format": fmt, "count": count})
    return out
