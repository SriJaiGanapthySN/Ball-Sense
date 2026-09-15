import { useEffect, useRef, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, FlaskConical, Info, Loader2, Play, Radio, RotateCcw, Target, X } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import TeamSelect from "./TeamSelect.jsx";
import TeamBadge from "./TeamBadge.jsx";
import { formatOvers, SCENARIO_PRESETS, validateScenario, SIMULATION_TRIALS, CHASE_MODEL_INFO } from "../lib/cricketGames.js";

const TEAMS = ["Afghanistan", "Australia", "Bangladesh", "England", "India", "Ireland", "Netherlands", "New Zealand", "Pakistan", "South Africa", "Sri Lanka", "West Indies", "Zimbabwe"];
const defaultChanges = () => ({ runs: 0, wickets: 0, balls: 0, approach: "balanced", pitch: "balanced" });
const GUIDE_KEY = "ballsense-whatif-guide-v1";

function NumericField({ id, label, value, min, max, onChange }) {
  return <div className="numeric-field"><label htmlFor={id}>{label}</label><input id={id} type="number" min={min} max={max} step="1" value={value} onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} /></div>;
}

function ProbabilityResult({ label, result, alternate = false }) {
  return (
    <div className={`simulation-outcome ${alternate ? "alternate" : ""}`}>
      <span className="eyebrow">{label}</span>
      <strong>{(result.winProbability * 100).toFixed(1)}<small>%</small></strong>
      <span className="outcome-caption">SIMULATED CHASE WINS</span>
      <div className="outcome-bar" aria-label={`${label} ${(result.winProbability * 100).toFixed(1)} percent wins`}><span style={{ width: `${result.winProbability * 100}%` }} /><span className="ties" style={{ width: `${result.tieProbability * 100}%` }} /></div>
      <div className="outcome-details"><span>Tie {(result.tieProbability * 100).toFixed(1)}%</span><span>Loss {(result.lossProbability * 100).toFixed(1)}%</span></div>
      <p className="section-caption">Win, tie and loss shares across simulated chases.</p>
      <p className="sampling-interval">95% sampling interval: {result.winInterval.map((value) => `${(value * 100).toFixed(1)}%`).join(" - ")}</p>
      <dl className="game-facts"><div><dt>Mean final score</dt><dd>{result.averageScore.toFixed(1)}</dd></div><div><dt>10th-90th percentile</dt><dd>{result.lowScore}-{result.highScore}</dd></div></dl>
    </div>
  );
}

