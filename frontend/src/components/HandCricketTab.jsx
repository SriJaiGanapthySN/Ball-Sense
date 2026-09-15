import { useEffect, useRef, useState } from "react";
import { useMachine } from "@xstate/react";
import { ArrowRight, Camera, Check, Clapperboard, Coins, Crosshair, Hand, Info, Maximize, Minimize, Pause, Play, RotateCcw, Target, Trophy, Volume2, VolumeX, Zap } from "lucide-react";
import { formatOvers, handCricketMachine, handMatchInsights } from "../lib/cricketGames.js";
import CricketArena from "./CricketArena.jsx";
import HandScorecard from "./HandScorecard.jsx";
import { deliveryLabel } from "../lib/cricketPresentation.js";
import { DELIVERY_MS, opponentPlan, sampleOpponent, sampleLength, training } from "../lib/cricketOpponent.js";
import { DISMISSAL_LABELS, TOSS_MS, HANDSHAKE_MS, matchSummary, samplePresentation } from "../lib/cricketPresentation.js";

const RECORD_KEY = "cricket-ai-hand-record-v1";

function readRecord() {
  try {
    const record = JSON.parse(localStorage.getItem(RECORD_KEY));
    if (record && ["wins", "losses", "ties"].every((key) => Number.isSafeInteger(record[key]) && record[key] >= 0)) return record;
  } catch {}
  return { wins: 0, losses: 0, ties: 0 };
}

function HandSign({ value, className = "" }) {
  const fingers = value === 6 ? 0 : Math.min(value || 0, 4);
  return (
    <svg className={`hand-sign ${className}`} viewBox="0 0 110 120" aria-hidden="true">
      <path d="M32 55H84V83Q84 100 70 101H46Q32 98 32 83Z" fill="currentColor" stroke="currentColor" strokeWidth="3" />
      {[[33, 25], [46, 13], [59, 20], [72, 33]].map(([left, top], index) => <rect key={left} x={left} y={index < fingers ? top : 49} width="12" height={index < fingers ? 60 - top : 20} rx="6" fill="currentColor" stroke="var(--hand-outline, #234333)" strokeWidth="1.5" />)}
      <path d={value === 5 || value === 6 ? "M35 77L16 54Q11 44 19 42Q24 40 29 47L45 63" : "M34 74L23 65Q18 58 23 54Q28 51 35 57L46 66"} fill="currentColor" stroke="var(--hand-outline, #234333)" strokeWidth="1.5" />
      <path d="M43 99V115H73V99" fill="currentColor" />
      <path d="M44 77Q60 69 73 78" fill="none" stroke="var(--hand-outline, #234333)" strokeWidth="2" opacity=".4" />
    </svg>
  );
}

