import { useEffect, useState } from "react";
import { Award, BarChart3, Home, PieChart as PieChartIcon, Target, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getDashboardLeaderboards, getDashboardRunsByYear, getDashboardTeamPerformance, getDashboardTeams } from "../api.js";
import TeamSelect from "./TeamSelect.jsx";

const FORMATS = ["ODI", "Test", "T20I"];
const PIE_COLORS = ["var(--accent)", "var(--accent-2)", "var(--accent-3)"];
const TOOLTIP_STYLE = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text)", fontSize: 11 };

/** Strips the trailing "(COUNTRY)" tag so chart axis labels stay compact. */
function shortName(name) {
  return (name || "").replace(/\s*\([^)]*\)\s*$/, "");
}

function ChartCard({ icon: Icon, title, caption, color, children, empty = false }) {
  return (
    <section className="analytics-chart">
      <h3 className="section-title">
        <Icon size={19} style={color ? { color } : undefined} /> {title}
      </h3>
      {caption && <p className="section-caption">{caption}</p>}
      {empty ? <div className="analytics-empty" role="status">No qualifying records for this selection.</div> : <div className="chart-widget">
        <ResponsiveContainer width="100%" height={260}>
          {children}
        </ResponsiveContainer>
      </div>}
    </section>
  );
}

function LeaderBars({ data, metric, color, percentage = false }) {
  return <BarChart data={data} layout="vertical" margin={{ top: 0, right: 18, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 5" stroke="var(--border)" horizontal={false} /><XAxis type="number" stroke="var(--muted)" fontSize={10} unit={percentage ? "%" : undefined} /><YAxis type="category" dataKey="label" width={100} stroke="var(--muted)" fontSize={10} tickLine={false} axisLine={false} /><Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--panel-2)" }} /><Bar dataKey={metric} fill={color} radius={[0, 3, 3, 0]} maxBarSize={15} /></BarChart>;
}

