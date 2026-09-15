"""Aggregates men's international career stats from the ball-by-ball dataset
(dataset/ball_by_ball_data.csv, ~4.4M deliveries covering 2003-2025).

This is the "fresh" data source used to keep active players' stats current — the
static leaderboard CSVs in data_loader.py were scraped at a single point in time and
go stale for players still playing. The raw file mixes the Indian Premier League into
its T20 rows (the only domestic league present); we filter that out to keep T20I clean.

Results are cached to data/bbl_*.parquet since aggregating 4.4M rows is not cheap;
delete those files (or call build(force=True)) to rebuild after the CSV changes.
"""
from pathlib import Path
from functools import lru_cache
from threading import Lock

import numpy as np
import pandas as pd

ROOT_DIR = Path(__file__).resolve().parent.parent
RAW_PATH = ROOT_DIR / "dataset" / "ball_by_ball_data.csv"
CACHE_DIR = ROOT_DIR / "data"
BATTING_CACHE = CACHE_DIR / "bbl_batting_stats.parquet"
BOWLING_CACHE = CACHE_DIR / "bbl_bowling_stats.parquet"
RUNS_BY_YEAR_CACHE = CACHE_DIR / "bbl_runs_by_year.parquet"
TEAM_RUNS_BY_YEAR_CACHE = CACHE_DIR / "bbl_team_runs_by_year.parquet"
_TEAM_YEAR_LOCK = Lock()

_COLUMNS = [
    "match_id", "season", "innings", "striker", "bowler",
    "runs_off_bat", "wides", "noballs", "wicket_type", "player_dismissed", "wicket",
    "gender", "event", "format",
    "full name_striker", "country_striker", "image url_striker",
    "full name_bowler", "country_bowler", "image url_bowler",
]

_FORMAT_LABELS = {"Test": "Test", "ODI": "ODI", "T20": "T20I"}
# Wicket types not credited to the bowler.
_NOT_BOWLER_WICKET = {"run out", "retired hurt", "retired out", "retired not out", "obstructing the field"}

# The static leaderboard CSVs (data_loader.py) tag players with these abbreviations for
# major nations (mixed with a few full names like "INDIA"). The ball-by-ball dataset's
# `country_striker`/`country_bowler` columns use full country names instead - without this
# mapping the same real player ends up as two different search results (e.g. "JE Root (ENG)"
# from the static CSV vs "JE Root (ENGLAND)" from ball-by-ball) and the two sources never
# merge, so "prefer the fresher/larger total" silently never fires for most non-Indian players.
_COUNTRY_TAG = {
    "england": "ENG", "australia": "AUS", "south africa": "SA", "new zealand": "NZ",
    "west indies": "WI", "sri lanka": "SL", "pakistan": "PAK", "bangladesh": "BAN",
    "zimbabwe": "ZIM", "ireland": "IRE", "namibia": "NAM", "netherlands": "NED",
    "united arab emirates": "UAE", "hong kong": "HKG", "canada": "CAN", "scotland": "SCOT",
    "oman": "OMA", "papua new guinea": "PNG", "jersey": "JER", "malaysia": "MAL",
    "malta": "MLT", "malawi": "MWI", "uganda": "UGA", "qatar": "QAT", "afghanistan": "AFG",
    "india": "INDIA", "kenya": "KENYA", "nepal": "NEPAL",
}


def _season_year(season) -> "int | None":
    """Handles both plain years (2017) and split seasons ('2007/08' -> 2007)."""
    try:
        return int(str(season)[:4])
    except ValueError:
        return None


def _load_raw() -> pd.DataFrame:
    df = pd.read_csv(RAW_PATH, usecols=_COLUMNS, low_memory=False)
    df = df[(df["gender"] == "male") & (df["event"] != "Indian Premier League")].copy()
    df["format"] = df["format"].map(_FORMAT_LABELS)
    df = df[df["format"].notna()]
    df["year"] = df["season"].map(_season_year)
    return df


def _player_display(short_name, country) -> str:
    if not (pd.notna(country) and str(country).strip()):
        return str(short_name)
    tag = _COUNTRY_TAG.get(str(country).strip().lower(), str(country).upper())
    return f"{short_name} ({tag})"


def _build_batting(df: pd.DataFrame) -> pd.DataFrame:
    faced = df[df["wides"].isna() | (df["wides"] == 0)]
    per_innings = faced.groupby(["striker", "format", "match_id", "innings"], as_index=False).agg(
        runs=("runs_off_bat", "sum"), balls=("runs_off_bat", "size")
    )
    dismissed = (
        df.loc[df["player_dismissed"].notna(), ["player_dismissed", "format", "match_id", "innings"]]
        .rename(columns={"player_dismissed": "striker"})
        .drop_duplicates()
    )
    dismissed["is_out"] = 1
    per_innings = per_innings.merge(dismissed, on=["striker", "format", "match_id", "innings"], how="left")
    per_innings["is_out"] = per_innings["is_out"].fillna(0).astype(int)
    per_innings["year"] = per_innings["match_id"].map(df.drop_duplicates("match_id").set_index("match_id")["year"])

    grouped = per_innings.groupby(["striker", "format"], as_index=False).agg(
        matches=("match_id", "nunique"),
        innings=("match_id", "size"),
        runs=("runs", "sum"),
        balls=("balls", "sum"),
        highest_score=("runs", "max"),
        outs=("is_out", "sum"),
        hundreds=("runs", lambda s: int((s >= 100).sum())),
        fifties=("runs", lambda s: int(((s >= 50) & (s < 100)).sum())),
        first_year=("year", "min"),
        last_year=("year", "max"),
    )
    grouped["average"] = np.where(grouped["outs"] > 0, grouped["runs"] / grouped["outs"], np.nan)
    grouped["strike_rate"] = np.where(grouped["balls"] > 0, grouped["runs"] / grouped["balls"] * 100, np.nan)
    grouped["average"] = grouped["average"].round(2)
    grouped["strike_rate"] = grouped["strike_rate"].round(2)

    meta = (
        df[["striker", "full name_striker", "country_striker", "image url_striker"]]
        .dropna(subset=["striker"])
        .drop_duplicates(subset=["striker"], keep="last")
        .rename(columns={
            "full name_striker": "full_name", "country_striker": "country", "image url_striker": "image_url",
        })
    )
    grouped = grouped.merge(meta, on="striker", how="left")
    grouped["player"] = grouped.apply(lambda r: _player_display(r.striker, r.country), axis=1)
    return grouped