export default function HandCricketTab({ active = true }) {
  const [snapshot, send] = useMachine(handCricketMachine);
  const [overs, setOvers] = useState(2);
  const [wicketLimit, setWicketLimit] = useState(3);
  const [toss, setToss] = useState(null);
  const tossTimer = useRef(null);
  const tossLocked = useRef(false);
  const [revealing, setRevealing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [record, setRecord] = useState(readRecord);
  const [cameraView, setCameraView] = useState("director");
  const [opponentMode, setOpponentMode] = useState("adaptive");
  const [batterIndex, setBatterIndex] = useState(1);
  const [bowlerIndex, setBowlerIndex] = useState(0);
  const [recovering, setRecovering] = useState(false);
  const [ceremony, setCeremony] = useState(null);
  const [presentedBall, setPresentedBall] = useState(null);
  const [bowlingLength, setBowlingLength] = useState("good length");
  const committedHand = useRef(null);
  const [motion, setMotion] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [sound, setSound] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [arenaNotice, setArenaNotice] = useState("");
  const matchRef = useRef(null);
  const audioRef = useRef(null);
  const heardBall = useRef(null);
  const deliveryTimer = useRef(null);
  const recordedResult = useRef(null);
  const { context, value: phase } = snapshot;
  const current = context.scores[context.batting];
  const isPlaying = phase === "playing";
  const lastBall = context.lastBall;
  const boundary = [4, 5, 6].includes(lastBall?.runs);
  const summary = matchSummary(context);
  const insights = handMatchInsights(phase === "setup" ? { ...context, overs, wicketLimit } : context);
  const animate = motion && !reducedMotion;
  const plan = opponentPlan(context, batterIndex, bowlerIndex, opponentMode);

  useEffect(() => {
    if (!context.result || recovering || revealing || presentedBall !== lastBall) return;
    setCeremony((currentCeremony) => currentCeremony || "victory");
  }, [context.result, recovering, revealing, presentedBall, lastBall]);

  function completePresentation(delivery) {
    if (delivery !== lastBall || revealing) return;
    setPresentedBall(delivery);
    setRecovering(false);
    window.clearTimeout(deliveryTimer.current);
    deliveryTimer.current = null;
  }

  function completeCeremony(stage) {
    setCeremony((currentCeremony) => currentCeremony !== stage ? currentCeremony : stage === "victory" ? "handshakes" : stage === "handshakes" ? "award" : currentCeremony);
  }

  useEffect(() => {
    committedHand.current = isPlaying ? {
      computer: sampleOpponent(opponentPlan(context, batterIndex, bowlerIndex, opponentMode)),
      length: sampleLength(opponentPlan(context, batterIndex, bowlerIndex, opponentMode)),
      ...samplePresentation(),
    } : null;
  }, [context, isPlaying, batterIndex, bowlerIndex, opponentMode]);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    const updateFullscreen = () => setFullscreen(document.fullscreenElement === matchRef.current);
    preference.addEventListener("change", update);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => {
      preference.removeEventListener("change", update);
      document.removeEventListener("fullscreenchange", updateFullscreen);
      audioRef.current?.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    function keyPick(event) {
      if (!active || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
      if (/^[1-6]$/.test(event.key)) { event.preventDefault(); play(Number(event.key)); }
    }
    window.addEventListener("keydown", keyPick);
    return () => window.removeEventListener("keydown", keyPick);
  }, [active, isPlaying, animate]);

  useEffect(() => {
    if (!lastBall || heardBall.current === lastBall) return;
    heardBall.current = lastBall;
    const audio = audioRef.current;
    if (!active || !sound || !audio || audio.state !== "running" || document.hidden) return;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const time = audio.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(lastBall.wicket ? 180 : boundary ? 780 : 440, time);
    oscillator.frequency.exponentialRampToValueAtTime(lastBall.wicket ? 70 : boundary ? 1200 : 600, time + 0.18);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.045, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(time + 0.25);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }, [lastBall, active, sound, boundary]);

  async function toggleSound() {
    if (sound) { setSound(false); return; }
    try {
      if (!audioRef.current) audioRef.current = new window.AudioContext();
      await audioRef.current.resume();
      setSound(true);
      setArenaNotice("");
    } catch { setArenaNotice("Sound is unavailable in this browser."); }
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === matchRef.current) await document.exitFullscreen();
      else await matchRef.current.requestFullscreen();
    } catch { setArenaNotice("Fullscreen is unavailable in this browser."); }
  }

  useEffect(() => () => {
    window.clearTimeout(deliveryTimer.current);
    window.clearTimeout(tossTimer.current);
  }, []);
  useEffect(() => {
    if (context.result && recordedResult.current !== context.result) {
      recordedResult.current = context.result;
      const key = { you: "wins", computer: "losses", tie: "ties" }[context.result.winner];
      setRecord((previous) => ({ ...previous, [key]: previous[key] + 1 }));
    }
  }, [context.result]);
  useEffect(() => {
    try { localStorage.setItem(RECORD_KEY, JSON.stringify(record)); } catch {}
  }, [record]);

  function play(value) {
    if (!isPlaying || deliveryTimer.current !== null || !committedHand.current) return;
    const { computer, length, dismissal, side, fielderIndex, overthrow, directHit } = committedHand.current;
    committedHand.current = null;
    setBowlingLength(length);
    setSelected(value);
    setRevealing(true);
    setRecovering(true);
    deliveryTimer.current = window.setTimeout(() => {
      send({ type: "BALL", you: value, computer, length, dismissal, side, fielderIndex, overthrow, directHit });
      setRevealing(false);
    }, animate ? DELIVERY_MS : 250);
  }

  function reset() {
    window.clearTimeout(tossTimer.current);
    tossTimer.current = null;
    tossLocked.current = false;
    setToss(null);
    window.clearTimeout(deliveryTimer.current);
    deliveryTimer.current = null;
    setRevealing(false);
    setRecovering(false);
    setSelected(null);
    setCeremony(null);
    setPresentedBall(null);
    send({ type: "RESET" });
  }

  function callToss(call) {
    if (toss?.stage !== "call" || tossLocked.current) return;
    tossLocked.current = true;
    const outcome = { stage: "flipping", call, coin: Math.random() < 0.5 ? "heads" : "tails", computerDecision: Math.random() < 0.5 ? "bat" : "bowl", overs, wicketLimit };
    setToss(outcome);
    tossTimer.current = window.setTimeout(() => {
      setToss({ ...outcome, stage: "landed" });
      tossTimer.current = window.setTimeout(() => {
        setToss({ ...outcome, stage: "result" });
        tossTimer.current = null;
      }, 900);
    }, animate ? TOSS_MS : 250);
  }

  function confirmToss() {
    if (toss?.stage !== "result" || tossTimer.current !== null) return;
    setToss({ ...toss, stage: "handshake" });
    tossTimer.current = window.setTimeout(() => {
      send({ type: "TOSS", ...toss });
      setToss(null);
      tossLocked.current = false;
      tossTimer.current = null;
    }, animate ? HANDSHAKE_MS : 500);
  }

  const tossHeadline = toss?.stage === "call" ? "Call the toss" : toss?.stage === "flipping" ? "Coin in flight" : toss?.stage === "landed" ? toss.coin === "heads" ? "Heads" : "Tails" : toss?.stage === "result" ? `${toss.coin === "heads" ? "Heads" : "Tails"}. ${toss.call === toss.coin ? "You win" : "Computer wins"}.` : null;

  const headline = recovering && lastBall?.wicket ? DISMISSAL_LABELS[lastBall.dismissal].toUpperCase() : recovering && !revealing && lastBall?.noBall ? "FOUR + NO BALL" : phase === "setup" ? "Own the crease." : phase === "toss" ? "You won the toss" : phase === "ready" ? `${context.battingFirst === "you" ? "You bat" : "Computer bats"} first` : phase === "inningsBreak" ? "The chase is on." : phase === "finished" ? context.result.winner === "tie" ? "Honours even" : context.result.winner === "you" ? "Victory. Yours." : "Rival takes the match" : revealing ? "Delivery incoming" : lastBall?.wicket ? DISMISSAL_LABELS[lastBall.dismissal].toUpperCase() : lastBall?.noBall ? "FOUR + NO BALL" : lastBall?.overthrow ? "Overthrow. Extra runs." : lastBall?.directHit ? "Safe in the crease." : lastBall?.runs === 6 ? "SIX. Into the stands." : lastBall?.runs === 4 ? "FOUR. Through the field." : context.batting === "you" ? "Make your next move." : "Read your rival.";

  return (
    <section ref={matchRef} className="hand-page arena-experience" data-phase={phase} data-ceremony={ceremony || "none"} data-toss-stage={toss?.stage || "none"} data-motion={animate ? "on" : "off"} data-outcome={revealing ? "pending" : lastBall?.wicket ? "wicket" : boundary ? "boundary" : "normal"}>
      <div className="section-toolbar arena-toolbar"><span className="game-label"><Zap size={15} />NIGHTFALL / SOLO DUEL</span><div className="toolbar-actions">
        <div className="arena-camera-controls" role="group" aria-label="Camera view"><button className="square-button" aria-label="Broadcast camera" title="Broadcast camera" aria-pressed={cameraView === "broadcast"} onClick={() => setCameraView("broadcast")}><Camera size={16} /></button><button className="square-button" aria-label="Pitch camera" title="Pitch camera" aria-pressed={cameraView === "pitch"} onClick={() => setCameraView("pitch")}><Crosshair size={16} /></button></div>
        <button className="square-button" aria-label="Director camera" title="Director camera" aria-pressed={cameraView === "director"} onClick={() => setCameraView("director")}><Clapperboard size={16} /></button>
        <button className="square-button" onClick={() => setMotion(!motion)} disabled={reducedMotion} aria-pressed={animate} aria-label="Arena motion" title={reducedMotion ? "System reduced motion is enabled" : animate ? "Pause arena motion" : "Resume arena motion"}>{animate ? <Pause size={16} /> : <Play size={16} />}</button>
        <button className="square-button" onClick={toggleSound} aria-pressed={sound} aria-label="Match sound" title={sound ? "Mute match sound" : "Enable match sound"}>{sound ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
        <button className="square-button" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"} title={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}>{fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}</button>
        <button className="square-button" onClick={reset} title="New match" aria-label="New match"><RotateCcw size={16} /></button></div></div>
      {arenaNotice && <div className="hint-banner" role="status">{arenaNotice}</div>}
      <div className="opponent-matchup"><span><strong>{opponentMode === "classic" ? "CLASSIC RANDOM" : training.batters[batterIndex].name}</strong>{opponentMode === "classic" ? "Solo opponent" : `Batting reference / ${training.bowlers[bowlerIndex].name} bowling`}</span><span className="opponent-tactic">{plan.phase.toUpperCase()}<strong>{plan.tactic}</strong></span></div>
      <div className="hand-layout">
        <div className="hand-main">
          <div className="hand-scoreboard">
            {["you", "computer"].map((side) => <div key={side} className={`hand-score ${side} ${context.batting === side && isPlaying ? "batting" : ""}`}><span>{side === "you" ? "YOU" : "COMPUTER"}{context.batting === side && isPlaying && <span className="batting-label">BATTING</span>}</span><strong aria-label={`${side} score`}>{context.scores[side].runs}<small>/{context.scores[side].wickets}</small></strong><em>{formatOvers(context.scores[side].balls)} overs</em></div>)}
            <div className="innings-marker"><span>INNINGS</span><strong>0{context.innings}</strong>{context.target != null && <span>TARGET {context.target}</span>}</div>
          </div>
          <div className={`hand-arena ${revealing ? "revealing" : ""}`}>
            <CricketArena active={active} phase={phase} lastBall={lastBall} revealing={revealing} cameraView={cameraView} motion={animate} batting={context.batting} bowlingLength={bowlingLength} tossStage={toss?.stage || (["toss", "ready"].includes(phase) ? "complete" : "none")} tossCoin={toss?.coin || context.coin} ceremony={ceremony} winner={context.result?.winner} awardTeams={summary.award.map((entry) => entry.side).join(",")} onPresentationComplete={completePresentation} onCeremonyComplete={completeCeremony} />
            <div className="arena-heading"><span className="eyebrow">{ceremony === "award" ? "POST-MATCH PRESENTATION" : toss ? "THE TOSS / CAPTAINS AT THE CENTRE" : phase === "finished" ? "MATCH COMPLETE" : phase === "setup" ? "THE NIGHTFALL ARENA" : `${context.overs} OVER MATCH / ${insights.pressure.toUpperCase()}`}</span><h2>{ceremony === "award" ? `${summary.award.map((entry) => entry.side === "you" ? "You" : "Computer").join(" & ")} / ${summary.award.length > 1 ? "Joint Men" : "Man"} of the Match` : ceremony === "handshakes" ? "Well played." : toss?.stage === "handshake" ? "Captains shake hands" : tossHeadline || headline}</h2></div>
            <div className="hand-duel">
              <div className="hand-player you"><HandSign value={revealing ? selected : lastBall?.you} /><span>YOUR HAND<strong>{revealing ? selected : lastBall?.you || "--"}</strong></span></div>
              <div className="duel-divider">{phase === "finished" ? <Trophy size={28} /> : <span>VS</span>}</div>
              <div className="hand-player computer"><HandSign value={revealing ? null : lastBall?.computer} /><span>COMPUTER<strong>{revealing ? "?" : lastBall?.computer || "--"}</strong></span></div>
            </div>
            <div className="delivery-announcement" role="status" aria-live="polite">
              {toss ? toss.stage === "call" ? "Heads or tails?" : ["flipping", "landed"].includes(toss.stage) ? `You called ${toss.call}.` : `${toss.coin === "heads" ? "Heads" : "Tails"} / ${toss.call === toss.coin ? "You won the toss" : "Computer won the toss"}` : revealing ? "Hands in play..." : recovering && lastBall ? deliveryLabel(lastBall) : phase === "finished" ? `${context.result.winner === "tie" ? "Match tied" : context.result.winner === "you" ? "You won" : "Computer won"} / ${context.result.margin}` : phase === "inningsBreak" ? `${context.battingFirst === "you" ? "Computer needs" : "You need"} ${context.target} to win` : lastBall ? deliveryLabel(lastBall) : phase === "toss" || phase === "ready" ? `${context.coin === "heads" ? "Heads" : "Tails"}. ${context.tossWinner === "you" ? "You won" : "Computer won"} the toss.` : "The crease is yours."}
            </div>
          </div>
          <div className="arena-telemetry" aria-label="Match telemetry">
            <div><span>{context.target == null ? "FORMAT" : "RUNS NEEDED"}</span><strong>{context.target == null ? `${phase === "setup" ? overs : context.overs} OVERS` : insights.runsNeeded}</strong></div>
            <div><span>BALLS LEFT</span><strong>{insights.ballsLeft}</strong></div>
            <div><span>{context.target == null ? "CURRENT RATE" : "REQUIRED RATE"}</span><strong>{(context.target == null ? insights.currentRate : insights.requiredRate)?.toFixed(1) ?? "--"}<small> / over</small></strong></div>
            <div><span>OBJECTIVES</span><strong>{insights.objectives.filter((goal) => goal.value >= goal.target).length}<small> / 3</small></strong></div>
            {context.target != null && <progress className="chase-progress" aria-label="Chase progress" value={insights.chaseProgress} max="100" />}
          </div>
          <div className="hand-controls">
            {phase === "setup" && !toss && <button className="btn" onClick={() => setToss({ stage: "call" })}><Coins size={17} />Start toss<ArrowRight size={17} /></button>}
            {toss?.stage === "call" && <div className="choice-actions" role="group" aria-label="Call the toss"><button className="btn" onClick={() => callToss("heads")}><Coins size={17} />Heads</button><button className="btn btn-secondary" onClick={() => callToss("tails")}><Coins size={17} />Tails</button></div>}
            {toss?.stage === "flipping" && <button className="btn" disabled><Coins size={17} />Coin in flight</button>}
            {toss?.stage === "landed" && <button className="btn" disabled><Coins size={17} />{toss.coin === "heads" ? "Heads" : "Tails"}</button>}
            {toss?.stage === "result" && <button className="btn" onClick={confirmToss}>Continue<ArrowRight size={17} /></button>}
            {toss?.stage === "handshake" && <button className="btn" disabled><Hand size={17} />Captains shake hands</button>}
            {phase === "toss" && <div className="choice-actions"><button className="btn" onClick={() => send({ type: "CHOOSE", choice: "bat" })}><Hand size={16} />Bat first</button><button className="btn btn-secondary" onClick={() => send({ type: "CHOOSE", choice: "bowl" })}><Target size={16} />Bowl first</button></div>}
            {phase === "ready" && <button className="btn" onClick={() => send({ type: "START" })}><Play size={16} />Start match</button>}
            {phase === "inningsBreak" && <button className="btn" disabled={recovering} onClick={() => send({ type: "NEXT_INNINGS" })}><ArrowRight size={16} />Start the chase</button>}
            {phase === "finished" && <button className="btn" onClick={reset}><RotateCcw size={16} />Play again</button>}
            {isPlaying && <><div className="hand-pick-label"><span>{recovering ? "BALL IN THE FIELD" : context.batting === "you" ? "LOCK IN YOUR SHOT" : "LOCK IN YOUR DELIVERY"}</span><span>{context.overs * 6 - current.balls} balls left{context.target != null ? ` / ${Math.max(0, context.target - current.runs)} to win` : ""}</span></div><div className="number-picks">{[1, 2, 3, 4, 5, 6].map((value) => <button key={value} disabled={revealing || recovering} onClick={() => play(value)} aria-label={`Play ${value}`} aria-keyshortcuts={String(value)} title={`Play ${value}`} className={selected === value ? "last-picked" : ""}><HandSign value={value} /><strong>{value}</strong></button>)}</div></>}
          </div>
          <HandScorecard key={context.tossWinner || "setup"} context={phase === "setup" ? { ...context, wicketLimit } : context} summary={summary} phase={phase} overs={phase === "setup" ? overs : context.overs} awardVisible={ceremony === "award"} />
        </div>
        <aside className="game-aside">
          <div className="arena-settings">
          <fieldset className="toss-settings" disabled={!!toss}>
          <div className="opponent-settings"><label htmlFor="opponent-mode">Opponent</label><select id="opponent-mode" disabled={phase !== "setup"} value={opponentMode} onChange={(event) => setOpponentMode(event.target.value)}><option value="adaptive">Adaptive / International T20</option><option value="classic">Classic / Random</option></select>{opponentMode === "adaptive" && <><label htmlFor="batting-profile">Batting reference</label><select id="batting-profile" disabled={phase !== "setup"} value={batterIndex} onChange={(event) => setBatterIndex(Number(event.target.value))}>{training.batters.map((player, index) => <option key={player.name} value={index}>{player.name}</option>)}</select><label htmlFor="bowling-profile">Bowling reference</label><select id="bowling-profile" disabled={phase !== "setup"} value={bowlerIndex} onChange={(event) => setBowlerIndex(Number(event.target.value))}>{training.bowlers.map((player, index) => <option key={player.name} value={index}>{player.name}</option>)}</select></>}</div>
          <div className="aside-heading"><h3>{phase === "setup" ? "Match setup" : "Match details"}</h3><button className="text-button" title="Each hand is 1 to 6. Matching numbers take a wicket; otherwise the batter's number scores. Both sides get one innings." aria-label="Hand Cricket rules"><Info size={16} /></button></div>
          {phase === "setup" ? <div className="setup-fields"><div><label>Overs per innings</label><div className="segmented-control">{[1, 2, 5].map((value) => <button key={value} className={overs === value ? "selected" : ""} aria-pressed={overs === value} onClick={() => setOvers(value)}>{value} {value === 1 ? "over" : "overs"}</button>)}</div></div><div><label>Wickets per side</label><div className="segmented-control">{[1, 3, 5].map((value) => <button key={value} className={wicketLimit === value ? "selected" : ""} aria-pressed={wicketLimit === value} onClick={() => setWicketLimit(value)}>{value}</button>)}</div></div></div> : <dl className="game-facts"><div><dt>Format</dt><dd>{context.overs} overs</dd></div><div><dt>Wickets</dt><dd>{context.wicketLimit} per side</dd></div><div><dt>Toss</dt><dd>{context.tossWinner === "you" ? "You" : "Computer"}</dd></div><div><dt>Target</dt><dd>{context.target ?? "Not set"}</dd></div></dl>}
          </fieldset>
          </div>
          <div className="arena-objectives"><div className="aside-heading"><h3>Match objectives</h3><Target size={17} /></div>{insights.objectives.map((goal) => <div key={goal.label} className={`arena-objective ${goal.value >= goal.target ? "complete" : ""}`}><span className="objective-icon">{goal.value >= goal.target ? <Check size={15} /> : <Crosshair size={15} />}</span><div><strong>{goal.label}</strong><small>{goal.detail}</small><progress aria-label={goal.label} value={goal.value} max={goal.target} /></div><b>{goal.value}/{goal.target}</b></div>)}</div>
          <div className="record-section"><span className="eyebrow">YOUR RECORD / THIS BROWSER</span><div className="record-grid"><div><strong>{record.wins}</strong><span>Won</span></div><div><strong>{record.losses}</strong><span>Lost</span></div><div><strong>{record.ties}</strong><span>Tied</span></div></div><div className="arena-personal-stats"><span>This match</span><div><span>Boundaries</span><b>{insights.boundaries}</b></div><div><span>Wickets taken</span><b>{insights.wicketsTaken}</b></div><div><span>Best scoring streak</span><b>{insights.bestStreak} balls</b></div></div></div>
          <div className="delivery-history"><div className="aside-heading"><h3>Ball by ball</h3><span>{context.history.length} played</span></div>{!context.history.length ? <div className="history-empty">No deliveries yet</div> : <ol>{context.history.slice(-10).reverse().map((delivery) => <li key={`${delivery.innings}-${delivery.ball}`}><span>{delivery.innings}.{formatOvers(delivery.ball)}</span><div><strong>{delivery.batting === "you" ? "You" : "Computer"} / {deliveryLabel(delivery)}</strong><small>You {delivery.you} / Computer {delivery.computer}</small></div><b className={delivery.wicket ? "wicket-text" : ""}>{delivery.wicket ? "W" : `+${delivery.runs}`}</b></li>)}</ol>}</div>
        </aside>
      </div>
    </section>
  );
}