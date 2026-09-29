import { useEffect, useId, useRef, useState } from "react";
import { useMachine } from "@xstate/react";
import { ArrowRight, Book, BookOpen, Camera, Check, Monitor, Pause, Play, RefreshCw, RotateCcw, Trophy, Users } from "lucide-react";
import { BOOKS, BOOK_OVERS, BOOK_WICKETS, bookCricketMachine, sampleBookPage } from "../lib/bookCricket.js";
import { formatOvers } from "../lib/cricketGames.js";
import BookCricketScene, { BookCover } from "./BookCricketScene.jsx";
import "./BookCricket.css";

function BookScorebook({ context }) {
  const [innings, setInnings] = useState(context.innings);
  const panelId = useId();
  useEffect(() => { setInnings(context.innings); }, [context.innings]);
  const deliveries = context.history.filter((delivery) => delivery.innings === innings);
  const side = innings === 1 ? context.battingFirst : context.battingFirst === "you" ? "opponent" : "you";
  const score = context.scores[side];
  let totalRuns = 0;
  let totalWickets = 0;
  return <section className="book-scorebook" aria-label="Book cricket scorebook">
    <header><h2>Scorebook</h2><div className="segmented-control" role="tablist" aria-label="Scorebook innings">{[1, 2].map((number) => <button key={number} role="tab" id={`${panelId}-tab-${number}`} aria-selected={innings === number} aria-controls={panelId} tabIndex={innings === number ? 0 : -1} disabled={number > context.innings} className={innings === number ? "selected" : ""} onClick={() => setInnings(number)} onKeyDown={(event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 1 : event.key === "End" ? context.innings : innings === 1 && context.innings === 2 ? 2 : 1;
      setInnings(next);
      document.getElementById(`${panelId}-tab-${next}`)?.focus();
    }}>{number === 1 ? "1st innings" : "2nd innings"}</button>)}</div></header>
    <div role="tabpanel" id={panelId} aria-labelledby={`${panelId}-tab-${innings}`}>
      <div className="book-ledger-summary"><strong>{context.names[side]}</strong><span>{score.runs}/{score.wickets} <small>({formatOvers(score.balls)} ov)</small></span><span>{deliveries.filter((ball) => ball.runs === 4).length} fours</span><span>{deliveries.filter((ball) => ball.runs === 6).length} sixes</span></div>
      {deliveries.length ? <div className="book-ledger-scroll"><table><thead><tr><th scope="col">Ball</th><th scope="col">Page</th><th scope="col">Digit</th><th scope="col">Runs</th><th scope="col">Score</th></tr></thead><tbody>{deliveries.map((delivery) => {
        totalRuns += delivery.runs;
        totalWickets += Number(delivery.wicket);
        return <tr key={delivery.ball} className={delivery.wicket ? "book-wicket-row" : ""}><td>{formatOvers(delivery.ball)}</td><td>{delivery.page}</td><td>{delivery.digit}</td><td><span className={`book-run-mark ${delivery.wicket ? "wicket" : delivery.runs >= 4 ? "boundary" : ""}`}>{delivery.wicket ? "W" : delivery.runs}</span></td><td>{totalRuns}/{totalWickets}</td></tr>;
      })}</tbody></table></div> : <p className="book-empty-innings">No pages opened yet.</p>}
    </div>
  </section>;
}

