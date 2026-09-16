import { ArrowRight, ArrowUpRight, BarChart3, FlaskConical, Hand, LayoutDashboard, MessageCircle, Radio } from "lucide-react";
import { FeedStatus, MatchCard } from "./LiveTab.jsx";
import { matchState, orderMatches } from "../lib/liveMatches.js";
import Wordmark from "./Wordmark.jsx";

const WORKSPACE = [
  { id: "dashboard", icon: LayoutDashboard, label: "Analytics", meta: "The numbers" },
  { id: "predict", icon: BarChart3, label: "Series Predictor", meta: "The next contest" },
  { id: "chat", icon: MessageCircle, label: "Cricket Assistant", meta: "Ask a question" },
];

export default function LandingPage({ status, onNavigate, live }) {
  const matches = orderMatches(live.feed?.matches || []);
  return (
    <div className="overview-page">
      <section className="matchday-banner">
        <img className="matchday-photo" src="/cricket-ground.jpg" alt="Cricket ground with players on the field and spectators in the stands" />
        <div className="matchday-copy">
          <span className="eyebrow">THE MATCHDAY EDITION</span>
          <h2><Wordmark /><span className="brand-tagline">Beyond the boundary.</span></h2>
          <div className="matchday-actions">
            <button className="btn" onClick={() => onNavigate("live")}><Radio size={15} />Match centre<ArrowUpRight size={16} /></button>
            <button className="banner-link" onClick={() => onNavigate("predict")}>Series predictor<ArrowRight size={15} /></button>
          </div>
        </div>
        <span className="banner-index">01 / THE GAME</span>
      </section>
      <div className="overview-metrics">
        {[["Live now", "live"], ["On the schedule", "upcoming"], ["Final scores", "finished"]].map(([label, value]) => (
          <div key={value}><span>{label}</span><strong>{live.feed ? matches.filter((match) => matchState(match) === value).length.toString().padStart(2, "0") : "--"}</strong></div>
        ))}
        <div><span>International formats</span><strong>03<small>ODI / Test / T20I</small></strong></div>
      </div>
      <section className="overview-section">
        <div className="section-toolbar">
          <div className="section-heading"><span className="eyebrow">AROUND THE GROUNDS</span><h2>On the scoreboard</h2></div>
          <button className="text-button" onClick={() => onNavigate("live")}>All matches<ArrowUpRight size={16} /></button>
        </div>
        <FeedStatus live={live} configured={!!status?.cricapi_configured} />
        {live.error && <div className="error-banner" role="alert">{live.error.message}</div>}
        {matches.length ? <div className="fixtures-grid overview-fixtures">{matches.slice(0, 3).map((match, index) => <MatchCard key={match.id || index} match={match} compact />)}</div> : live.loading ? <div className="fixtures-grid overview-fixtures">{[0, 1, 2].map((value) => <div className="skeleton-block" key={value} />)}</div> : <div className="overview-empty"><Radio size={24} /><div><strong>{live.feed ? "No current matches" : "The live feed is unavailable"}</strong><span>{live.feed ? "No fixtures returned by CricAPI." : "Games and historical analytics are still available."}</span></div><button className="text-button" onClick={() => onNavigate("live")}>Match centre<ArrowRight size={16} /></button></div>}
      </section>
      <section className="overview-section">
        <div className="section-toolbar"><div className="section-heading"><span className="eyebrow">THE PAVILION</span><h2>A different kind of innings</h2></div><span className="quiet-label">2 GAMES / NO API REQUIRED</span></div>
        <div className="pavilion-grid">
          <button className="pavilion-item hand" onClick={() => onNavigate("handcricket")}><div><span className="eyebrow">01 / YOU VS COMPUTER</span><h3>Hand Cricket</h3><span className="pavilion-action">Play a match<ArrowUpRight size={18} /></span></div><Hand size={80} strokeWidth={1.2} /></button>
          <button className="pavilion-item whatif" onClick={() => onNavigate("whatif")}><div><span className="eyebrow">02 / ALTERNATE OUTCOMES</span><h3>What If Lab</h3><span className="pavilion-action">Set the scenario<ArrowUpRight size={18} /></span></div><FlaskConical size={76} strokeWidth={1.2} /></button>
        </div>
      </section>
      <section className="overview-section">
        <div className="section-heading"><span className="eyebrow">A CLOSER LOOK</span><h2>The analyst's desk</h2></div>
        <div className="workspace-shortcuts">{WORKSPACE.map(({ id, icon: Icon, label, meta }) => <button key={id} onClick={() => onNavigate(id)}><Icon size={20} /><span><small>{meta}</small><strong>{label}</strong></span><ArrowUpRight size={16} /></button>)}</div>
      </section>
      <footer className="overview-footer"><Wordmark /><span>Live scores. Historical records. New possibilities.</span></footer>
    </div>
  );
}
