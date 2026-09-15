import csv
import json
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NATIONS = {"India", "Australia", "England", "New Zealand", "Pakistan", "South Africa", "Sri Lanka", "Bangladesh", "West Indies", "Afghanistan", "Ireland", "Zimbabwe", "Scotland", "Netherlands", "Nepal", "United Arab Emirates", "Oman", "Namibia", "United States of America", "Canada", "Papua New Guinea"}


def phase_for(over):
    return "powerplay" if over < 6 else "death" if over >= 16 else "middle"


def fit(source):
    batting = defaultdict(lambda: defaultdict(Counter))
    bowling = defaultdict(lambda: defaultdict(Counter))
    matches = set()
    rows = 0
    dates = set()
    with source.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            if row["format"] != "T20" or row["gender"] != "male" or row["batting_team"] not in NATIONS or row["bowling_team"] not in NATIONS:
                continue
            if row["innings"] not in {"1", "2"} or float(row["wides"] or 0) or float(row["noballs"] or 0):
                continue
            runs = int(row["runs_off_bat"])
            if runs not in range(7):
                continue
            phase = phase_for(float(row["ball"]))
            striker = row["striker"]
            bowler = row["bowler"]
            batting[striker][phase][str(runs)] += 1
            bowling[bowler][phase]["balls"] += 1
            bowling[bowler][phase]["runs"] += runs
            bowling[bowler][phase]["wickets"] += int(bool(row["player_dismissed"]) and row["wicket_type"] not in {"run out", "retired hurt", "obstructing the field"})
            length = row["ball_length"].strip().lower()
            if length:
                bowling[bowler][phase]["length:" + length] += 1
            rows += 1
            matches.add(row["match_id"])
            dates.add(row["start_date"])
    if not rows:
        raise ValueError("No eligible international T20 deliveries found")

    batters = []
    for name, phases in sorted(batting.items(), key=lambda item: sum(sum(counts.values()) for counts in item[1].values()), reverse=True)[:6]:
        batters.append({"name": name, "balls": sum(sum(counts.values()) for counts in phases.values()), "phases": {phase: [counts[str(runs)] for runs in range(7)] for phase, counts in phases.items()}})
    bowlers = []
    for name, phases in sorted(bowling.items(), key=lambda item: sum(counts["balls"] for counts in item[1].values()), reverse=True)[:6]:
        bowlers.append({"name": name, "balls": sum(counts["balls"] for counts in phases.values()), "phases": dict(phases)})
    return {"version": 1, "source": "dataset/ball_by_ball_data.csv", "scope": "Sampled men's international T20, legal balls, innings 1-2; selected national teams", "method": "Empirical phase-conditioned counts; smoothed at inference. Observational, not causal strategy or a validated player simulation.", "rows": rows, "matches": len(matches), "from": min(dates), "to": max(dates), "batters": batters, "bowlers": bowlers}


if __name__ == "__main__":
    model = fit(ROOT / "dataset" / "ball_by_ball_data.csv")
    destination = ROOT / "frontend" / "src" / "lib" / "cricketTraining.js"
    destination.write_text("export default " + json.dumps(model, indent=2) + ";\n", encoding="utf-8")
    print(json.dumps({key: model[key] for key in ["rows", "matches", "from", "to"]}))
    print("Batters:", ", ".join(player["name"] for player in model["batters"]))
    print("Bowlers:", ", ".join(player["name"] for player in model["bowlers"]))