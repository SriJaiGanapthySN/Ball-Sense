import { useEffect, useState } from "react";
import { BarChart3, Crown, Loader2, Swords, Wand2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getTeams, predictSeries } from "../api.js";
import TeamBadge from "./TeamBadge.jsx";
import TeamSelect from "./TeamSelect.jsx";
import { jerseyColor, readableTextColor } from "./jerseyColors.js";

const FORMATS = ["ODI", "Test", "T20I"];

function pct(v) {
  return v === null || v === undefined ? "-" : `${(v * 100).toFixed(1)}%`;
}

function TeamCard({ team, stats, favored }) {
  return (
    <div className={`card team-card${favored ? " favored" : ""}`}>
      {favored && (
        <div className="favored-badge">
          <Crown size={13} /> Favored
        </div>
      )}
      <div className="team-card-head">
        <TeamBadge name={team} size={40} showLabel={false} />
        <h4>{team}</h4>
      </div>
      <div className="stat-row">
        <span>Series played</span>
        <b>{stats.series_played}</b>
      </div>
      <div className="stat-row">
        <span>Series won</span>
        <b>{stats.series_won}</b>
      </div>
      <div className="stat-row">
        <span>Win rate</span>
        <b>{pct(stats.win_rate)}</b>
      </div>
      <div className="stat-row">
        <span>Home win rate</span>
        <b>{pct(stats.home_win_rate)}</b>
      </div>
      <div className="stat-row">
        <span>Away win rate</span>
        <b>{pct(stats.away_win_rate)}</b>
      </div>
    </div>
  );
}

export default function PredictorTab() {
  const [format, setFormat] = useState("ODI");
  const [teams, setTeams] = useState([]);
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [neutral, setNeutral] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getTeams(format)
      .then((res) => {
        if (cancelled) return;
        setTeams(res.teams);
        setTeamA(res.teams[0] || "");
        setTeamB(res.teams[1] || res.teams[0] || "");
        setResult(null);
      })
      .catch((err) => setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [format]);

  async function handlePredict() {
    if (teamA === teamB) {
      setError("Pick two different teams.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await predictSeries({ team_a: teamA, team_b: teamB, format, neutral });
      // Snapshot the team names alongside the result - if the dropdowns change afterwards,
      // the result stays paired with the teams it was actually computed for.
      setResult({ ...res, teamALabel: teamA, teamBLabel: teamB });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const resultTeamA = result?.teamALabel ?? teamA;
  const resultTeamB = result?.teamBLabel ?? teamB;

  const pctA = result ? result.prob_team_a * 100 : 0;
  const pctB = 100 - pctA;

  // Per-team kit colors instead of a fixed gold/emerald pair - falls back to the theme
  // accent colors when a team's jersey color isn't known, and nudges apart any accidental clash.
  let colorA = jerseyColor(resultTeamA) || "#71c9a0";
  let colorB = jerseyColor(resultTeamB) || "#d7b779";
  if (colorA === colorB) colorB = colorA === "#d7b779" ? "#71c9a0" : "#d7b779";
  const textA = readableTextColor(colorA);
  const textB = readableTextColor(colorB);

  const chartData = result
    ? [
        { metric: "Win rate", [resultTeamA]: (result.team_a_stats.win_rate ?? 0) * 100, [resultTeamB]: (result.team_b_stats.win_rate ?? 0) * 100 },
        { metric: "Home rate", [resultTeamA]: (result.team_a_stats.home_win_rate ?? 0) * 100, [resultTeamB]: (result.team_b_stats.home_win_rate ?? 0) * 100 },
        { metric: "Away rate", [resultTeamA]: (result.team_a_stats.away_win_rate ?? 0) * 100, [resultTeamB]: (result.team_b_stats.away_win_rate ?? 0) * 100 },
      ]
    : [];

  return (
    <div className="card">
      <h3 className="section-title">
        <BarChart3 size={19} /> Series Predictor
      </h3>
      <p className="section-caption">
        Logistic-regression model trained on historical bilateral series results (win rates, home
        advantage, head-to-head record) — excludes multi-team tournaments and draws.
      </p>
      {error && <div className="error-banner">{error}</div>}

      <label htmlFor="format-select">Format</label>
      <select id="format-select" value={format} onChange={(e) => setFormat(e.target.value)}>
        {FORMATS.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>

      <div className="field-row" style={{ marginTop: "1rem" }}>
        <TeamSelect
          id="team-a-select"
          label="Touring / Team A"
          teams={teams.filter((t) => t !== teamB)}
          value={teamA}
          onChange={setTeamA}
        />
        <TeamSelect
          id="team-b-select"
          label="Host / Team B"
          teams={teams.filter((t) => t !== teamA)}
          value={teamB}
          onChange={setTeamB}
        />
      </div>

      <div className="vs-widget">
        <TeamBadge name={teamA} />
        <div className="vs-circle">
          <Swords size={18} />
        </div>
        <TeamBadge name={teamB} />
      </div>

      <div className="checkbox-row">
        <input
          id="neutral"
          type="checkbox"
          checked={neutral}
          onChange={(e) => setNeutral(e.target.checked)}
          style={{ width: "auto" }}
        />
        <label htmlFor="neutral" style={{ margin: 0 }}>
          Neutral venue (no home advantage)
        </label>
      </div>

      <button className="btn" onClick={handlePredict} disabled={loading || !teamA || !teamB}>
        {loading ? <Loader2 size={16} className="spin" /> : <Wand2 size={16} />}
        {loading ? "Predicting…" : "Predict winner"}
      </button>

      {result && (
        <div className="predictor-results">
          <h3 className="chart-block-title">Predicted Series Winner</h3>
          <p className="section-caption">Estimated win probability for this matchup, conditional on a decisive series result.</p>
          <div className="prob-bar">
            <div
              className="prob-a"
              style={{ width: `${pctA}%`, background: colorA, color: textA }}
            >
              {resultTeamA} {pctA.toFixed(1)}%
            </div>
            <div
              className="prob-b"
              style={{ width: `${pctB}%`, background: colorB, color: textB }}
            >
              {pctB.toFixed(1)}% {resultTeamB}
            </div>
          </div>

          <div className="chart-widget">
            <h3 className="chart-block-title">Historical Series Win Rates</h3>
            <p className="section-caption">Percentage of recorded series won overall, at home and away. These career records are context, not the prediction above.</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 5" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="metric" stroke="var(--muted)" fontSize={11} />
                <YAxis stroke="var(--muted)" fontSize={11} unit="%" />
                <Tooltip
                  contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 5 }}
                  labelStyle={{ color: "var(--text)" }}
                  formatter={(value) => `${Number(value).toFixed(1)}%`}
                />
                <Legend />
                <Bar dataKey={resultTeamA} fill={colorA} radius={[6, 6, 0, 0]} />
                <Bar dataKey={resultTeamB} fill={colorB} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="team-grid">
            <TeamCard team={resultTeamA} stats={result.team_a_stats} favored={pctA >= pctB} />
            <TeamCard team={resultTeamB} stats={result.team_b_stats} favored={pctB > pctA} />
          </div>
        </div>
      )}
    </div>
  );
}
