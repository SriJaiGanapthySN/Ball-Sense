"""Loads and lightly cleans the raw Cricket career/series CSVs into pandas DataFrames."""
from pathlib import Path

import pandas as pd

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "dataset"

# file name -> (logical table name, kind)
_FILES = {
    "odb.csv": ("odi_batting", "batting"),
    "odbo.csv": ("odi_bowling", "bowling"),
    "odt.csv": ("odi_series", "series"),
    "tb.csv": ("test_batting", "batting"),
    "tbo.csv": ("test_bowling", "bowling"),
    "tt.csv": ("test_series", "series"),
    "twb.csv": ("t20_batting", "batting"),
    "twbo.csv": ("t20_bowling", "bowling"),
    "twt.csv": ("t20_series", "series"),
}

FORMAT_BY_TABLE = {
    "odi_batting": "ODI", "odi_bowling": "ODI", "odi_series": "ODI",
    "test_batting": "Test", "test_bowling": "Test", "test_series": "Test",
    "t20_batting": "T20I", "t20_bowling": "T20I", "t20_series": "T20I",
}


def _clean_stat_df(df: pd.DataFrame) -> pd.DataFrame:
    """Drop the stray CSV index column and normalize the Player column."""
    df = df.loc[:, ~df.columns.str.match(r"^Unnamed")].copy()
    if "Player" in df.columns:
        df["Player"] = df["Player"].str.strip()
    return df


def _clean_series_df(df: pd.DataFrame) -> pd.DataFrame:
    """Drop unnamed/empty columns and normalize whitespace in text columns."""
    df = df.loc[:, ~df.columns.str.match(r"^Unnamed")].copy()
    for col in ("Series/Tournament", "Season", "Winner", "Margin"):
        if col in df.columns:
            df[col] = df[col].astype("string").str.strip()
    return df


def load_all() -> dict[str, pd.DataFrame]:
    """Read every CSV in dataset/ and return a dict keyed by logical table name."""
    tables: dict[str, pd.DataFrame] = {}
    for filename, (table_name, kind) in _FILES.items():
        path = DATA_DIR / filename
        df = pd.read_csv(path)
        df = _clean_series_df(df) if kind == "series" else _clean_stat_df(df)
        df["Format"] = FORMAT_BY_TABLE[table_name]
        tables[table_name] = df
    return tables


if __name__ == "__main__":
    for name, frame in load_all().items():
        print(name, frame.shape, list(frame.columns))
