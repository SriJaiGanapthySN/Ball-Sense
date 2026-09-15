"""Parses historical series results (odt/tt/twt) into a team-vs-team dataset and trains
a leakage-free "who wins the series" classifier using only prior-to-that-point form.

Limitations (by design, documented for users): only bilateral/neutral two-team series rows
are used for training; multi-team tournaments (tri-series, World Cups, etc.) are skipped
because the winner can't be cleanly attributed to a single opponent. Draws/ties/no-results
are also excluded from training so the model's output is a clean P(team A wins).
"""
import re
from pathlib import Path

import joblib
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from .data_loader import load_all

ROOT_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT_DIR / "data" / "series_model.joblib"

_NON_DECISIVE = {"drawn", "tied", "no result", "abandoned", "shared", "-"}

_PAREN_RE = re.compile(r"\(([^(),]+?)\s+in\s+([^(),]+?)\)\s*$", re.IGNORECASE)
_INLINE_RE = re.compile(
    r"^([^,]+?)\s+in\s+([^,]+?)\s+(?:ODI|Test|T20I|Twenty20)\s+(?:Series|Match)$", re.IGNORECASE
)
_NEUTRAL_RE = re.compile(
    r"^([^,]+?)\s+v\s+(.+?)\s+(?:ODI|Test|T20I|Twenty20)\s+(?:Series|Match)\s*\(in\s+[^)]+\)$",
    re.IGNORECASE,
)
_YEAR_RE = re.compile(r"\d{4}")


def parse_series_title(text: str):
    """Returns (team_a, team_b, kind) where kind is 'bilateral', 'neutral' or 'multi'.

    For 'bilateral', team_a is the touring side and team_b is the host (home advantage).
    For 'neutral', team_a/team_b played each other at a non-home venue for either side.
    """
    text = str(text).strip()
    m = _PAREN_RE.search(text)
    if m:
        return m.group(1).strip(), m.group(2).strip(), "bilateral"
    m = _INLINE_RE.match(text)
    if m:
        return m.group(1).strip(), m.group(2).strip(), "bilateral"
    m = _NEUTRAL_RE.match(text)
    if m:
        return m.group(1).strip(), m.group(2).strip(), "neutral"
    return None, None, "multi"


def parse_season_year(season: str):
    m = _YEAR_RE.search(str(season))
    return int(m.group()) if m else None


def _new_team_stat() -> dict:
    return {"matches": 0, "wins": 0, "home_matches": 0, "home_wins": 0, "away_matches": 0, "away_wins": 0}


def _new_h2h_stat() -> dict:
    return {"matches": 0, "wins": {}}


FEATURE_COLUMNS = [
    "a_win_rate", "b_win_rate", "a_away_win_rate", "b_home_win_rate",
    "h2h_a_win_rate", "h2h_matches", "a_matches", "b_matches", "is_neutral",
    "fmt_ODI", "fmt_Test", "fmt_T20I",
]


def _make_features(team_stats, h2h_stats, team_a, team_b, fmt, is_neutral):
    a = team_stats.get((team_a, fmt), _new_team_stat())
    b = team_stats.get((team_b, fmt), _new_team_stat())
    key = (frozenset((team_a, team_b)), fmt)
    h2h = h2h_stats.get(key, _new_h2h_stat())
    # Only decisive head-to-head results (drawn/tied series don't credit either team a win),
    # so h2h_a_win_rate(A vs B) + h2h_a_win_rate(B vs A) always sums to exactly 1 - otherwise
    # swapping which team is labeled "A" skews the prediction for the identical matchup.
    decisive_h2h = sum(h2h["wins"].values())

    a_win_rate = a["wins"] / a["matches"] if a["matches"] else 0.5
    b_win_rate = b["wins"] / b["matches"] if b["matches"] else 0.5

    if is_neutral:
        # No host on a neutral ground, so a team-specific home/away split isn't meaningful -
        # use each team's overall win rate instead, otherwise predictions for the exact same
        # neutral matchup depend on which team happens to be labeled "A" vs "B".
        a_location_rate = a_win_rate
        b_location_rate = b_win_rate
    else:
        a_location_rate = a["away_wins"] / a["away_matches"] if a["away_matches"] else 0.5
        b_location_rate = b["home_wins"] / b["home_matches"] if b["home_matches"] else 0.5

    row = {
        "a_win_rate": a_win_rate,
        "b_win_rate": b_win_rate,
        "a_away_win_rate": a_location_rate,
        "b_home_win_rate": b_location_rate,
        "h2h_a_win_rate": (h2h["wins"].get(team_a, 0) / decisive_h2h) if decisive_h2h else 0.5,
        "h2h_matches": h2h["matches"],
        "a_matches": a["matches"],
        "b_matches": b["matches"],
        "is_neutral": 1 if is_neutral else 0,
        "fmt_ODI": 1 if fmt == "ODI" else 0,
        "fmt_Test": 1 if fmt == "Test" else 0,
        "fmt_T20I": 1 if fmt == "T20I" else 0,
    }
    return row


