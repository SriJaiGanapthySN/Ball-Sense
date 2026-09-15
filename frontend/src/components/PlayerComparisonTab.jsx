import { useState } from "react";
import { BookmarkPlus, BookOpen, RotateCcw, Sparkles, Swords, Trash2, Users, Loader2, Search } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import PlayerSearchSelect from "./PlayerSearchSelect.jsx";
import { teamGradient, teamInitials } from "./TeamBadge.jsx";
import { flagUrl } from "./countryFlags.js";
import { comparePlayers } from "../api.js";
import { loadNotebook, NOTEBOOK_KEY, NOTEBOOK_LIMIT, saveMatchup } from "../lib/playerComparisons.js";

/** Real player photo when available (from the ball-by-ball dataset), else that player's
 * national flag, else gradient initials (no licensed source for real board/team crest logos,
 * so a flag is the closest safe "which board is this player from" visual identity). */
function PlayerAvatar({ name, imageUrl, size = 56 }) {
  const [photoBroken, setPhotoBroken] = useState(false);
  const [flagBroken, setFlagBroken] = useState(false);
  if (imageUrl && !photoBroken) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className="avatar player-photo"
        style={{ width: size, height: size }}
        onError={() => setPhotoBroken(true)}
      />
    );
  }
  const flag = flagUrl(name, Math.max(40, size));
  if (flag && !flagBroken) {
    return (
      <img
        src={flag}
        alt={name}
        className="avatar player-photo"
        style={{ width: size, height: size }}
        onError={() => setFlagBroken(true)}
      />
    );
  }
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.32, background: teamGradient(name) }}>
      {teamInitials(name)}
    </div>
  );
}

const FORMATS = ["ODI", "Test", "T20I"];

const BATTING_FIELDS = [
  ["runs", "Runs", ""],
  ["average", "Average", ""],
  ["strike_rate", "Strike Rate", ""],
  ["highest_score", "Highest Score", ""],
  ["hundreds", "100s", ""],
  ["fifties", "50s", ""],
];
const BOWLING_FIELDS = [
  ["wickets", "Wickets", ""],
  ["economy", "Economy", ""],
  ["average", "Average", ""],
  ["strike_rate", "Strike Rate", ""],
  ["best_bowling", "Best Bowling", ""],
];

function SourceBadge({ source }) {
  const isFresh = source === "ball_by_ball_2003_2024";
  return (
    <span className={`source-badge ${isFresh ? "fresh" : ""}`}>
      {isFresh ? "updated through 2024" : "all-time leaderboard"}
    </span>
  );
}

