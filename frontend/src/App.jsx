import { lazy, Suspense, useEffect, useState } from "react";
import { BarChart3, MessageCircle } from "lucide-react";
import Navbar from "./components/Navbar.jsx";
import LandingPage from "./components/LandingPage.jsx";
import LiveTab from "./components/LiveTab.jsx";
import { getStatus } from "./api.js";
import useLiveMatches from "./hooks/useLiveMatches.js";
import { scenarioFromMatch } from "./lib/cricketGames.js";
import { inviteCode } from "./lib/handMultiplayer.js";

const PredictorTab = lazy(() => import("./components/PredictorTab.jsx"));
const PlayerComparisonTab = lazy(() => import("./components/PlayerComparisonTab.jsx"));
const HandCricketTab = lazy(() => import("./components/HandCricketTab.jsx"));
const WhatIfTab = lazy(() => import("./components/WhatIfTab.jsx"));

const PAGES = {
  home: { title: "Match Centre", category: "Your cricket workspace" },
  chat: { title: "Cricket Assistant", category: "Intelligence" },
  predict: { title: "Series Predictor", category: "Intelligence" },
  live: { title: "Live Matches", category: "Match Centre" },
  compare: { title: "Player Comparison", category: "Intelligence" },
  dashboard: { title: "Analytics", category: "Intelligence" },
  handcricket: { title: "Hand Cricket", category: "The Pavilion" },
  whatif: { title: "What If Lab", category: "The Pavilion" },
};

function ComingSoon({ icon: Icon, title, description }) {
  return (
    <section className="coming-soon" aria-labelledby="coming-soon-title">
      <div className="coming-soon-icon"><Icon size={25} strokeWidth={1.6} /></div>
      <span className="eyebrow">In the nets</span>
      <h2 id="coming-soon-title">{title} is coming soon</h2>
      <p>{description}</p>
    </section>
  );
}

export default function App() {
  const [tab, updateTab] = useState(() => inviteCode(window.location.search) ? "handcricket" : "home");
  const [openedGames, setOpenedGames] = useState(() => inviteCode(window.location.search) ? ["handcricket"] : []);
  const [status, setStatus] = useState(null);
  const [importedScenario, setImportedScenario] = useState(null);
  const live = useLiveMatches(!!status?.cricapi_configured, tab === "home" || tab === "live");

  function setTab(next) {
    if (!PAGES[next]) return;
    updateTab(next);
    if (next === "handcricket" || next === "whatif") {
      setOpenedGames((previous) => previous.includes(next) ? previous : [...previous, next]);
    }
    window.scrollTo({ top: 0, left: 0 });
  }

  useEffect(() => { document.title = `${PAGES[tab].title} | Ballsense`; }, [tab]);

  useEffect(() => {
    getStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Navbar tab={tab} setTab={setTab} />
      <div className="workspace-main">
        <header className="workspace-header">
          <div>
            <span className="workspace-eyebrow">{PAGES[tab].category}</span>
            <h1>{PAGES[tab].title}</h1>
          </div>
          <div className="workspace-date">
            <span className={`connection-dot ${status ? "connected" : ""}`} />
            {new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date())}
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          <Suspense fallback={<div className="content"><div className="skeleton-block" role="status" aria-label="Loading section" /></div>}>
          {tab === "home" ? (
            <LandingPage status={status} onNavigate={setTab} live={live} />
          ) : tab !== "handcricket" && tab !== "whatif" ? (
            <div className="content" key={tab}>
              {tab === "chat" && <ComingSoon icon={MessageCircle} title="Cricket Assistant" description="The analyst's desk is being prepared for its next innings." />}
              {tab === "predict" && <PredictorTab />}
              {tab === "live" && <LiveTab cricapiConfigured={!!status?.cricapi_configured} live={live} onSimulate={(match) => { setImportedScenario(scenarioFromMatch(match)); setTab("whatif"); }} />}
              {tab === "compare" && <PlayerComparisonTab geminiConfigured={!!status?.gemini_configured} />}
              {tab === "dashboard" && <ComingSoon icon={BarChart3} title="Analytics" description="Historical insights and performance views are being prepared." />}
            </div>
          ) : null}
          <div key="handcricket" className="content" hidden={tab !== "handcricket"}>{openedGames.includes("handcricket") && <HandCricketTab active={tab === "handcricket"} />}</div>
          <div key="whatif" className="content" hidden={tab !== "whatif"}>{openedGames.includes("whatif") && <WhatIfTab importedScenario={importedScenario} active={tab === "whatif"} />}</div>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
