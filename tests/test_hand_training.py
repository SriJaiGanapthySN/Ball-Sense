import csv
import tempfile
import unittest
from pathlib import Path

from src.train_hand_opponent import fit, phase_for


class HandTrainingTests(unittest.TestCase):
    def fit_rows(self, changes):
        base = {"format": "T20", "gender": "male", "batting_team": "India", "bowling_team": "Australia", "innings": "1", "wides": "", "noballs": "", "runs_off_bat": "4", "ball": "0.1", "striker": "Test Batter", "bowler": "Test Bowler", "player_dismissed": "", "wicket_type": "", "ball_length": "good length", "match_id": "1", "start_date": "2020-01-01"}
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "balls.csv"
            with source.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=list(base))
                writer.writeheader()
                writer.writerows({**base, **change} for change in changes)
            return fit(source)

    def test_training_excludes_franchise_extras_and_super_overs(self):
        model = self.fit_rows([{}, {"batting_team": "Chennai Super Kings"}, {"wides": "1"}, {"noballs": "1"}, {"innings": "3"}, {"format": "ODI"}, {"gender": "female"}])
        self.assertEqual(model["rows"], 1)
        self.assertEqual(model["batters"][0]["phases"]["powerplay"], [0, 0, 0, 0, 1, 0, 0])

    def test_phases_and_bowler_wickets_are_counted_separately(self):
        model = self.fit_rows([{}, {"ball": "6.1", "runs_off_bat": "0", "player_dismissed": "Test Batter", "wicket_type": "run out"}, {"ball": "16.1", "runs_off_bat": "0", "player_dismissed": "Test Batter", "wicket_type": "bowled"}])
        phases = model["bowlers"][0]["phases"]
        self.assertEqual(phases["middle"]["wickets"], 0)
        self.assertEqual(phases["death"]["wickets"], 1)
        self.assertEqual(phases["powerplay"]["length:good length"], 1)
        self.assertEqual([phase_for(over) for over in [0.1, 5.6, 6.1, 15.6, 16.1]], ["powerplay", "powerplay", "middle", "middle", "death"])

    def test_empty_eligible_dataset_fails_explicitly(self):
        with self.assertRaises(ValueError):
            self.fit_rows([{"format": "ODI"}])


if __name__ == "__main__":
    unittest.main()