function StatBlock({ title, statsByFormat, fields }) {
  const formats = FORMATS.filter((f) => statsByFormat?.[f]);
  if (formats.length === 0) return null;
  return (
    <div className="compare-stat-block">
      <h5>{title}</h5>
      {formats.map((fmt) => (
        <div key={fmt} className="compare-stat-format">
          <span className="format-pill">{fmt}</span>
          <SourceBadge source={statsByFormat[fmt].source} />
          <div>
            {fields.map(([key, label]) => {
              const v = statsByFormat[fmt][key];
              return (
                <div key={key} className="stat-row">
                  <span>{label}</span>
                  <b>{v === null || v === undefined ? "-" : v}</b>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function buildChartData(profileA, profileB, kind, metricKey) {
  return FORMATS.filter((f) => profileA?.[kind]?.[f] || profileB?.[kind]?.[f]).map((fmt) => ({
    format: fmt,
    [profileA.player]: profileA?.[kind]?.[fmt]?.[metricKey] ?? 0,
    [profileB.player]: profileB?.[kind]?.[fmt]?.[metricKey] ?? 0,
  }));
}

function ComparisonChart({ title, caption, data, playerA, playerB, colorA, colorB }) {
  if (data.length === 0) return null;
  return (
    <div className="chart-block">
      <h4 className="chart-block-title">{title}</h4>
      {caption && <p className="section-caption">{caption}</p>}
      <div className="chart-widget">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 5" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="format" stroke="var(--muted)" fontSize={11} />
            <YAxis stroke="var(--muted)" fontSize={11} />
            <Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 5 }} />
            <Legend />
            <Bar dataKey={playerA} fill={colorA} radius={[6, 6, 0, 0]} />
            <Bar dataKey={playerB} fill={colorB} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function PlayerComparisonTab({ geminiConfigured }) {
  const [playerA, setPlayerA] = useState("");
  const [playerB, setPlayerB] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notebook, setNotebook] = useState(() => {
    try { return loadNotebook(window.localStorage); } catch { return []; }
  });
  const [notebookNotice, setNotebookNotice] = useState("");
  const [snapshotDate, setSnapshotDate] = useState(null);

  function updateNotebook(next, message) {
    try {
      window.localStorage.setItem(NOTEBOOK_KEY, JSON.stringify(next));
      setNotebook(next);
      setNotebookNotice(message);
    } catch {
      setNotebookNotice("The notebook could not be updated. Browser storage is unavailable or full.");
    }
  }

  function restoreMatchup(entry) {
    setPlayerA(entry.result.player_a.player);
    setPlayerB(entry.result.player_b.player);
    setResult(entry.result);
    setSnapshotDate(entry.savedAt);
    setError(null);
    setNotebookNotice("Saved matchup opened.");
  }

  async function handleCompare() {
    if (!playerA || !playerB) {
      setError("Pick two players first.");
      return;
    }
    if (playerA === playerB) {
      setError("Pick two different players.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await comparePlayers({ player_a: playerA, player_b: playerB });
      setResult(res);
      setSnapshotDate(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const runsChart = result ? buildChartData(result.player_a, result.player_b, "batting", "runs") : [];
  const avgChart = result ? buildChartData(result.player_a, result.player_b, "batting", "average") : [];
  const wicketsChart = result ? buildChartData(result.player_a, result.player_b, "bowling", "wickets") : [];

  return (
    <div className="card">
      <h3 className="section-title">
        <Users size={19} /> Player vs Player Comparison
      </h3>
      <p className="section-caption">
        Historical career leaderboards and sampled international deliveries, 2003-2024. Coverage varies by player and format.
      </p>
      {error && <div className="error-banner">{error}</div>}

      <section className="matchup-notebook" aria-label="Matchup notebook">
        <div className="notebook-heading">
          <h4><BookOpen size={17} /> Matchup notebook <small>{notebook.length}/{NOTEBOOK_LIMIT}</small></h4>
          <span className="muted">Saved on this device</span>
        </div>
        {notebook.length === 0 && <p className="muted">No saved matchups yet.</p>}
        <ul>
          {notebook.map((entry) => (
            <li key={entry.id}>
              <button className="notebook-open" onClick={() => restoreMatchup(entry)} disabled={loading}>
                <RotateCcw size={16} />
                <span>{entry.result.player_a.player} vs {entry.result.player_b.player}<small>{new Date(entry.savedAt).toLocaleString()}</small></span>
              </button>
              <button className="icon-btn" aria-label={`Remove ${entry.result.player_a.player} vs ${entry.result.player_b.player}`} title="Remove saved matchup" disabled={loading}
                onClick={() => updateNotebook(notebook.filter((saved) => saved.id !== entry.id), "Matchup removed.")}><Trash2 size={16} /></button>
            </li>
          ))}
        </ul>
        {notebookNotice && <p role="status" className="notebook-notice">{notebookNotice}</p>}
      </section>

      <div className="field-row">
        <PlayerSearchSelect label="Player A" value={playerA} onChange={setPlayerA} excludePlayer={playerB} />
        <PlayerSearchSelect label="Player B" value={playerB} onChange={setPlayerB} excludePlayer={playerA} />
      </div>

      <div className="vs-widget">
        <div className="team-badge">
          <PlayerAvatar key={playerA} name={playerA} imageUrl={result?.player_a?.player === playerA ? result.player_a.image_url : null} />
          <span>{playerA || "Player A"}</span>
        </div>
        <div className="vs-circle">
          <Swords size={18} />
        </div>
        <div className="team-badge">
          <PlayerAvatar key={playerB} name={playerB} imageUrl={result?.player_b?.player === playerB ? result.player_b.image_url : null} />
          <span>{playerB || "Player B"}</span>
        </div>
      </div>

      <button className="btn" onClick={handleCompare} disabled={loading || !playerA || !playerB}>
        {loading ? <Loader2 size={16} className="spin" /> : <Swords size={16} />}
        {loading ? "Comparing…" : "Compare players"}
      </button>

      {!result && !loading && (
        <div className="empty-state">
          <Search size={34} />
          <h4>Pick two players to compare</h4>
        </div>
      )}

      {result && (
        <>
          <div className="comparison-result-actions">
            <h4>{snapshotDate ? `Saved snapshot: ${new Date(snapshotDate).toLocaleString()}` : "Comparison results"}</h4>
            <button className="icon-btn" title="Save comparison to notebook" aria-label="Save comparison to notebook" disabled={loading}
              onClick={() => updateNotebook(saveMatchup(notebook, result), "Matchup saved on this device.")}><BookmarkPlus size={18} /></button>
          </div>
          {result.notice && <div className="hint-banner" role="status">{result.notice}</div>}
          {result.ai_summary ? (
            <div className="ai-summary-box">
              <div className="ai-summary-head">
                <Sparkles size={16} /> AI Insight
              </div>
              <p>{result.ai_summary}</p>
            </div>
          ) : (
            !geminiConfigured && (
              <div className="ai-summary-box muted">
                <div className="ai-summary-head">
                  <Sparkles size={16} /> AI Insight
                </div>
                <p>AI summary unavailable. Historical statistics are shown below.</p>
              </div>
            )
          )}

          <ComparisonChart
            title="Runs by Format"
            caption="Total career runs scored in each format — shows overall batting output/volume."
            data={runsChart}
            playerA={result.player_a.player}
            playerB={result.player_b.player}
            colorA="var(--accent)"
            colorB="var(--accent-3)"
          />
          <ComparisonChart
            title="Batting Average by Format"
            caption="Runs scored per dismissal — measures batting consistency rather than total runs."
            data={avgChart}
            playerA={result.player_a.player}
            playerB={result.player_b.player}
            colorA="var(--accent)"
            colorB="var(--accent-3)"
          />
          <ComparisonChart
            title="Wickets by Format"
            caption="Total career wickets taken in each format — shows overall bowling output/impact."
            data={wicketsChart}
            playerA={result.player_a.player}
            playerB={result.player_b.player}
            colorA="var(--accent)"
            colorB="var(--accent-3)"
          />

          <div className="team-grid">
            <div className="card team-card">
              <div className="team-card-head">
                <PlayerAvatar name={result.player_a.player} imageUrl={result.player_a.image_url} size={40} />
                <h4>{result.player_a.player}</h4>
              </div>
              <StatBlock title="Batting" statsByFormat={result.player_a.batting} fields={BATTING_FIELDS} />
              <StatBlock title="Bowling" statsByFormat={result.player_a.bowling} fields={BOWLING_FIELDS} />
            </div>
            <div className="card team-card">
              <div className="team-card-head">
                <PlayerAvatar name={result.player_b.player} imageUrl={result.player_b.image_url} size={40} />
                <h4>{result.player_b.player}</h4>
              </div>
              <StatBlock title="Batting" statsByFormat={result.player_b.batting} fields={BATTING_FIELDS} />
              <StatBlock title="Bowling" statsByFormat={result.player_b.bowling} fields={BOWLING_FIELDS} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