export default function BookCricketTab({ active = true }) {
  const [snapshot, send] = useMachine(bookCricketMachine);
  const [bookId, setBookId] = useState(BOOKS[0].id);
  const [mode, setMode] = useState("solo");
  const [overs, setOvers] = useState(2);
  const [wicketLimit, setWicketLimit] = useState(3);
  const [battingFirst, setBattingFirst] = useState("you");
  const [youName, setYouName] = useState("Player 1");
  const [opponentName, setOpponentName] = useState("Player 2");
  const [paused, setPaused] = useState(false);
  const [cover, setCover] = useState(true);
  const [overhead, setOverhead] = useState(false);
  const [cameraVersion, setCameraVersion] = useState(0);
  const [motion, setMotion] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [visible, setVisible] = useState(() => !document.hidden);
  const matchRef = useRef(null);
  const { context, value: phase } = snapshot;
  const setup = phase === "setup";
  const flipping = phase === "flipping";
  const finished = phase === "finished";
  const book = BOOKS.find((item) => item.id === (setup ? bookId : context.bookId));
  const animate = motion && !reducedMotion;
  const running = active && visible && !paused;
  const computerTurn = !setup && context.mode === "solo" && context.batting === "opponent";
  const score = context.scores[context.batting];
  const lastBall = context.lastBall;
  const ballsLeft = Math.max(0, context.overs * 6 - score.balls);
  const runsNeeded = context.target == null ? null : Math.max(0, context.target - score.runs);
  const nextBatter = context.battingFirst === "you" ? "opponent" : "you";
  const names = setup ? mode === "solo" ? { you: "You", opponent: "Computer" } : { you: youName.trim() || "Player 1", opponent: opponentName.trim() || "Player 2" } : context.names;
  const resultTitle = !context.result ? "" : context.result.winner === "tie" ? "Match tied" : `${names[context.result.winner]} ${context.mode === "solo" && context.result.winner === "you" ? "win" : "wins"}`;

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(preference.matches);
    const updateVisibility = () => setVisible(!document.hidden);
    preference.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      preference.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (!running || phase !== "playing" || !computerTurn) return;
    const timer = window.setTimeout(() => {
      if (document.hidden) return;
      setCover(false);
      send({ type: "OPEN", page: sampleBookPage(book.pages) });
    }, 850);
    return () => window.clearTimeout(timer);
  }, [running, phase, computerTurn, context.flipId, book, send]);

  function openPage() {
    if (!running || phase !== "playing" || computerTurn) return;
    setCover(false);
    send({ type: "OPEN", page: sampleBookPage(book.pages) });
  }

  useEffect(() => {
    function handleKey(event) {
      if (event.code !== "Space" || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.target.isContentEditable || event.target.closest("input, textarea, select, button, a")) return;
      if (!running || phase !== "playing" || computerTurn) return;
      event.preventDefault();
      openPage();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [running, phase, computerTurn, book]);

  function startMatch() {
    if (finished) send({ type: "RESET" });
    send({ type: "START", bookId, mode, overs, wicketLimit, battingFirst, youName, opponentName });
    setPaused(false);
    setCover(false);
    matchRef.current?.scrollIntoView({ block: "start", behavior: animate ? "smooth" : "auto" });
  }

  function resetMatch() {
    if (!setup && !finished && !window.confirm("End this match? The current score will be cleared.")) return;
    send({ type: "RESET" });
    setPaused(false);
    setCover(true);
    setCameraVersion((version) => version + 1);
  }

  let statusTitle = setup ? "Match ready" : paused ? "Match paused" : flipping ? "Turning the pages" : `${names[context.batting]} batting`;
  let statusDetail = setup ? `${overs} over${overs === 1 ? "" : "s"} / ${wicketLimit} wicket${wicketLimit === 1 ? "" : "s"}` : runsNeeded == null ? `${ballsLeft} balls remaining` : `${runsNeeded} needed from ${ballsLeft} balls`;
  if (phase === "inningsBreak") { statusTitle = "Innings complete"; statusDetail = `${names[nextBatter]} need ${context.target} to win`; }
  if (finished) { statusTitle = resultTitle; statusDetail = context.result.winner === "tie" ? "Scores level" : `By ${context.result.margin}`; }

  return <section ref={matchRef} className="book-game" data-phase={phase} data-batting={context.batting} data-book={book.id}>
    <div className="book-topbar">
      <div className="segmented-control" role="group" aria-label="Book cricket mode"><button disabled={!setup} className={mode === "solo" ? "selected" : ""} aria-pressed={mode === "solo"} onClick={() => setMode("solo")}><Monitor size={16} />Solo</button><button disabled={!setup} className={mode === "local" ? "selected" : ""} aria-pressed={mode === "local"} onClick={() => setMode("local")}><Users size={16} />Local 1v1</button></div>
      <div className="book-top-actions">{!setup && !finished && phase !== "inningsBreak" && <button className="square-button" title={paused ? "Resume match" : "Pause match"} aria-label={paused ? "Resume match" : "Pause match"} aria-pressed={paused} onClick={() => setPaused((value) => !value)}>{paused ? <Play size={17} /> : <Pause size={17} />}</button>}<button className="square-button" title="New match" aria-label="New match" onClick={resetMatch}><RefreshCw size={17} /></button></div>
    </div>
    <div className="book-layout">
      <div className="book-main">
        <div className="book-scoreboard" aria-label="Match score">
          {["you", "opponent"].map((side, index) => <div key={side} className={`book-team-score ${!setup && side === context.batting ? "batting" : ""}`} style={{ gridColumn: index ? 3 : 1 }}><span>{names[side]}{!setup && side === context.batting && !finished && <BookOpen size={12} aria-label="Batting" />}</span><strong>{context.scores[side].runs}<small>/{context.scores[side].wickets}</small></strong><em>{formatOvers(context.scores[side].balls)} <span>/ {setup ? overs : context.overs} ov</span></em></div>)}
          <div className="book-innings-marker"><span>{finished ? "FULL TIME" : setup ? "BOOK CRICKET" : `${context.innings === 1 ? "1ST" : "2ND"} INNINGS`}</span>{context.target != null ? <><strong>{context.target}</strong><small>TARGET</small></> : <><BookOpen size={24} strokeWidth={1.4} /><small>{setup ? wicketLimit : context.wicketLimit} WICKETS</small></>}</div>
        </div>
        <div className="book-stage-toolbar"><div><strong>{book.title}</strong><span>{book.pages} pages</span></div><div className="book-view-tools"><div className="segmented-control" role="group" aria-label="Book view"><button disabled={flipping} className={cover ? "selected" : ""} aria-label="Cover view" title="Cover view" aria-pressed={cover} onClick={() => setCover(true)}><Book size={17} /></button><button disabled={flipping} className={!cover ? "selected" : ""} aria-label="Pages view" title="Pages view" aria-pressed={!cover} onClick={() => setCover(false)}><BookOpen size={17} /></button></div><button className="square-button" title="Overhead camera" aria-label="Overhead camera" aria-pressed={overhead} onClick={() => setOverhead((value) => !value)}><Camera size={17} /></button><button className="square-button" title="Reset book view" aria-label="Reset book view" onClick={() => { setOverhead(false); setCameraVersion((version) => version + 1); }}><RotateCcw size={17} /></button></div></div>
        <div className="book-stage"><BookCricketScene book={book} page={lastBall?.page ?? null} pendingPage={context.pendingPage} flipId={context.flipId} flipping={flipping} cover={cover} active={active && visible} paused={paused} motion={animate} overhead={overhead} cameraVersion={cameraVersion} onReveal={(id) => send({ type: "REVEAL", flipId: id })} /></div>
        <div className={`book-reveal ${lastBall?.wicket && !flipping ? "is-wicket" : ""}`} aria-label="Last page result"><div><span>PAGE</span><strong data-testid="book-page">{flipping ? "..." : lastBall?.page ?? "--"}</strong></div><ArrowRight size={17} /><div><span>LAST DIGIT</span><strong>{flipping ? "..." : lastBall?.digit ?? "--"}</strong></div><ArrowRight size={17} /><div key={flipping ? "turning" : context.history.length} className="book-outcome"><span>{lastBall?.wicket && !flipping ? "WICKET" : "RUNS"}</span><strong>{flipping ? "..." : lastBall ? lastBall.wicket ? "OUT" : `+${lastBall.runs}` : "--"}</strong></div></div>
        <div className={`book-actionbar ${finished ? "finished" : ""}`}><div>{finished && <Trophy size={22} />}<div><strong>{statusTitle}</strong><span>{statusDetail}</span></div></div>
          {setup ? <button className="btn book-primary" onClick={startMatch}><Play size={17} />Start match</button> : finished ? <button className="btn book-primary" onClick={startMatch}><RefreshCw size={17} />Play again</button> : phase === "inningsBreak" ? <button className="btn book-primary" onClick={() => { setPaused(false); setCover(false); send({ type: "NEXT_INNINGS" }); }}><ArrowRight size={17} />Start chase</button> : paused ? <button className="btn book-primary" onClick={() => setPaused(false)}><Play size={17} />Resume</button> : <button className="btn book-primary" disabled={!running || flipping || computerTurn} onClick={openPage}><BookOpen size={17} />{flipping ? "Opening..." : computerTurn ? "Computer's turn" : "Open a page"}</button>}
        </div>
        <p className="book-sr-only" role="status" aria-live="polite" aria-atomic="true">{finished ? `${resultTitle}. ${statusDetail}.` : lastBall && !flipping ? `Page ${lastBall.page}, last digit ${lastBall.digit}: ${lastBall.wicket ? "out" : `${lastBall.runs} runs`}. ${names[lastBall.batting]} ${context.scores[lastBall.batting].runs} for ${context.scores[lastBall.batting].wickets}. ${statusDetail}.` : statusTitle}</p>
      </div>
      <aside className="book-sidebar">
        <section className="book-collection"><div className="book-section-heading"><span className="eyebrow">THE COLLECTION</span><h2>{setup ? "Choose your edition" : "Your match book"}</h2></div><div className="book-choices">{BOOKS.map((edition) => <button key={edition.id} className={`book-choice ${book.id === edition.id ? "selected" : ""}`} disabled={!setup} aria-pressed={book.id === edition.id} onClick={() => { setBookId(edition.id); setCover(true); }}><BookCover book={edition} /><span><strong>{edition.title}</strong><small>{edition.edition}</small><em>{edition.pages} pages</em></span><span className="book-selection-dot">{book.id === edition.id && <Check size={12} />}</span></button>)}</div></section>
        <section className="book-match-settings"><fieldset disabled={!setup}><legend>Match format</legend><div className="book-settings-row"><label>Overs<select value={overs} onChange={(event) => setOvers(Number(event.target.value))}>{BOOK_OVERS.map((value) => <option key={value} value={value}>{value} over{value === 1 ? "" : "s"}</option>)}</select></label><label>Wickets<select value={wicketLimit} onChange={(event) => setWicketLimit(Number(event.target.value))}>{BOOK_WICKETS.map((value) => <option key={value} value={value}>{value} wicket{value === 1 ? "" : "s"}</option>)}</select></label></div>{mode === "local" && <div className="book-player-inputs"><label>Player 1<input value={youName} maxLength={24} onChange={(event) => setYouName(event.target.value)} autoComplete="off" /></label><label>Player 2<input value={opponentName} maxLength={24} onChange={(event) => setOpponentName(event.target.value)} autoComplete="off" /></label></div>}<label>Bats first<select value={battingFirst} onChange={(event) => setBattingFirst(event.target.value)}><option value="you">{names.you}</option><option value="opponent">{names.opponent}</option></select></label></fieldset><label className="book-motion-toggle"><input type="checkbox" checked={animate} disabled={reducedMotion} onChange={(event) => setMotion(event.target.checked)} />Page animation</label>{setup && <button className="btn book-sidebar-start" onClick={startMatch}><Play size={16} />Start match</button>}</section>
      </aside>
    </div>
    {context.history.length > 0 && <BookScorebook context={context} />}
  </section>;
}