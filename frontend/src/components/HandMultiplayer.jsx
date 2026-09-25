import { useEffect, useRef, useState } from "react";
import { ArrowRight, Camera, Check, Clapperboard, Clock3, Coins, Copy, Crosshair, Hand, Link, LogOut, Maximize, Minimize, Pause, Play, RotateCcw, Shirt, Target, Users, Volume2, VolumeX, Wifi, WifiOff } from "lucide-react";
import useHandMultiplayer from "../hooks/useHandMultiplayer.js";
import { formatOvers, handMatchInsights, initialHandContext } from "../lib/cricketGames.js";
import { DELIVERY_MS } from "../lib/cricketOpponent.js";
import { deliveryLabel, matchSummary } from "../lib/cricketPresentation.js";
import { inviteCode, multiplayerToss, roomInviteUrl, secondsLeft } from "../lib/handMultiplayer.js";
import CricketArena from "./CricketArena.jsx";
import HandScorecard from "./HandScorecard.jsx";

const EMPTY_CONTEXT = initialHandContext();

export default function HandMultiplayer({ active, HandSign }) {
  const multiplayer = useHandMultiplayer();
  const { room, session, connection, now } = multiplayer;
  const [name, setName] = useState("");
  const [code, setCode] = useState(() => inviteCode(window.location.search));
  const [lobbyMode, setLobbyMode] = useState(() => inviteCode(window.location.search) ? "join" : "create");
  const [overs, setOvers] = useState(2);
  const [wicketLimit, setWicketLimit] = useState(3);
  const [selected, setSelected] = useState(null);
  const [cameraView, setCameraView] = useState("director");
  const [motion, setMotion] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [sound, setSound] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState("");
  const [displayedBall, setDisplayedBall] = useState(null);
  const [completedBall, setCompletedBall] = useState(null);
  const [revealing, setRevealing] = useState(false);
  const [ceremony, setCeremony] = useState(null);
  const matchRef = useRef(null);
  const leaveRef = useRef(null);
  const audioRef = useRef(null);
  const playRef = useRef(null);
  const context = room?.context || EMPTY_CONTEXT;
  const seat = room?.seat || "you";
  const opponent = seat === "you" ? "computer" : "you";
  const names = { you: room?.players.you?.name || "Host", computer: room?.players.computer?.name || "Challenger" };
  const phase = room?.phase || "setup";
  const toss = multiplayerToss(room);
  const arenaPhase = phase === "lobby" ? "setup" : phase === "reveal" ? "playing" : phase;
  const lastBall = context.lastBall;
  const animate = motion && !reducedMotion;
  const bothConnected = connection === "connected" && room?.players.you?.connected && room?.players.computer?.connected;
  const ready = room?.ready.includes(seat);
  const locked = room?.locked.includes(seat) || multiplayer.pickPending;
  const fieldBusy = revealing || !!lastBall && completedBall !== lastBall;
  const canPick = phase === "playing" && bothConnected && !locked && !fieldBusy;
  const summary = matchSummary(context);
  const insights = handMatchInsights(context, seat);
  const remaining = secondsLeft(room?.deadline, now);
  const reconnectRemaining = secondsLeft(room?.players[opponent]?.reconnectUntil, now);
  const resultText = context.result?.reason === "abandoned" ? "Match abandoned" : context.result?.winner === "tie" ? "Honours even" : context.result ? `${names[context.result.winner]} wins` : "";

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
    setSelected(null);
    setCeremony(null);
    setCompletedBall(null);
  }, [room?.matchId]);

  useEffect(() => {
    if (!lastBall) {
      setDisplayedBall(null);
      setRevealing(false);
      setCompletedBall(null);
      return;
    }
    setCompletedBall(null);
    setRevealing(true);
    const timer = window.setTimeout(() => {
      setDisplayedBall(lastBall);
      setRevealing(false);
    }, animate ? DELIVERY_MS : 250);
    return () => window.clearTimeout(timer);
  }, [lastBall, room?.matchId]);

  useEffect(() => {
    if (phase === "reveal" && lastBall && completedBall === lastBall && bothConnected && !ready) multiplayer.send("READY");
  }, [phase, lastBall, completedBall, bothConnected, ready, now]);

  useEffect(() => {
    if (phase === "finished" && context.result?.reason === "completed" && completedBall === lastBall) setCeremony((previous) => previous || "victory");
  }, [phase, context.result?.reason, completedBall, lastBall]);

  useEffect(() => {
    if (!displayedBall || !active || !sound || document.hidden || audioRef.current?.state !== "running") return;
    const audio = audioRef.current;
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.frequency.setValueAtTime(displayedBall.wicket ? 180 : displayedBall.runs >= 4 ? 780 : 440, audio.currentTime);
    gain.gain.setValueAtTime(0.04, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.2);
    tone.connect(gain);
    gain.connect(audio.destination);
    tone.start();
    tone.stop(audio.currentTime + 0.2);
    tone.onended = () => { tone.disconnect(); gain.disconnect(); };
  }, [displayedBall]);

  function play(value) {
    if (canPick && multiplayer.send("PICK", { pick: value })) setSelected(value);
  }
  playRef.current = play;
  useEffect(() => {
    function keyPick(event) {
      if (!active || leaveRef.current?.open || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
      if (/^[1-6]$/.test(event.key)) { event.preventDefault(); playRef.current(Number(event.key)); }
    }
    window.addEventListener("keydown", keyPick);
    return () => window.removeEventListener("keydown", keyPick);
  }, [active]);

  async function copy(value, label) {
    try { await navigator.clipboard.writeText(value); setNotice(`${label} copied`); }
    catch { setNotice(`Copy this ${label.toLowerCase()}: ${value}`); }
  }

  async function toggleSound() {
    if (sound) { setSound(false); return; }
    try {
      if (!audioRef.current) audioRef.current = new window.AudioContext();
      await audioRef.current.resume();
      setSound(true);
    } catch { setNotice("Sound is unavailable in this browser."); }
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === matchRef.current) await document.exitFullscreen();
      else await matchRef.current.requestFullscreen();
    } catch { setNotice("Fullscreen is unavailable in this browser."); }
  }

  function leave() {
    if (room && !["lobby", "finished"].includes(phase)) leaveRef.current.showModal();
    else multiplayer.leave();
  }

  const headline = phase === "setup" ? "Meet at the crease." : phase === "lobby" ? room.players.computer ? "Both captains are here." : "Your challenger is up next." : phase === "toss" ? toss.headline : phase === "ready" ? `${names[context.battingFirst]} bats first.` : phase === "inningsBreak" ? "The chase is on." : phase === "finished" ? resultText : revealing ? "Both hands locked." : fieldBusy ? deliveryLabel(displayedBall) : locked ? "Waiting for your opponent." : context.batting === seat ? "Make your next move." : "Read your rival.";
  const statusText = !session ? "PRIVATE MATCH" : connection !== "connected" ? connection === "expired" ? "SESSION UNAVAILABLE" : connection === "offline" ? "OFFLINE" : "RECONNECTING" : !room?.players[opponent] ? "WAITING FOR PLAYER" : !bothConnected ? `OPPONENT OFFLINE / ${reconnectRemaining ?? 60}s` : phase === "finished" ? "MATCH COMPLETE" : phase === "lobby" ? "ROOM CONNECTED" : `CONNECTED / ${remaining ?? 45}s`;

  return <section ref={matchRef} className="hand-page arena-experience online-hand" data-phase={arenaPhase} data-seat={seat} data-ceremony={ceremony || "none"} data-toss-stage={toss.stage} data-motion={animate ? "on" : "off"} data-outcome={revealing ? "pending" : displayedBall?.wicket ? "wicket" : displayedBall?.runs >= 4 ? "boundary" : "normal"}>
    <div className="section-toolbar arena-toolbar"><span className="game-label"><Users size={15} />NIGHTFALL / FRIENDS DUEL</span><div className="toolbar-actions">
      <div className="arena-camera-controls" role="group" aria-label="Camera view">{[["broadcast", Camera, "Broadcast camera"], ["pitch", Crosshair, "Pitch camera"], ["director", Clapperboard, "Director camera"]].map(([view, Icon, label]) => <button key={view} className="square-button" aria-label={label} title={label} aria-pressed={cameraView === view} onClick={() => setCameraView(view)}><Icon size={16} /></button>)}</div>
      <button className="square-button" title={animate ? "Pause arena motion" : "Resume arena motion"} aria-label="Arena motion" aria-pressed={animate} disabled={reducedMotion} onClick={() => setMotion(!motion)}>{animate ? <Pause size={16} /> : <Play size={16} />}</button>
      <button className="square-button" title={sound ? "Mute match sound" : "Enable match sound"} aria-label="Match sound" aria-pressed={sound} onClick={toggleSound}>{sound ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
      <button className="square-button" title={fullscreen ? "Exit fullscreen" : "Enter fullscreen"} aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"} onClick={toggleFullscreen}>{fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}</button>
      {session && <button className="square-button" title="Leave room" aria-label="Leave room" onClick={leave}><LogOut size={16} /></button>}
    </div></div>
    {multiplayer.error && <div className="error-banner" role="alert">{multiplayer.error}{connection === "offline" && <button className="text-button" onClick={multiplayer.reconnect}><RotateCcw size={15} />Reconnect</button>}</div>}
    {notice && <div className="hint-banner room-notice" role="status">{notice}<button className="text-button" onClick={() => setNotice("")} aria-label="Dismiss notice"><Check size={15} /></button></div>}
    {!session && <form className="room-lobby" onSubmit={(event) => { event.preventDefault(); setNotice(""); if (lobbyMode === "create") multiplayer.create({ name: name.trim(), overs, wicketLimit }); else multiplayer.join(code, name.trim()); }}>
      <div className="room-lobby-heading"><span className="eyebrow">THE PAVILION / TWO PLAYERS</span><h2>Play with a friend</h2><div className="segmented-control" role="group" aria-label="Room action"><button type="button" className={lobbyMode === "create" ? "selected" : ""} aria-pressed={lobbyMode === "create"} onClick={() => setLobbyMode("create")}>Create room</button><button type="button" className={lobbyMode === "join" ? "selected" : ""} aria-pressed={lobbyMode === "join"} onClick={() => setLobbyMode("join")}>Join room</button></div></div>
      <fieldset className="room-fields" disabled={multiplayer.busy}>
        <label className="room-field">Your name<input autoComplete="nickname" maxLength={24} required value={name} onChange={(event) => setName(event.target.value)} placeholder="Player name" /></label>
        {lobbyMode === "join" ? <label className="room-field">Room code<input className="room-code-input" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))} autoComplete="off" spellCheck="false" maxLength={6} pattern="[A-Z2-9]{6}" required placeholder="ABC234" /></label> : <>
          <div className="room-field"><span>Overs per innings</span><div className="segmented-control">{[1, 2, 5].map((value) => <button type="button" key={value} className={overs === value ? "selected" : ""} aria-pressed={overs === value} onClick={() => setOvers(value)}>{value}</button>)}</div></div>
          <div className="room-field"><span>Wickets per side</span><div className="segmented-control">{[1, 3, 5].map((value) => <button type="button" key={value} className={wicketLimit === value ? "selected" : ""} aria-pressed={wicketLimit === value} onClick={() => setWicketLimit(value)}>{value}</button>)}</div></div>
        </>}
        <button className="btn room-enter" disabled={multiplayer.busy || !name.trim() || lobbyMode === "join" && code.length !== 6}><Users size={17} />{multiplayer.busy ? "Connecting..." : lobbyMode === "create" ? "Create private room" : "Join match"}<ArrowRight size={17} /></button>
      </fieldset>
    </form>}
    <div className="room-connection"><span className={connection === "connected" ? "room-online" : ""}>{connection === "connected" ? <Wifi size={15} /> : <WifiOff size={15} />}{statusText}</span>{session && <div className="room-invite"><span>ROOM <strong aria-label="Room code">{session.code}</strong></span><button className="square-button" aria-label="Copy room code" title="Copy room code" onClick={() => copy(session.code, "Room code")}><Copy size={15} /></button><button className="square-button" aria-label="Copy invite link" title="Copy invite link" onClick={() => copy(roomInviteUrl(window.location, session.code), "Invite link")}><Link size={15} /></button></div>}</div>
    {room && <div className="room-captains" aria-label="Match captains">{["you", "computer"].map((side) => {
      const player = room.players[side];
      const playerReady = room.ready.includes(side);
      return <div key={side} className={`room-captain ${side}`} data-connected={!!player?.connected}>
        <span className="captain-kit"><Shirt size={25} strokeWidth={1.6} /></span>
        <div className="captain-identity"><span>{side === "you" ? "HOME / ROOM CREATOR" : "AWAY / TOSS CALLER"}</span><strong>{player?.name || "Waiting for a friend"}{side === seat && <small>YOU</small>}</strong></div>
        <span className={`captain-presence ${player?.connected ? "connected" : ""}`}><i />{!player ? "Open seat" : !player.connected ? "Offline" : playerReady ? "Ready" : "Connected"}</span>
      </div>;
    })}</div>}
    <div className="hand-main">
      <div className="hand-scoreboard">{["you", "computer"].map((side) => <div key={side} className={`hand-score ${side} ${context.batting === side && ["playing", "reveal"].includes(phase) ? "batting" : ""}`}><span className="team-role">{side === "you" ? "HOME XI" : "AWAY XI"}{context.batting === side && ["playing", "reveal"].includes(phase) && <span className="batting-label">BATTING</span>}</span><span><span className="room-player-name">{names[side]}</span>{side === seat && room && <small>YOU</small>}</span><strong aria-label={`${names[side]} score`}>{context.scores[side].runs}<small>/{context.scores[side].wickets}</small></strong><em>{formatOvers(context.scores[side].balls)} overs</em></div>)}<div className="innings-marker"><span>INNINGS</span><strong>0{context.innings}</strong>{context.target != null && <span>TARGET {context.target}</span>}</div></div>
      <div className={`hand-arena ${revealing ? "revealing" : ""}`}>
        <CricketArena active={active} phase={arenaPhase} lastBall={displayedBall} revealing={revealing} cameraView={cameraView} motion={animate} batting={context.batting} bowlingLength={lastBall?.length || "good length"} tossStage={toss.stage} tossCoin={context.coin} tossTiming={phase === "toss" ? { ...room.toss, serverOffset: multiplayer.clockOffset } : null} ceremony={ceremony} winner={context.result?.winner} teamNames={names} scoreboard={context} awardTeams={summary.award.map((entry) => entry.side).join(",")} onPresentationComplete={(delivery) => { if (delivery === lastBall && !revealing) setCompletedBall(delivery); }} onCeremonyComplete={(stage) => setCeremony((previous) => previous !== stage ? previous : stage === "victory" ? "handshakes" : stage === "handshakes" ? "award" : previous)} />
        <div className="arena-heading"><span className="eyebrow">{ceremony === "award" ? "POST-MATCH PRESENTATION" : phase === "toss" ? "THE TOSS / CAPTAINS AT THE CENTRE" : phase === "setup" ? "THE NIGHTFALL ARENA" : phase === "lobby" ? `${room.context.overs} OVERS / ${room.context.wicketLimit} WICKETS` : context.batting === seat ? "YOUR XI / BATTING" : "YOUR XI / BOWLING"}</span><h2>{ceremony === "award" ? `${summary.award.map((entry) => names[entry.side]).join(" & ")} / Player of the Match` : ceremony === "handshakes" ? "Well played." : headline}</h2></div>
        {!["setup", "lobby", "toss", "ready"].includes(phase) && <div className="hand-duel">{["you", "computer"].map((side, index) => <div key={side} className={`hand-player ${side}`}><HandSign value={revealing ? null : displayedBall?.[side]} /><span>{names[side]}<strong>{revealing ? "?" : displayedBall?.[side] || "--"}</strong></span>{index === 0 && <span className="room-vs">VS</span>}</div>)}</div>}
        <div className="delivery-announcement" role="status" aria-live="polite">{phase === "finished" ? `${resultText} / ${context.result.margin}` : revealing ? "Both numbers are locked" : phase === "reveal" ? fieldBusy ? deliveryLabel(displayedBall) : "Waiting for both players" : phase === "playing" ? locked ? "Your number is locked" : room.locked.includes(opponent) ? "Opponent ready. Your move." : `${names[context.batting]} batting` : phase === "toss" ? toss.announcement : phase === "inningsBreak" ? `${names[context.battingFirst === "you" ? "computer" : "you"]} needs ${context.target} to win` : phase === "lobby" ? room.players.computer ? `${names.you} vs ${names.computer}` : `Room ${room.code} / Waiting for a challenger` : "NIGHTFALL ARENA"}</div>
      </div>
      {room && <>
        <div className="hand-controls">
          {["lobby", "ready", "inningsBreak"].includes(phase) && <button className="btn" disabled={!bothConnected || ready} onClick={() => multiplayer.send("READY")}><Check size={17} />{ready ? "Waiting for opponent" : phase === "lobby" ? "Ready for toss" : phase === "inningsBreak" ? "Ready for the chase" : "Ready to play"}</button>}
          {phase === "toss" && <div className="toss-desk">
            <div className="toss-desk-header"><Coins size={22} /><div><span>AWAY CAPTAIN'S CALL</span><strong>{toss.callerName}</strong></div><span className="toss-countdown"><Clock3 size={14} />{bothConnected && remaining != null ? `${remaining}s` : "--"}</span></div>
            <ol className="toss-stages" aria-label="Toss progress">{["Call", "Coin toss", "Result", "Bat or bowl"].map((label, index) => <li key={label} className={index <= toss.step ? "reached" : ""} aria-current={index === toss.step ? "step" : undefined}><span>{index < toss.step ? <Check size={12} /> : index + 1}</span>{label}</li>)}</ol>
            {toss.stage === "call" && (toss.canCall ? <div className="choice-actions" role="group" aria-label="Call the toss"><button className="btn" disabled={!bothConnected} onClick={() => multiplayer.send("CALL_TOSS", { call: "heads" })}><Coins size={17} />Heads</button><button className="btn btn-secondary" disabled={!bothConnected} onClick={() => multiplayer.send("CALL_TOSS", { call: "tails" })}><Coins size={17} />Tails</button></div> : <p className="room-wait">Waiting for {toss.callerName} to call heads or tails</p>)}
            {toss.stage === "flipping" && <p className="room-wait"><Coins size={17} />Coin in flight</p>}
            {toss.stage === "landed" && <p className="room-wait"><Coins size={17} />{toss.coinLabel}</p>}
            {toss.stage === "result" && <div className="choice-actions"><button className="btn" disabled={!bothConnected || ready} onClick={() => multiplayer.send("CONTINUE_TOSS")}><Check size={17} />{ready ? "Waiting for opponent" : "Continue"}<ArrowRight size={17} /></button></div>}
            {toss.stage === "handshake" && <p className="room-wait"><Hand size={17} />Captains shake hands</p>}
            {toss.stage === "complete" && (toss.canChoose ? <div className="choice-actions"><button className="btn" disabled={!bothConnected} onClick={() => multiplayer.send("CHOOSE", { choice: "bat" })}><Hand size={17} />Bat first</button><button className="btn btn-secondary" disabled={!bothConnected} onClick={() => multiplayer.send("CHOOSE", { choice: "bowl" })}><Target size={17} />Bowl first</button></div> : <p className="room-wait">{toss.winnerName} is choosing bat or bowl</p>)}
          </div>}
          {["playing", "reveal"].includes(phase) && <><div className="hand-pick-label"><span>{fieldBusy || phase === "reveal" ? "BALL IN THE FIELD" : locked ? "NUMBER LOCKED" : context.batting === seat ? "LOCK IN YOUR SHOT" : "LOCK IN YOUR DELIVERY"}</span><span>{bothConnected ? names[opponent] : "Opponent disconnected"}</span></div><div className="number-picks">{[1, 2, 3, 4, 5, 6].map((value) => <button key={value} disabled={!canPick} onClick={() => play(value)} aria-label={`Play ${value}`} aria-keyshortcuts={String(value)} title={`Play ${value}`} className={selected === value ? "last-picked" : ""}><HandSign value={value} /><strong>{value}</strong></button>)}</div></>}
          {phase === "finished" && <div className="choice-actions"><button className="btn" disabled={!bothConnected || room.rematch.includes(seat)} onClick={() => multiplayer.send("REMATCH")}><RotateCcw size={17} />{room.rematch.includes(seat) ? "Rematch requested" : room.rematch.includes(opponent) ? "Accept rematch" : "Rematch"}</button><button className="btn btn-secondary" onClick={multiplayer.leave}><LogOut size={17} />Leave room</button></div>}
        </div>
        <div className="arena-telemetry"><div><span>{context.target == null ? "FORMAT" : "RUNS NEEDED"}</span><strong>{context.target == null ? `${context.overs} OVERS` : insights.runsNeeded}</strong></div><div><span>BALLS LEFT</span><strong>{insights.ballsLeft}</strong></div><div><span>{context.target == null ? "CURRENT RATE" : "REQUIRED RATE"}</span><strong>{(context.target == null ? insights.currentRate : insights.requiredRate)?.toFixed(1) ?? "--"}</strong></div><div><span>{locked ? "YOUR PICK" : "TURN CLOCK"}</span><strong>{locked ? "LOCKED" : bothConnected && remaining != null ? `${remaining}s` : "--"}</strong></div></div>
        <HandScorecard key={room.matchId} context={context} summary={summary} phase={arenaPhase} overs={context.overs} awardVisible={ceremony === "award"} names={names} />
        <div className="room-match-details"><div><span className="eyebrow">YOUR MATCH</span><h3>{names[seat]}</h3></div><div><span>Boundaries</span><strong>{insights.boundaries}</strong></div><div><span>Wickets taken</span><strong>{insights.wicketsTaken}</strong></div><div><span>Best scoring streak</span><strong>{insights.bestStreak} balls</strong></div></div>
      </>}
    </div>
    <dialog className="room-leave-dialog" ref={leaveRef}><h2>Leave this match?</h2><p>Your opponent will win by forfeit.</p><div className="choice-actions"><button className="btn btn-secondary" onClick={() => leaveRef.current.close()}>Stay</button><button className="btn" onClick={() => { leaveRef.current.close(); multiplayer.leave(); }}><LogOut size={16} />Leave match</button></div></dialog>
  </section>;
}