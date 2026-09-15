import csv
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

from src.train_hand_opponent import NATIONS


ROOT = Path(__file__).resolve().parents[1]


def phase_for(format_name, over):
    return "powerplay" if over < (6 if format_name == "T20" else 10) else "death" if over >= (16 if format_name == "T20" else 40) else "middle"


def fit(source):
    counts = defaultdict(Counter)
    held_out = Counter()
    wickets = defaultdict(int)
    matches = {"train": set(), "test": set()}
    dates = []
    with source.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            format_name = row["format"]
            if format_name not in {"T20", "ODI"} or row["gender"] != "male" or row["innings"] != "2":
                continue
            if row["batting_team"] not in NATIONS or row["bowling_team"] not in NATIONS:
                continue
            match_id = row["match_id"]
            lost = wickets[match_id]
            wicket = int(bool(row["player_dismissed"]) and row["wicket_type"] not in {"retired hurt", "retired not out"})
            wickets[match_id] += wicket
            runs = int(row["runs_off_bat"]) + int(float(row["extras"] or 0))
            legal = int(not (float(row["wides"] or 0) or float(row["noballs"] or 0)))
            if not 0 <= runs <= 12 or lost >= 10:
                continue
            phase = phase_for(format_name, float(row["ball"]))
            bucket = min(2, lost // 3)
            outcome = (runs, wicket, legal)
            date = row["start_date"]
            if date >= "2024-01-01":
                matches["test"].add(match_id)
                held_out[(format_name, phase, bucket, outcome)] += 1
            else:
                matches["train"].add(match_id)
                counts[(format_name, phase, bucket)][outcome] += 1
                dates.append(date)
    cells = {}
    for format_name in ["T20", "ODI"]:
        cells[format_name] = {}
        for phase in ["powerplay", "middle", "death"]:
            pooled = sum((counts[(format_name, phase, bucket)] for bucket in range(3)), Counter())
            if not pooled:
                raise ValueError(f"No training deliveries for {format_name}/{phase}")
            total = sum(pooled.values())
            cells[format_name][phase] = []
            for bucket in range(3):
                local = counts[(format_name, phase, bucket)]
                denominator = sum(local.values()) + 200
                cells[format_name][phase].append({"samples": sum(local.values()), "outcomes": [
                    [*outcome, (local[outcome] + 200 * count / total) / denominator]
                    for outcome, count in sorted(pooled.items())
                ]})
    validation = {}
    for format_name in cells:
        old_weights = [0.35, 0.34, 0.1, 0.01, 0.14, 0.06] if format_name == "T20" else [0.41, 0.35, 0.12, 0.005, 0.09, 0.025]
        supported = [0, 1, 2, 3, 4, 6]
        old_loss = new_loss = samples = 0
        for (format_key, phase, bucket, outcome), count in held_out.items():
            runs, wicket, legal = outcome
            if format_key != format_name or not legal or (wicket and runs) or (not wicket and runs not in supported):
                continue
            wicket_rate = (0.045 if format_name == "T20" else 0.03) * (1.2 if phase == "death" else 1)
            old_probability = wicket_rate if wicket else (1 - wicket_rate) * old_weights[supported.index(runs)]
            distribution = cells[format_name][phase][bucket]["outcomes"]
            common = [entry for entry in distribution if entry[2] and (entry[1] and entry[0] == 0 or not entry[1] and entry[0] in supported)]
            probability = sum(entry[3] for entry in common if tuple(entry[:3]) == outcome) / sum(entry[3] for entry in common)
            old_loss -= count * math.log(max(old_probability, 1e-9))
            new_loss -= count * math.log(max(probability, 1e-9))
            samples += count
        validation[format_name] = {"deliveries": samples, "oldLogLoss": old_loss / samples, "modelLogLoss": new_loss / samples}
    return {"version": 1, "source": "dataset/ball_by_ball_data.csv", "scope": "Sampled men's international second innings; T20 and ODI", "trainedThrough": max(dates), "trainingMatches": len(matches["train"]), "holdoutMatches": len(matches["test"]), "holdoutFrom": "2024-01-01", "validation": validation, "cells": cells}


if __name__ == "__main__":
    model = fit(ROOT / "dataset" / "ball_by_ball_data.csv")
    destination = ROOT / "frontend" / "src" / "lib" / "chaseModel.json"
    destination.write_text(json.dumps(model, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in model.items() if key != "cells"}, indent=2))