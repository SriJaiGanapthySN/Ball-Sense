import { MessageCircle, BarChart3, Radio, LayoutDashboard, Home, ArrowUpRight, Hand, FlaskConical } from "lucide-react";
import Wordmark from "./Wordmark.jsx";

export default function Navbar({ tab, setTab }) {
  const tabs = [
    { id: "home", label: "Overview", icon: Home, group: "Match centre" },
    { id: "live", label: "Live Matches", icon: Radio, group: "Match centre" },
    { id: "dashboard", label: "Analytics", icon: LayoutDashboard, group: "Intelligence" },
    { id: "predict", label: "Series Predictor", icon: BarChart3, group: "Intelligence" },
    { id: "chat", label: "Cricket Assistant", icon: MessageCircle, group: "Intelligence" },
    { id: "handcricket", label: "Hand Cricket", icon: Hand, group: "The pavilion" },
    { id: "whatif", label: "What If Lab", icon: FlaskConical, group: "The pavilion" },
  ];

  return (
    <nav className="sidebar" aria-label="Main navigation">
      <button className="sidebar-brand" onClick={() => setTab("home")} aria-label="Ballsense overview">
        <span><Wordmark /><small>THE CRICKET WORKSPACE</small></span>
      </button>
      <div className="sidebar-links">
        {["Match centre", "Intelligence", "The pavilion"].map((group) => (
          <div className="nav-group" key={group}>
            <span className="nav-group-label">{group}</span>
            {tabs.filter((item) => item.group === group).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={`nav-link ${tab === item.id ? "active" : ""}`}
                  onClick={() => setTab(item.id)}
                  aria-current={tab === item.id ? "page" : undefined}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                  {item.id === "live" && <span className="nav-live-dot" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="sidebar-footer">
        <span className="sidebar-season">THE GAME. EVERY ANGLE.</span>
        <span>ODI <span>/</span> Test <span>/</span> T20I <ArrowUpRight size={15} /></span>
      </div>
    </nav>
  );
}
