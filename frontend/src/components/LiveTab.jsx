import { useState } from "react";
import { Activity, ArrowUpRight, Calendar, Coins, FlaskConical, Loader2, MapPin, Radio, RefreshCw, Search, WifiOff } from "lucide-react";
import TeamBadge from "./TeamBadge.jsx";
import { formatMatchDate, matchState, orderMatches } from "../lib/liveMatches.js";
import { scenarioFromMatch } from "../lib/cricketGames.js";

const STATE_LABELS = { live: "Live", upcoming: "Upcoming", finished: "Result", unknown: "Status pending" };

export function FeedStatus({ live, configured }) {
  if (!configured) return <span className="feed-status"><WifiOff size={13} />Live feed offline</span>;
  if (live.loading && !live.feed) return <span className="feed-status"><Loader2 size={13} className="spin" />Connecting to CricAPI</span>;
  if (!live.feed) return <span className="feed-status">CricAPI / No feed available</span>;
  const fetchedAt = new Date(live.feed.fetched_at);
  return (
    <span className={`feed-status ${live.isStale || live.error ? "stale" : ""}`}>
      <span className="connection-dot connected" />
      {live.feed.source || "CricAPI"} / {live.isStale || live.error ? "Last received" : "Updated"}{" "}
      {!Number.isNaN(fetchedAt.getTime()) ? fetchedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "time unavailable"}
      {live.isStale && " / Stale"}
    </span>
  );
}

export function MatchCard({ match, compact = false, onSimulate }) {
  const state = matchState(match);
  return (
    <article className={`fixture-card ${compact ? "compact" : ""}`}>
      <div className="fixture-heading">
        <span className="fixture-format">{match.match_type?.toUpperCase() || "CRICKET"}</span>
        <span className={`live-badge ${state}`}>{state === "live" && <span className="pulse-dot" />}{STATE_LABELS[state]}</span>
      </div>
      <h3 className="fixture-name">{match.name}</h3>
      <div className="fixture-teams">
        {(match.teams || []).map((team, index) => (
          <div className="fixture-team" key={`${team}-${index}`}>
            <TeamBadge name={team} size={28} showLabel={false} />
            <strong>{team}</strong>
          </div>
        ))}
      </div>
      {match.score?.length > 0 && (
        <div className="fixture-scores">
          {match.score.map((entry, index) => (
            <div className="fixture-score" key={`${entry.inning}-${index}`}>
              <span>{entry.inning || `Innings ${index + 1}`}</span>
              <strong>{entry.r ?? "-"}<small>/{entry.w ?? "-"}</small><em>{entry.o != null ? `${entry.o} ov` : ""}</em></strong>
            </div>
          ))}
        </div>
      )}
      <p className={`fixture-result ${state === "finished" ? "result" : ""}`}><Activity size={13} />{match.status || "Match updates pending"}</p>
      <div className="fixture-details">
        <span><MapPin size={13} />{match.venue || "Venue to be confirmed"}</span>
        <span><Calendar size={13} />{formatMatchDate(match)}</span>
        {!compact && match.toss_winner && <span><Coins size={13} />{match.toss_winner}{match.toss_choice ? ` chose to ${match.toss_choice}` : " won the toss"}</span>}
      </div>
      {!compact && match.prediction && (
        <div className="fixture-prediction">
          <span>Historical series estimate</span>
          <strong>{match.prediction.team} {(match.prediction.prob * 100).toFixed(1)}%</strong>
          <small>Pre-match baseline, not an in-play forecast.</small>
        </div>
      )}
      {!compact && onSimulate && scenarioFromMatch(match) && <button className="text-button fixture-simulate" onClick={() => onSimulate(match)}><FlaskConical size={14} />What if?<ArrowUpRight size={14} /></button>}
    </article>
  );
}

export default function LiveTab({ cricapiConfigured, live, onSimulate }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState("all");
  const matches = orderMatches(live.feed?.matches || []);
  const formats = [...new Set(matches.map((match) => match.match_type).filter(Boolean))].sort();
  const visible = matches.filter((match) =>
    (filter === "all" || matchState(match) === filter) &&
    (format === "all" || match.match_type === format) &&
    `${match.name} ${match.venue} ${(match.teams || []).join(" ")}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="live-page">
      <div className="section-toolbar">
        <FeedStatus live={live} configured={cricapiConfigured} />
        <div className="toolbar-actions">
          <label className="switch-label"><input type="checkbox" checked={live.autoRefresh} onChange={(event) => live.setAutoRefresh(event.target.checked)} disabled={!cricapiConfigured} />Auto / 5 min</label>
          <button className="square-button" title="Refresh matches" aria-label="Refresh matches" onClick={live.refresh} disabled={!cricapiConfigured || live.loading}>{live.loading ? <Loader2 size={17} className="spin" /> : <RefreshCw size={17} />}</button>
        </div>
      </div>
      {!cricapiConfigured && <div className="hint-banner"><WifiOff size={17} />Live feed unavailable. The server needs a CricAPI connection.</div>}
      {live.error && <div className="error-banner" role="alert">{live.error.message}{live.feed ? " Last received scores are shown below." : ""}</div>}
      <div className="live-filters">
        <div className="segmented-control" aria-label="Match status">
          {[["all", "All matches"], ["live", "Live"], ["upcoming", "Upcoming"], ["finished", "Results"]].map(([value, label]) => (
            <button key={value} aria-pressed={filter === value} className={filter === value ? "selected" : ""} onClick={() => setFilter(value)}>{label}<span>{matches.filter((match) => value === "all" || matchState(match) === value).length}</span></button>
          ))}
        </div>
        <div className="live-search-row">
          <div className="search-field"><Search size={15} /><input aria-label="Search matches" placeholder="Search matches or venues" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          <select aria-label="Match format" value={format} onChange={(event) => setFormat(event.target.value)}><option value="all">All formats</option>{formats.map((value) => <option value={value} key={value}>{value.toUpperCase()}</option>)}</select>
        </div>
      </div>
      {live.loading && !live.feed ? (
        <div className="fixtures-grid" aria-label="Loading matches">{[0, 1, 2].map((value) => <div className="skeleton-block" key={value} />)}</div>
      ) : visible.length ? (
        <div className="fixtures-grid">{visible.map((match, index) => <MatchCard key={match.id || `${match.name}-${index}`} match={match} onSimulate={onSimulate} />)}</div>
      ) : (
        <div className="empty-state"><Radio size={32} /><h4>{live.feed ? "No matches in this view" : "Waiting for the match feed"}</h4>{(query || filter !== "all" || format !== "all") && <button className="text-button" onClick={() => { setQuery(""); setFilter("all"); setFormat("all"); }}>Clear filters</button>}</div>
      )}
      <p className="data-footnote">Source: CricAPI. Provider scores may be delayed. Refreshes share a five-minute cache.</p>
    </section>
  );
}
