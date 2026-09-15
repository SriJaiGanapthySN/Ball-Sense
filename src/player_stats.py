"""Player-level lookup and comparison helpers.

Stats come from two sources, merged per player+format:
  - the static leaderboard CSVs (data_loader.py) — top-N all-time career lists,
    scraped once and never updated.
  - dataset/ball_by_ball_data.csv aggregated via ballbyball_stats.py — covers
    2003-2024 internationals and stays "fresh" for players still active.
For each player+format we keep whichever source shows the larger career total
(more runs / more wickets), since a smaller number always means that source is
missing data (either the static snapshot is stale, or the ball-by-ball window
misses a career that started before 2003).
"""
from functools import lru_cache
import re
from typing import Optional

import pandas as pd

from . import ballbyball_stats
from .data_loader import load_all

_BATTING_TABLES = {"ODI": "odi_batting", "Test": "test_batting", "T20I": "t20_batting"}
_BOWLING_TABLES = {"ODI": "odi_bowling", "Test": "test_bowling", "T20I": "t20_bowling"}


@lru_cache(maxsize=1)
def _source_tables() -> dict[str, pd.DataFrame]:
    return load_all()


@lru_cache(maxsize=1)
def _source_batting() -> pd.DataFrame:
    return ballbyball_stats.load_batting()


@lru_cache(maxsize=1)
def _source_bowling() -> pd.DataFrame:
    return ballbyball_stats.load_bowling()


def _identity_parts(label: str) -> tuple[str, set[str]]:
    match = re.fullmatch(r"(.+?)\s+\(([^()]*)\)", label.strip())
    if not match:
        return label.strip(), set()
    tags = {tag.replace(".", "").strip().upper() for tag in match.group(2).split("/")}
    return match.group(1).strip(), tags - {"ASIA", "AFR", "ICC", "WORLD"}


def _build_aliases(names: set[str], preferred: set[str]) -> dict[str, str]:
    by_name: dict[str, list[tuple[str, set[str]]]] = {}
    for label in sorted(names):
        short, countries = _identity_parts(label)
        by_name.setdefault(short, []).append((label, countries))
    aliases = {}
    for short, entries in by_name.items():
        while entries:
            label, countries = entries.pop(0)
            members = [label]
            changed = True
            while changed:
                changed = False
                for candidate, tags in entries[:]:
                    if countries & tags:
                        members.append(candidate)
                        countries |= tags
                        entries.remove((candidate, tags))
                        changed = True
            preferred_tags = {
                next(iter(tags)) for member in members if member in preferred
                if len(tags := _identity_parts(member)[1]) == 1
            }
            display_tags = preferred_tags if len(preferred_tags) == 1 else countries
            canonical = f"{short} ({'/'.join(sorted(display_tags))})" if display_tags else label
            aliases.update({member: canonical for member in members})
    return aliases


@lru_cache(maxsize=1)
def _player_aliases() -> dict[str, str]:
    preferred = set(_source_batting()["player"]) | set(_source_bowling()["player"])
    names = set(preferred)
    for table_name in list(_BATTING_TABLES.values()) + list(_BOWLING_TABLES.values()):
        names.update(_source_tables()[table_name]["Player"])
    return _build_aliases(names, preferred)


def canonical_player(player: str) -> str:
    return _player_aliases().get(player.strip(), player.strip())


def _canonical_rows(frame: pd.DataFrame, column: str, metric: str) -> pd.DataFrame:
    result = frame.copy()
    result[column] = result[column].map(canonical_player)
    result = result.assign(_total=result[metric].map(_num)).sort_values("_total", ascending=False)
    identity = [column, "format"] if "format" in result else [column]
    return result.drop_duplicates(identity).drop(columns="_total")


@lru_cache(maxsize=1)
def _tables() -> dict[str, pd.DataFrame]:
    return {
        name: _canonical_rows(frame, "Player", "Runs" if name in _BATTING_TABLES.values() else "Wkts")
        if "Player" in frame else frame
        for name, frame in _source_tables().items()
    }


@lru_cache(maxsize=1)
def _fresh_batting() -> pd.DataFrame:
    return _canonical_rows(_source_batting(), "player", "runs")


@lru_cache(maxsize=1)
def _fresh_bowling() -> pd.DataFrame:
    return _canonical_rows(_source_bowling(), "player", "wickets")


@lru_cache(maxsize=1)
def _all_players() -> list[str]:
    names: set[str] = set()
    tables = _tables()
    for table_name in list(_BATTING_TABLES.values()) + list(_BOWLING_TABLES.values()):
        names.update(tables[table_name]["Player"].tolist())
    names.update(_fresh_batting()["player"].tolist())
    names.update(_fresh_bowling()["player"].tolist())
    return sorted(names)


@lru_cache(maxsize=1)
def _prominence_scores() -> dict[str, float]:
    """A rough "how well-known is this player" score (runs, or wickets weighted up since
    they're numerically smaller) used to rank search results — without it, obscure associate
    players alphabetically ahead of e.g. "SPD Smith" push real stars past the result limit."""
    scores: dict[str, float] = {}

    def _bump(player, value):
        if value is None:
            return
        if value > scores.get(player, 0):
            scores[player] = value

    tables = _tables()
    for table in _BATTING_TABLES.values():
        for player, runs in zip(tables[table]["Player"], tables[table]["Runs"]):
            _bump(player, _num(runs) or 0)
    for table in _BOWLING_TABLES.values():
        for player, wkts in zip(tables[table]["Player"], tables[table]["Wkts"]):
            _bump(player, (_num(wkts) or 0) * 20)
    for player, runs in zip(_fresh_batting()["player"], _fresh_batting()["runs"]):
        _bump(player, float(runs))
    for player, wkts in zip(_fresh_bowling()["player"], _fresh_bowling()["wickets"]):
        _bump(player, float(wkts) * 20)
    return scores