class SeriesPredictor:
    def __init__(self):
        self.pipeline: Pipeline | None = None
        self.team_stats: dict = {}
        self.h2h_stats: dict = {}
        self.teams_by_format: dict = {}

    def fit(self, series_tables: dict[str, pd.DataFrame]):
        rows = []
        # Concatenate all three series tables and sort chronologically so stats only ever
        # reflect what happened *before* the row being featurized (no data leakage).
        all_rows = pd.concat(series_tables.values(), ignore_index=True)
        all_rows["_year"] = all_rows["Season"].map(parse_season_year)
        all_rows = all_rows.sort_values("_year", kind="stable", na_position="first")

        team_stats: dict[tuple, dict] = {}
        h2h_stats: dict[tuple, dict] = {}
        teams_by_format: dict[str, set] = {"ODI": set(), "Test": set(), "T20I": set()}

        for _, row in all_rows.iterrows():
            fmt = row["Format"]
            team_a, team_b, kind = parse_series_title(row["Series/Tournament"])
            if kind == "multi" or team_a is None:
                continue
            winner = str(row["Winner"]).strip()
            teams_by_format[fmt].update([team_a, team_b])

            decisive = winner not in _NON_DECISIVE and winner in (team_a, team_b)
            if decisive:
                feat = _make_features(team_stats, h2h_stats, team_a, team_b, fmt, kind == "neutral")
                feat["label"] = 1 if winner == team_a else 0
                rows.append(feat)

            # Update running stats regardless of whether this row was usable for training,
            # so future rows still benefit from the extra sample.
            a_stat = team_stats.setdefault((team_a, fmt), _new_team_stat())
            b_stat = team_stats.setdefault((team_b, fmt), _new_team_stat())
            a_stat["matches"] += 1
            b_stat["matches"] += 1
            if winner == team_a:
                a_stat["wins"] += 1
            elif winner == team_b:
                b_stat["wins"] += 1
            if kind == "bilateral":
                a_stat["away_matches"] += 1
                b_stat["home_matches"] += 1
                if winner == team_a:
                    a_stat["away_wins"] += 1
                elif winner == team_b:
                    b_stat["home_wins"] += 1

            h2h_key = (frozenset((team_a, team_b)), fmt)
            h2h = h2h_stats.setdefault(h2h_key, _new_h2h_stat())
            h2h["matches"] += 1
            if winner in (team_a, team_b):
                h2h["wins"][winner] = h2h["wins"].get(winner, 0) + 1

        self.team_stats = team_stats
        self.h2h_stats = h2h_stats
        self.teams_by_format = {fmt: sorted(teams) for fmt, teams in teams_by_format.items()}

        train_df = pd.DataFrame(rows)
        X = train_df[FEATURE_COLUMNS]
        y = train_df["label"]
        self.pipeline = Pipeline([
            ("scale", StandardScaler()),
            ("clf", LogisticRegression(max_iter=1000)),
        ])
        self.pipeline.fit(X, y)
        return self

    def predict_proba(self, team_a: str, team_b: str, fmt: str, neutral: bool = False) -> float:
        """Returns P(team_a wins) a hypothetical series against team_b in the given format."""
        if self.pipeline is None:
            raise RuntimeError("Model not trained/loaded yet.")
        feat = _make_features(self.team_stats, self.h2h_stats, team_a, team_b, fmt, neutral)
        X = pd.DataFrame([feat])[FEATURE_COLUMNS]
        return float(self.pipeline.predict_proba(X)[0][1])

    def get_team_summary(self, team: str, fmt: str) -> dict:
        """Note: these are bilateral/neutral SERIES counts (one row per series in the CSVs),
        not individual match counts — a team's real match count is much higher."""
        stat = self.team_stats.get((team, fmt), _new_team_stat())
        return {
            "series_played": stat["matches"],
            "series_won": stat["wins"],
            "win_rate": round(stat["wins"] / stat["matches"], 3) if stat["matches"] else None,
            "home_win_rate": round(stat["home_wins"] / stat["home_matches"], 3) if stat["home_matches"] else None,
            "away_win_rate": round(stat["away_wins"] / stat["away_matches"], 3) if stat["away_matches"] else None,
        }

    def save(self, path: Path = MODEL_PATH):
        # Dump a plain dict bundle (not `self`) so the file loads fine regardless of
        # whether this module was imported as `src.series_predictor` or run as `__main__`.
        path.parent.mkdir(parents=True, exist_ok=True)
        bundle = {
            "pipeline": self.pipeline,
            "team_stats": self.team_stats,
            "h2h_stats": self.h2h_stats,
            "teams_by_format": self.teams_by_format,
        }
        joblib.dump(bundle, path)

    @staticmethod
    def load(path: Path = MODEL_PATH) -> "SeriesPredictor":
        bundle = joblib.load(path)
        model = SeriesPredictor()
        model.pipeline = bundle["pipeline"]
        model.team_stats = bundle["team_stats"]
        model.h2h_stats = bundle["h2h_stats"]
        model.teams_by_format = bundle["teams_by_format"]
        return model


def train_and_save() -> SeriesPredictor:
    tables = load_all()
    series_tables = {k: v for k, v in tables.items() if k.endswith("_series")}
    model = SeriesPredictor().fit(series_tables)
    model.save()
    return model


def load_or_train() -> SeriesPredictor:
    if MODEL_PATH.exists():
        return SeriesPredictor.load()
    return train_and_save()


if __name__ == "__main__":
    m = train_and_save()
    print("Trained on formats:", {k: len(v) for k, v in m.teams_by_format.items()})
    print("Example: India vs Australia (ODI, India home) ->",
          m.predict_proba("Australia", "India", "ODI"))