export default function DashboardTab() {
  const [format, setFormat] = useState("ODI");
  const [team, setTeam] = useState("");
  const [teams, setTeams] = useState([]);
  const [leaderboards, setLeaderboards] = useState(null);
  const [runsByYear, setRunsByYear] = useState(null);
  const [teamPerformance, setTeamPerformance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getDashboardLeaderboards(format, 10, team), getDashboardRunsByYear(format, team), getDashboardTeamPerformance(team)])
      .then(([lb, ry, performance]) => {
        if (cancelled) return;
        setLeaderboards(lb);
        setRunsByYear(ry);
        setTeamPerformance(performance);
      })
      .catch((err) => {
        if (cancelled) return;
        setLeaderboards(null);
        setRunsByYear(null);
        setTeamPerformance(null);
        setError(err.message);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [format, team]);

  useEffect(() => {
    let cancelled = false;
    getDashboardTeams()
      .then((res) => !cancelled && setTeams(res.teams))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const runScorersData = (leaderboards?.top_run_scorers || []).map((r) => ({ ...r, label: shortName(r.player) }));
  const wicketTakersData = (leaderboards?.top_wicket_takers || []).map((r) => ({ ...r, label: shortName(r.player) }));
  const economyData = (leaderboards?.economy_leaders || []).map((r) => ({ ...r, label: shortName(r.player) }));
  const runsByYearData = runsByYear?.runs_by_year || [];

  const winPctData = (teamPerformance?.win_pct_by_format?.[format] || []).map((r) => ({
    ...r,
    label: r.team,
    win_rate_pct: Math.round(r.win_rate * 1000) / 10,
  }));

  const homeAwayData = FORMATS.map((f) => ({
    format: f,
    Home: teamPerformance?.home_vs_away_by_format?.[f]?.home_win_rate == null ? null : Math.round(teamPerformance.home_vs_away_by_format[f].home_win_rate * 1000) / 10,
    Away: teamPerformance?.home_vs_away_by_format?.[f]?.away_win_rate == null ? null : Math.round(teamPerformance.home_vs_away_by_format[f].away_win_rate * 1000) / 10,
  }));

  const seriesDistribution = teamPerformance?.decisive_series_distribution || [];
  const scope = team || "All teams";

  return (
    <div className="analytics-page">
      <div className="analytics-controls">
        <h3 className="section-title">
          <BarChart3 size={19} /> {scope} / Analytics
        </h3>
        <p className="section-caption">
          Historical leaderboards and sampled international deliveries, 2003-2024. These are not live career totals.
        </p>
        {error && <div className="error-banner">{error}</div>}
        <div className="field-row analytics-filters">
        <TeamSelect id="dashboard-team" label="Team" teams={["All teams", ...teams]} value={scope} onChange={(value) => setTeam(value === "All teams" ? "" : value)} />
        <div>
        <label htmlFor="dashboard-format">Format</label>
        <select id="dashboard-format" value={format} onChange={(e) => setFormat(e.target.value)}>
          {FORMATS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        </div>
        </div>
      </div>

      {loading && (
        <div className="card dashboard-skeleton">
          <div className="skeleton-line" style={{ width: "40%" }} />
          <div className="skeleton-line" style={{ width: "90%" }} />
          <div className="skeleton-block" />
        </div>
      )}

      {!loading && !error && <div className="analytics-grid" aria-label={`${scope} analytics`}>
        <ChartCard icon={TrendingUp} color="var(--accent)" title={`Runs by Year / ${format}`} caption={`${scope}: runs off the bat in sampled international deliveries. Extras excluded.`} empty={!runsByYearData.length}>
          <LineChart data={runsByYearData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 5" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="year" stroke="var(--muted)" fontSize={10} />
            <YAxis stroke="var(--muted)" fontSize={10} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Line type="monotone" dataKey="runs" stroke="var(--accent)" strokeWidth={2} dot={{ r: 2 }} animationDuration={400} />
          </LineChart>
        </ChartCard>
        <ChartCard icon={Award} color="var(--accent-2)" title={`Top Run Scorers / ${format}`} empty={!runScorersData.length} caption={team ? `${team}-associated players ranked by career runs across represented teams.` : "Players ranked by total career runs in this format; longer bars mean more runs."}><LeaderBars data={runScorersData} metric="runs" color="var(--accent-2)" /></ChartCard>
        <ChartCard icon={Target} color="var(--accent-3)" title={`Top Wicket Takers / ${format}`} caption="Players ranked by career wickets in this format; longer bars mean more dismissals credited to the bowler." empty={!wicketTakersData.length}><LeaderBars data={wicketTakersData} metric="wickets" color="var(--accent-3)" /></ChartCard>
        <ChartCard icon={BarChart3} color="var(--accent)" title={`Bowling Economy / ${format}`} caption="Runs conceded per over. Lower is better; minimum 1,000 balls bowled." empty={!economyData.length}><LeaderBars data={economyData} metric="economy" color="var(--accent)" /></ChartCard>
        <ChartCard icon={BarChart3} color="var(--accent-2)" title={`Series Win Rate / ${format}`} caption={`${scope}: percentage of series won, with at least five series in this format.`} empty={!winPctData.length}><LeaderBars data={winPctData} metric="win_rate_pct" color="var(--accent-2)" percentage /></ChartCard>
        <ChartCard icon={Home} color="var(--accent)" title="Home vs Away" caption={team ? `${team}: series win rates by format. Minimum five home or away series; missing rates are omitted.` : "Average series win rate across qualifying teams, by format."} empty={!homeAwayData.some((row) => row.Home != null || row.Away != null)}>
          <BarChart data={homeAwayData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 5" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="format" stroke="var(--muted)" fontSize={10} />
            <YAxis stroke="var(--muted)" fontSize={10} unit="%" />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => `${value}%`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Home" fill="var(--accent)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Away" fill="var(--accent-3)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard icon={PieChartIcon} color="var(--accent-2)" title="Decisive Series" caption={`${scope}: each slice shows a format's share of recorded decisive series, not its win rate.`} empty={!seriesDistribution.some((row) => row.count > 0)}>
          <PieChart>
            <Pie data={seriesDistribution} dataKey="count" nameKey="format" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>
              {seriesDistribution.map((entry, index) => <Cell key={entry.format} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ChartCard>
      </div>}
    </div>
  );
}