def _build_bowling(df: pd.DataFrame) -> pd.DataFrame:
    legal = df[df["wides"].isna() & df["noballs"].isna()]
    balls_bowled = legal.groupby(["bowler", "format"], as_index=False).agg(
        balls=("bowler", "size"), matches=("match_id", "nunique")
    )

    runs_conceded = df["runs_off_bat"].fillna(0) + df["wides"].fillna(0) + df["noballs"].fillna(0)
    runs_df = df.assign(runs_conceded=runs_conceded).groupby(["bowler", "format"], as_index=False)[
        "runs_conceded"
    ].sum()

    bowler_wickets = df[(df["wicket"] == 1) & (~df["wicket_type"].isin(_NOT_BOWLER_WICKET))]
    wkts_df = bowler_wickets.groupby(["bowler", "format"], as_index=False).size().rename(columns={"size": "wickets"})

    merged = balls_bowled.merge(runs_df, on=["bowler", "format"], how="left").merge(
        wkts_df, on=["bowler", "format"], how="left"
    )
    merged["wickets"] = merged["wickets"].fillna(0).astype(int)
    merged["economy"] = np.where(merged["balls"] > 0, merged["runs_conceded"] / (merged["balls"] / 6), np.nan)
    merged["average"] = np.where(merged["wickets"] > 0, merged["runs_conceded"] / merged["wickets"], np.nan)
    merged["strike_rate"] = np.where(merged["wickets"] > 0, merged["balls"] / merged["wickets"], np.nan)
    merged["economy"] = merged["economy"].round(2)
    merged["average"] = merged["average"].round(2)
    merged["strike_rate"] = merged["strike_rate"].round(2)

    meta = (
        df[["bowler", "full name_bowler", "country_bowler", "image url_bowler"]]
        .dropna(subset=["bowler"])
        .drop_duplicates(subset=["bowler"], keep="last")
        .rename(columns={
            "full name_bowler": "full_name", "country_bowler": "country", "image url_bowler": "image_url",
        })
    )
    merged = merged.merge(meta, on="bowler", how="left")
    merged["player"] = merged.apply(lambda r: _player_display(r.bowler, r.country), axis=1)
    return merged


def _build_runs_by_year(df: pd.DataFrame) -> pd.DataFrame:
    grouped = df.groupby(["format", "year"], as_index=False).agg(
        total_runs=("runs_off_bat", "sum"), total_wickets=("wicket", "sum")
    )
    return grouped[grouped["year"].notna()].astype({"year": int})


def build(force: bool = False) -> None:
    if not force and BATTING_CACHE.exists() and BOWLING_CACHE.exists() and RUNS_BY_YEAR_CACHE.exists():
        return
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    df = _load_raw()
    _build_batting(df).to_parquet(BATTING_CACHE, index=False)
    _build_bowling(df).to_parquet(BOWLING_CACHE, index=False)
    _build_runs_by_year(df).to_parquet(RUNS_BY_YEAR_CACHE, index=False)


def load_batting() -> pd.DataFrame:
    build()
    return pd.read_parquet(BATTING_CACHE)


def load_bowling() -> pd.DataFrame:
    build()
    return pd.read_parquet(BOWLING_CACHE)


def load_runs_by_year() -> pd.DataFrame:
    build()
    return pd.read_parquet(RUNS_BY_YEAR_CACHE)


def _aggregate_team_year(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame[(frame["gender"] == "male") & (frame["event"] != "Indian Premier League")].copy()
    frame["format"] = frame["format"].map(_FORMAT_LABELS)
    frame["year"] = frame["season"].map(_season_year)
    return frame.groupby(["batting_team", "format", "year"], as_index=False).agg(
        total_runs=("runs_off_bat", "sum"), total_wickets=("wicket", "sum")
    )


@lru_cache(maxsize=1)
def load_team_runs_by_year() -> pd.DataFrame:
    with _TEAM_YEAR_LOCK:
        if not TEAM_RUNS_BY_YEAR_CACHE.exists() or TEAM_RUNS_BY_YEAR_CACHE.stat().st_mtime < RAW_PATH.stat().st_mtime:
            columns = ["batting_team", "format", "season", "gender", "event", "runs_off_bat", "wicket"]
            chunks = [_aggregate_team_year(chunk) for chunk in pd.read_csv(
                RAW_PATH, usecols=columns, chunksize=250_000, low_memory=False
            )]
            totals = pd.concat(chunks, ignore_index=True).groupby(
                ["batting_team", "format", "year"], as_index=False
            )[["total_runs", "total_wickets"]].sum()
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            totals.to_parquet(TEAM_RUNS_BY_YEAR_CACHE, index=False)
        return pd.read_parquet(TEAM_RUNS_BY_YEAR_CACHE)


if __name__ == "__main__":
    build(force=True)
    bat = load_batting()
    print("Batting rows:", len(bat))
    print(bat.sort_values("runs", ascending=False).head(10)[["player", "format", "runs", "average", "strike_rate"]])
