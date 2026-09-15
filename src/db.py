"""Builds a local SQLite database from the dataset CSVs and exposes a read-only,
SELECT-only query helper so an LLM can safely query the data (no writes/DDL allowed).
"""
import re
import sqlite3
from pathlib import Path

import pandas as pd

from .data_loader import load_all

ROOT_DIR = Path(__file__).resolve().parent.parent
DB_PATH = ROOT_DIR / "data" / "cricket.db"

_FORBIDDEN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|DETACH|PRAGMA|VACUUM|TRIGGER|GRANT)\b",
    re.IGNORECASE,
)

SCHEMA_DESCRIPTION = """
Tables (all read-only):
  odi_batting, test_batting, t20_batting:
    Player, Span, Mat, Inns, NO, Runs, HS, Ave, BF, SR, "100", "50", "0", "4s", "6s", Format
  odi_bowling, test_bowling, t20_bowling:
    Player, Span, Mat, Inns, Balls/Overs, Runs, Wkts, BBI, Ave, Econ, SR, Format (columns vary slightly per format)
  odi_series, test_series, t20_series:
    "Series/Tournament", Season, Winner, Margin, Format
All tables only contain top all-time career leaderboard rows (not full player lists) and
historical series results. Column names with special characters must be quoted, e.g. "100".
"""


def build_database(force: bool = False) -> Path:
    """(Re)builds data/cricket.db from the CSVs. Safe to call repeatedly."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists() and not force:
        return DB_PATH
    tables = load_all()
    conn = sqlite3.connect(DB_PATH)
    try:
        for name, df in tables.items():
            df.to_sql(name, conn, if_exists="replace", index=False)
        conn.commit()
    finally:
        conn.close()
    return DB_PATH


def _get_readonly_connection() -> sqlite3.Connection:
    if not DB_PATH.exists():
        build_database()
    uri = f"file:{DB_PATH.as_posix()}?mode=ro"
    return sqlite3.connect(uri, uri=True)


def run_safe_select(sql: str, max_rows: int = 200) -> pd.DataFrame:
    """Executes a single read-only SELECT statement. Raises ValueError on anything else."""
    cleaned = sql.strip().rstrip(";").strip()
    if ";" in cleaned:
        raise ValueError("Only a single SQL statement is allowed.")
    if not re.match(r"^(SELECT|WITH)\b", cleaned, re.IGNORECASE):
        raise ValueError("Only SELECT (or WITH ... SELECT) queries are allowed.")
    if _FORBIDDEN.search(cleaned):
        raise ValueError("Query contains a disallowed keyword.")

    conn = _get_readonly_connection()
    try:
        df = pd.read_sql_query(cleaned, conn)
    finally:
        conn.close()
    if len(df) > max_rows:
        df = df.head(max_rows)
    return df


if __name__ == "__main__":
    path = build_database(force=True)
    print(f"Built database at {path}")