export default function WhatIfTab({ importedScenario, active = true }) {
  const [scenario, setScenario] = useState(() => ({ ...SCENARIO_PRESETS[0], approach: "balanced", pitch: "balanced" }));
  const [changes, setChanges] = useState(defaultChanges);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  const [challengePick, setChallengePick] = useState(null);
  const [challengeScore, setChallengeScore] = useState({ correct: 0, attempts: 0 });
  const workerRef = useRef(null);
  const guideRef = useRef(null);
  const [guideOpen, setGuideOpen] = useState(() => {
    try { return localStorage.getItem(GUIDE_KEY) !== "seen"; } catch { return true; }
  });

  useEffect(() => {
    const dialog = guideRef.current;
    if (active && guideOpen && !dialog.open) dialog.showModal();
    else if ((!active || !guideOpen) && dialog.open) dialog.close();
  }, [active, guideOpen]);

  function dismissGuide() {
    setGuideOpen(false);
    try { localStorage.setItem(GUIDE_KEY, "seen"); } catch {}
  }

  useEffect(() => () => workerRef.current?.terminate(), []);
  useEffect(() => {
    if (!importedScenario) return;
    workerRef.current?.terminate();
    setRunning(false);
    setScenario({ ...importedScenario, approach: "balanced", pitch: "balanced" });
    setChanges(defaultChanges());
    setResult(null);
    setError(null);
    setVersion((value) => value + 1);
    setChallengePick(null);
  }, [importedScenario]);

  function changeField(key, value) {
    setScenario((previous) => ({ ...previous, [key]: value, id: "custom" }));
    setVersion((previous) => previous + 1);
  }

  function changeAlternative(key, value) {
    setChanges((previous) => ({ ...previous, [key]: value }));
    setVersion((previous) => previous + 1);
    setChallengePick(null);
  }

  function loadPreset(preset) {
    workerRef.current?.terminate();
    setRunning(false);
    setScenario({ ...preset, approach: "balanced", pitch: "balanced" });
    setChanges(defaultChanges());
    setResult(null);
    setError(null);
    setVersion((value) => value + 1);
    setChallengePick(null);
  }

  const alternative = { ...scenario, runs: Number(scenario.runs) + changes.runs, wickets: Number(scenario.wickets) + changes.wickets, ballsBowled: Number(scenario.ballsBowled) - changes.balls, approach: changes.approach, pitch: changes.pitch };
  const validation = validateScenario(scenario) || validateScenario(alternative);
  const remaining = Number(scenario.totalOvers) * 6 - Number(scenario.ballsBowled);
  const required = Math.max(0, Number(scenario.target) - Number(scenario.runs));
  const hasChanges = Object.entries(changes).some(([key, value]) => value !== defaultChanges()[key]);

  function runSimulation() {
    if (validation || running) return;
    setRunning(true);
    setError(null);
    workerRef.current?.terminate();
    const baseline = { ...scenario };
    const alternate = { ...alternative };
    const submittedVersion = version;
    const pick = challengePick;
    try {
      const worker = new Worker(new URL("../lib/cricketWorker.js", import.meta.url), { type: "module" });
      workerRef.current = worker;
      worker.onmessage = ({ data }) => {
        if (data.error) setError(data.error);
        else {
          const delta = (data.alternate.winProbability - data.baseline.winProbability) * 100;
          const outcome = Math.abs(delta) < 0.05 ? "same" : delta > 0 ? "higher" : "lower";
          const correct = pick ? pick === outcome : null;
          setResult({ ...data, baselineScenario: baseline, alternateScenario: alternate, version: submittedVersion, delta, correct, pick, outcome });
          if (pick) setChallengeScore((score) => ({ attempts: score.attempts + 1, correct: score.correct + Number(correct) }));
          setChallengePick(null);
        }
        setRunning(false);
        worker.terminate();
        workerRef.current = null;
      };
      worker.onerror = () => {
        setError("The simulator could not start. Please refresh and try again.");
        setRunning(false);
        worker.terminate();
        workerRef.current = null;
      };
      worker.postMessage({ baseline, alternate, seed: "ballsense-lab-v2" });
    } catch {
      setError("The simulator could not start in this browser.");
      setRunning(false);
    }
  }

  const chartBalls = result ? new Set([...result.baseline.timeline, ...result.alternate.timeline].map((point) => point.ball)) : new Set();
  const timeline = [...chartBalls].sort((first, second) => first - second).map((ball) => ({ ball, Baseline: result.baseline.timeline.find((point) => point.ball === ball)?.score, "What if": result.alternate.timeline.find((point) => point.ball === ball)?.score }));

  return (
    <section className="whatif-page">
      <dialog ref={guideRef} className="lab-guide" aria-labelledby="lab-guide-title" onCancel={dismissGuide}>
        <header><FlaskConical size={24} /><button className="square-button" onClick={dismissGuide} aria-label="Close lab guide" title="Close lab guide"><X size={18} /></button></header>
        <h2 id="lab-guide-title">One match. Two possibilities.</h2>
        <p>Compare a chase as it stands with a different match situation.</p>
        <ol><li><strong>Set the baseline.</strong> Choose a preset or enter the score, wickets, balls bowled and target.</li><li><strong>Change the situation.</strong> Add runs, save a wicket, allow more balls, or change the batting approach and pitch.</li><li><strong>Compare the results.</strong> Run matched simulations and compare win rates and score progression. Percentage points show the difference, not a guaranteed outcome.</li></ol>
        <p className="data-footnote">These are model-based scenarios, not betting forecasts. Sampling uncertainty does not measure every source of model error.</p>
        <button className="btn" onClick={dismissGuide}>Explore the lab<ArrowRight size={16} /></button>
      </dialog>
      <div className="section-toolbar"><span className="game-label amber"><FlaskConical size={15} />THE SCENARIO LAB</span><div className="toolbar-actions"><span className="simulation-tag">SIMULATION / NOT A FORECAST</span><button className="square-button" onClick={() => setGuideOpen(true)} aria-label="Lab guide" title="Lab guide"><Info size={18} /></button></div></div>
      <div className="scenario-presets">{SCENARIO_PRESETS.map((preset, index) => <button key={preset.id} onClick={() => loadPreset(preset)} className={scenario.id === preset.id ? "active" : ""}><span>0{index + 1} / {preset.format}</span><strong>{preset.title}</strong><small>{preset.label}</small><ArrowUpRight size={16} /></button>)}</div>
      {scenario.source && <div className="hint-banner imported-banner"><Radio size={17} /><span>Snapshot: {scenario.source}. Target inferred from the first innings; confirm it before simulating.</span></div>}
      <div className="lab-layout">
        <div className="scenario-editor">
          <div className="aside-heading"><h3>The match situation</h3><button className="square-button" onClick={() => loadPreset(SCENARIO_PRESETS[0])} title="Reset scenario" aria-label="Reset scenario"><RotateCcw size={15} /></button></div>
          <div className="scenario-teams"><TeamSelect id="chasing-team" label="Chasing team" value={scenario.team} teams={[...new Set([...TEAMS, scenario.team])].filter((team) => team !== scenario.opponent)} onChange={(team) => changeField("team", team)} /><TeamSelect id="defending-team" label="Defending team" value={scenario.opponent} teams={[...new Set([...TEAMS, scenario.opponent])].filter((team) => team !== scenario.team)} onChange={(team) => changeField("opponent", team)} /></div>
          <div className="scenario-numbers"><div><label htmlFor="scenario-format">Format</label><select id="scenario-format" value={scenario.format} onChange={(event) => { const format = event.target.value; const totalOvers = format === "T20" ? 20 : 50; setScenario((previous) => ({ ...previous, format, totalOvers, ballsBowled: Math.min(Number(previous.ballsBowled), totalOvers * 6), id: "custom" })); setVersion((value) => value + 1); }}><option>T20</option><option>ODI</option></select></div><NumericField id="scenario-overs" label="Innings overs" value={scenario.totalOvers} min={1} max={scenario.format === "T20" ? 20 : 50} onChange={(value) => changeField("totalOvers", value)} /><NumericField id="scenario-runs" label="Current runs" value={scenario.runs} min={0} max={1000} onChange={(value) => changeField("runs", value)} /><NumericField id="scenario-wickets" label="Wickets lost" value={scenario.wickets} min={0} max={10} onChange={(value) => changeField("wickets", value)} /><NumericField id="scenario-balls" label="Balls bowled" value={scenario.ballsBowled} min={0} max={Number(scenario.totalOvers) * 6} onChange={(value) => changeField("ballsBowled", value)} /><NumericField id="scenario-target" label="Target to win" value={scenario.target} min={1} max={1000} onChange={(value) => changeField("target", value)} /></div>
          <div className="scenario-equation"><Target size={19} /><strong>{required}</strong><span>from</span><strong>{Math.max(0, remaining)}</strong><span>balls</span><small>RRR {remaining > 0 ? (required * 6 / remaining).toFixed(2) : required ? "--" : "0.00"}</small></div>
          <div className="scenario-changes"><div className="aside-heading"><h3>What changes?</h3><button className="text-button" onClick={() => { setChanges(defaultChanges()); setVersion((value) => value + 1); setChallengePick(null); }} title="Reset changes" aria-label="Reset changes"><RotateCcw size={15} /></button></div>
            {[
              { key: "runs", label: "Runs on the board", min: -24, max: 24 },
              { key: "wickets", label: "Wickets lost", min: -3, max: 3 },
              { key: "balls", label: "Balls remaining", min: -12, max: 12 },
            ].map(({ key, label, min, max }) => <div className="scenario-slider" key={key}><label htmlFor={`change-${key}`}>{label}<output>{changes[key] > 0 ? "+" : ""}{changes[key]}</output></label><input id={`change-${key}`} type="range" min={min} max={max} step="1" value={changes[key]} onChange={(event) => changeAlternative(key, Number(event.target.value))} /></div>)}
            <div className="scenario-numbers"><div><label htmlFor="approach">Batting approach</label><select id="approach" value={changes.approach} onChange={(event) => changeAlternative("approach", event.target.value)}><option value="cautious">Cautious</option><option value="balanced">Balanced</option><option value="attacking">Attacking</option></select></div><div><label htmlFor="pitch">Pitch</label><select id="pitch" value={changes.pitch} onChange={(event) => changeAlternative("pitch", event.target.value)}><option value="balanced">Balanced</option><option value="batting">Batting-friendly</option><option value="bowling">Bowling-friendly</option></select></div></div>
          </div>
          {validation && <div className="error-banner" role="alert">{validation}</div>}
          {error && <div className="error-banner" role="alert">{error}</div>}
          <button className="btn run-simulation" onClick={runSimulation} disabled={!!validation || running}>{running ? <Loader2 size={17} className="spin" /> : <Play size={17} />}{running ? `Simulating ${SIMULATION_TRIALS.toLocaleString()} chases...` : "Run the scenario"}{!running && <ArrowRight size={17} />}</button>
        </div>
        <div className="lab-results" aria-busy={running}>
          <div className="scenario-scoreline"><TeamBadge name={scenario.team} size={36} showLabel={false} /><div><span>{scenario.team} chasing {scenario.target || "--"}</span><strong>{scenario.runs === "" ? "--" : scenario.runs}<small>/{scenario.wickets === "" ? "--" : scenario.wickets}</small><em>{formatOvers(Number(scenario.ballsBowled))} overs</em></strong></div><span className="scoreline-format">{scenario.format}</span></div>
          <div className="challenge-row"><div><span className="eyebrow">CALL THE IMPACT</span><p>Does the chase become easier?</p></div><div className="segmented-control">{[["higher", "Yes"], ["same", "Same"], ["lower", "No"]].map(([value, label]) => <button key={value} disabled={running || !hasChanges} className={challengePick === value ? "selected" : ""} aria-pressed={challengePick === value} onClick={() => setChallengePick(value)}>{label}</button>)}</div>{challengeScore.attempts > 0 && <span className="challenge-tally">{challengeScore.correct}/{challengeScore.attempts} correct</span>}</div>
          {result && active ? <>
            <div className="result-heading"><h3>{result.baselineScenario.team} / Simulated finish</h3><span>{result.version !== version ? "Inputs changed / Previous run" : `${result.baseline.trials.toLocaleString()} MATCHED TRIALS`}</span></div>
            <div className="outcome-comparison"><ProbabilityResult label="BASELINE" result={result.baseline} /><ProbabilityResult label="WHAT IF" result={result.alternate} alternate /></div>
            <div className={`simulation-delta ${result.delta < 0 ? "negative" : ""}`}>{result.delta < 0 ? <ArrowDownRight size={24} /> : <ArrowUpRight size={24} />}<strong>{result.delta > 0 ? "+" : ""}{result.delta.toFixed(1)}<small>percentage points</small></strong><span>{result.correct != null ? <><Check size={14} />{result.correct ? "Good call" : `Result: ${result.outcome === "higher" ? "easier" : result.outcome === "lower" ? "harder" : "unchanged"}`}</> : "Change in simulated win rate"}</span></div>
            <div className="simulation-chart"><h3>Chase score progression</h3><p className="section-caption">Average total runs by over for each scenario. Finished chases hold their final score; the dashed line marks the target.</p><ResponsiveContainer width="100%" height={260}><LineChart data={timeline} margin={{ top: 16, right: 15, left: 0, bottom: 18 }}><CartesianGrid stroke="#343c37" vertical={false} strokeDasharray="3 5" /><XAxis type="number" domain={["dataMin", "dataMax"]} dataKey="ball" stroke="#a5afa8" tickFormatter={formatOvers} fontSize={10} label={{ value: "Overs bowled", position: "insideBottom", offset: -10, fill: "#a5afa8", fontSize: 11 }} /><YAxis stroke="#a5afa8" fontSize={10} domain={["auto", "auto"]} label={{ value: "Runs", angle: -90, position: "insideLeft", fill: "#a5afa8", fontSize: 11 }} /><Tooltip labelFormatter={(ball) => `${formatOvers(ball)} overs`} contentStyle={{ background: "#191d1b", border: "1px solid #343c37", borderRadius: 5, fontSize: 11 }} /><ReferenceLine y={Number(result.baselineScenario.target)} stroke="#d7b779" strokeDasharray="4 4" ifOverflow="extendDomain" /><Legend verticalAlign="top" wrapperStyle={{ fontSize: 10 }} /><Line type="linear" dataKey="Baseline" stroke="#89abd3" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="linear" dataKey="What if" stroke="#71c9a0" strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>
          </> : <div className="lab-empty"><FlaskConical size={50} strokeWidth={1} /><span className="eyebrow">AN ALTERNATE INNINGS</span><h3>{running ? "Playing out the possibilities..." : "The result is unwritten."}</h3><div className="lab-preview"><span>BASELINE<strong>{scenario.runs || 0}/{scenario.wickets || 0}</strong><small>{remaining} balls left</small></span><ArrowRight size={25} /><span>WHAT IF<strong>{alternative.runs}/{alternative.wickets}</strong><small>{Number(scenario.totalOvers) * 6 - alternative.ballsBowled} balls left</small></span></div></div>}
          <p className="data-footnote">Empirical delivery model from {CHASE_MODEL_INFO.trainingMatches.toLocaleString()} sampled men's international chases through {CHASE_MODEL_INFO.trainedThrough}. Format, innings phase, wickets and extras affect outcomes; team names remain labels. Approach and pitch changes are assumptions, not proven causal effects. No player strength, DLS, injuries or explicit free-hit state. Held-out delivery fit improved; match-win calibration is not yet validated. Sampling intervals exclude model error.</p>
        </div>
      </div>
    </section>
  );
}