def search_players(query: str, limit: int = 15) -> list[str]:
    """Case-insensitive substring search, ranked by prominence (see _prominence_scores)."""
    q = query.strip().lower()
    players = _all_players()
    if q:
        matches = {canonical for alias, canonical in _player_aliases().items() if q in alias.lower()}
        players = [p for p in players if q in p.lower() or p in matches]
    scores = _prominence_scores()
    players = sorted(players, key=lambda p: (-scores.get(p, 0), p))
    return players[:limit]


_NUMERIC_JUNK_RE = re.compile(r"[^0-9.\-]")


def _num(value, kind=float):
    """Robust numeric coercion: the leaderboard CSVs occasionally have scraping artifacts
    like "111*" (Mat) or "768+" (4s) mixed into otherwise-numeric columns; strip anything
    that isn't a digit/dot/minus instead of crashing the whole request over one bad row."""
    if pd.isna(value):
        return None
    if isinstance(value, str):
        value = _NUMERIC_JUNK_RE.sub("", value)
        if value in ("", "-", "."):
            return None
    try:
        return kind(value)
    except (ValueError, TypeError):
        return None


def _batting_stats(table_name: str, player: str) -> Optional[dict]:
    df = _tables()[table_name]
    row = df[df["Player"] == player]
    if row.empty:
        return None
    r = row.iloc[0]
    return {
        "matches": _num(r.get("Mat"), int),
        "innings": _num(r.get("Inns"), int),
        "runs": _num(r.get("Runs"), int),
        "highest_score": str(r["HS"]) if "HS" in r and pd.notna(r["HS"]) else None,
        "average": _num(r.get("Ave")),
        "strike_rate": _num(r.get("SR")),
        "hundreds": _num(r.get("100"), int),
        "fifties": _num(r.get("50"), int),
        "source": "leaderboard",
    }


def _bowling_stats(table_name: str, player: str) -> Optional[dict]:
    df = _tables()[table_name]
    row = df[df["Player"] == player]
    if row.empty:
        return None
    r = row.iloc[0]
    return {
        "matches": _num(r.get("Mat"), int),
        "innings": _num(r.get("Inns"), int),
        "wickets": _num(r.get("Wkts"), int),
        "best_bowling": str(r["BBI"]) if "BBI" in r and pd.notna(r["BBI"]) else None,
        "average": _num(r.get("Ave")),
        "economy": _num(r.get("Econ")),
        "strike_rate": _num(r.get("SR")),
        "source": "leaderboard",
    }


def _fresh_batting_stats(fmt: str, player: str) -> Optional[dict]:
    row = _fresh_batting()
    row = row[(row["player"] == player) & (row["format"] == fmt)]
    if row.empty:
        return None
    r = row.iloc[0]
    return {
        "matches": int(r["matches"]),
        "innings": int(r["innings"]),
        "runs": int(r["runs"]),
        "highest_score": str(int(r["highest_score"])),
        "average": _num(r.get("average")),
        "strike_rate": _num(r.get("strike_rate")),
        "hundreds": int(r["hundreds"]),
        "fifties": int(r["fifties"]),
        "source": "ball_by_ball_2003_2024",
    }


def _fresh_bowling_stats(fmt: str, player: str) -> Optional[dict]:
    row = _fresh_bowling()
    row = row[(row["player"] == player) & (row["format"] == fmt)]
    if row.empty:
        return None
    r = row.iloc[0]
    return {
        "matches": int(r["matches"]),
        "innings": None,
        "wickets": int(r["wickets"]),
        "best_bowling": None,
        "average": _num(r.get("average")),
        "economy": _num(r.get("economy")),
        "strike_rate": _num(r.get("strike_rate")),
        "source": "ball_by_ball_2003_2024",
    }


def _better(static: Optional[dict], fresh: Optional[dict], metric: str) -> Optional[dict]:
    """Picks whichever of static/fresh has the larger `metric` (runs or wickets) — a
    smaller total always means that source is missing part of the player's career."""
    if fresh is None:
        return static
    if static is None:
        return fresh
    return fresh if fresh[metric] >= static[metric] else static


def _player_image(player: str) -> Optional[str]:
    for df in (_fresh_batting(), _fresh_bowling()):
        row = df[df["player"] == player]
        if not row.empty and pd.notna(row.iloc[0]["image_url"]):
            return str(row.iloc[0]["image_url"])
    return None


def get_player_profile(player: str) -> Optional[dict]:
    """Returns {"player": ..., "image_url": ..., "batting": {fmt: {...}}, "bowling": {fmt: {...}}} or None if unknown."""
    player = canonical_player(player)
    batting = {}
    for fmt, table in _BATTING_TABLES.items():
        merged = _better(_batting_stats(table, player), _fresh_batting_stats(fmt, player), "runs")
        if merged:
            batting[fmt] = merged
    bowling = {}
    for fmt, table in _BOWLING_TABLES.items():
        merged = _better(_bowling_stats(table, player), _fresh_bowling_stats(fmt, player), "wickets")
        if merged:
            bowling[fmt] = merged
    if not batting and not bowling:
        return None
    return {"player": player, "image_url": _player_image(player), "batting": batting, "bowling": bowling}
