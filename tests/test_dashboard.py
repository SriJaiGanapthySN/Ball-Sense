import unittest
from types import SimpleNamespace
from unittest.mock import patch

import pandas as pd

from src import dashboard_stats as stats
from src import ballbyball_stats
from backend.routes import dashboard
from fastapi import HTTPException


class DashboardTeamTests(unittest.TestCase):
    def test_yearly_aggregation_uses_batting_team_and_excludes_ipl_and_women(self):
        frame = pd.DataFrame({
            "batting_team": ["India", "Australia", "India", "India", "India"],
            "format": ["ODI", "ODI", "T20", "ODI", "ODI"],
            "season": ["2020/21"] * 5, "gender": ["male", "male", "male", "female", "male"],
            "event": ["Series", "Series", "Indian Premier League", "Series", "Series"],
            "runs_off_bat": [4, 6, 100, 100, 2], "wicket": [0, 1, 0, 0, 1],
        })
        grouped = ballbyball_stats._aggregate_team_year(frame)
        with patch.object(ballbyball_stats, "load_team_runs_by_year", return_value=grouped):
            self.assertEqual(stats.runs_by_year("ODI", team="India"), [{"year": 2020, "runs": 6, "wickets": 1}])
            self.assertEqual(stats.runs_by_year("T20I", team="India"), [])

    def test_routes_forward_team_and_reject_unknown_team(self):
        with patch.object(stats, "available_teams", return_value=["India"]), \
                patch.object(stats, "runs_by_year", return_value=[]) as query:
            self.assertEqual(dashboard.runs_by_year("ODI", "India")["team"], "India")
            query.assert_called_once_with("ODI", team="India")
            with self.assertRaises(HTTPException):
                dashboard.leaderboards(team="Unknown")

    def test_decisive_series_are_filtered_by_participation_not_only_winner(self):
        frame = pd.DataFrame({"Series/Tournament": ["one", "two", "three"], "Winner": ["India", "Australia", "England"]})
        with patch.object(stats, "_tables", return_value={name: frame for name in stats._SERIES.values()}), \
                patch.object(stats, "parse_series_title", side_effect=lambda title: {
                    "one": ("India", "England", "bilateral"), "two": ("India", "Australia", "bilateral"),
                    "three": ("England", "Australia", "bilateral"),
                }[title]):
            self.assertTrue(all(row["count"] == 2 for row in stats.decisive_series_distribution("India")))

    def test_team_filter_happens_before_top_limit(self):
        frame = pd.DataFrame({"player": ["A Player (AUS)", "B Player (INDIA)", "C Player (INDIA)"],
                              "runs": [200, 150, 100], "average": [40, 30, 20]})
        with patch.object(stats, "_merged_batting", return_value=frame):
            self.assertEqual(stats.top_run_scorers("ODI", limit=1, team="India")[0]["player"], "B Player (INDIA)")
            self.assertEqual(stats.top_run_scorers("ODI", limit=1)[0]["player"], "A Player (AUS)")
            self.assertEqual(stats.top_run_scorers("ODI", team="England"), [])

    def test_team_filter_keeps_bowling_qualification(self):
        frame = pd.DataFrame({"player": ["A (INDIA)", "B (INDIA)", "C (AUS)"],
                              "wickets": [2, 100, 200], "economy": [1.0, 4.0, 3.0], "balls": [12, 2000, 3000]})
        with patch.object(stats, "_merged_bowling", return_value=frame):
            self.assertEqual([row["player"] for row in stats.economy_leaders("ODI", team="India")], ["B (INDIA)"])
            self.assertEqual(stats.top_wicket_takers("ODI", team="India")[0]["wickets"], 100)

    def test_team_filter_preserves_former_national_associations(self):
        frame = pd.DataFrame({"player": ["D Wiese (NAM)"], "runs": [100], "average": [20]})
        aliases = {"D Wiese (NAM/SA)": "D Wiese (NAM)", "D Wiese (NAM)": "D Wiese (NAM)"}
        with patch.object(stats, "_merged_batting", return_value=frame), \
                patch.object(stats.player_stats, "_player_aliases", return_value=aliases):
            self.assertEqual(stats.top_run_scorers("ODI", team="South Africa")[0]["player"], "D Wiese (NAM)")

    def test_team_series_rates_and_missing_samples(self):
        model = SimpleNamespace(team_stats={
            ("India", "ODI"): {"matches": 10, "wins": 6, "home_matches": 5, "home_wins": 4, "away_matches": 5, "away_wins": 2},
            ("Australia", "ODI"): {"matches": 20, "wins": 18, "home_matches": 10, "home_wins": 9, "away_matches": 10, "away_wins": 9},
        })
        with patch.object(stats, "load_or_train", return_value=model):
            self.assertEqual(stats.win_pct_by_format(team="India")["ODI"], [{"team": "India", "matches": 10, "win_rate": 0.6}])
            self.assertEqual(stats.home_vs_away_by_format(team="India")["ODI"], {"home_win_rate": 0.8, "away_win_rate": 0.4})
            self.assertIsNone(stats.home_vs_away_by_format(team="India")["Test"]["home_win_rate"])

    def test_real_team_leaderboards_have_no_duplicate_aliases(self):
        for team, tag in [("India", "INDIA"), ("Australia", "AUS"), ("England", "ENG")]:
            rows = stats.top_run_scorers("ODI", team=team)
            self.assertTrue(rows)
            self.assertTrue(all(f"({tag})" in row["player"] for row in rows))
            self.assertEqual(len({row["player"] for row in rows}), len(rows))


if __name__ == "__main__":
    unittest.main()