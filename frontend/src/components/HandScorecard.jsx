import { useId, useState } from "react";
import { Trophy } from "lucide-react";
import { formatOvers, handInningsLimits } from "../lib/cricketGames.js";
import { deliveryLabel, matchSummary } from "../lib/cricketPresentation.js";

export default function HandScorecard({ context, summary, phase, overs, awardVisible, names }) {
  const [selected, setSelected] = useState(null);
  const [selectedRound, setSelectedRound] = useState(context.superOver || 0);
  const scorecardId = useId();
  const round = context.completedRounds?.find((entry) => entry.superOver === selectedRound);
  const archived = !!round;
  const roundContext = archived ? { ...context, ...round, target: round.scores[round.battingFirst].runs + 1 } : context;
  const limits = handInningsLimits(roundContext);
  const roundSummary = archived ? matchSummary(context, selectedRound) : summary;
  const side = selected || (archived ? round.battingFirst : context.batting);
  const innings = roundSummary.sides.find((entry) => entry.side === side);
  const bowling = roundSummary.sides.find((entry) => entry.side !== side);
  const balls = context.history.filter((ball) => ball.batting === side && (ball.superOver || 0) === selectedRound);
  const overStart = Math.floor(Math.max(0, innings.balls - 1) / 6) * 6;
  const thisOver = balls.slice(overStart, overStart + 6);
  const chasing = roundContext.target != null && side !== roundContext.battingFirst;
  const remaining = Math.max(0, limits.balls - innings.balls);
  const needed = chasing ? Math.max(0, roundContext.target - innings.runs) : 0;
  const playerName = (team) => names?.[team] || (team === "you" ? "You" : "Computer");
  const name = (team) => names ? `${playerName(team)} XI` : team === "you" ? "Your XI" : "Computer XI";
  return <section className="broadcast-scorecard" aria-label="Match scorecard">
    <header className="scorecard-masthead"><span>{archived ? "COMPLETED ROUND" : phase === "finished" ? "RESULT" : phase === "superOverBreak" ? "SCORES LEVEL" : phase === "setup" ? "MATCH CENTRE" : "LIVE SCORECARD"}</span><span>{selectedRound ? `SUPER OVER ${selectedRound} / ${limits.balls} BALLS` : `${overs} ${overs === 1 ? "OVER" : "OVERS"}`} / {limits.wickets} {limits.wickets === 1 ? "WICKET" : "WICKETS"}</span>
      {!!context.completedRounds?.length && <select aria-label="Scorecard round" value={selectedRound} onChange={(event) => { setSelectedRound(Number(event.target.value)); setSelected(null); }}>{[...context.completedRounds, { superOver: context.superOver }].map((entry) => <option key={entry.superOver} value={entry.superOver}>{entry.superOver ? `Super Over ${entry.superOver}` : "Match"}</option>)}</select>}
    </header>
    <div className="scorecard-tabs" role="tablist" aria-label="Scorecard innings">
      {roundSummary.sides.map((entry) => <button key={entry.side} id={`${scorecardId}-${entry.side}`} role="tab" aria-controls={`${scorecardId}-innings`} aria-selected={side === entry.side} onClick={() => setSelected(entry.side)} className={`scorecard-team ${entry.side}`}>
        <span><i />{name(entry.side)}{!archived && context.batting === entry.side && phase === "playing" && <small>BATTING</small>}</span>
        <strong>{entry.runs}<small>/{entry.wickets}</small><em>({formatOvers(entry.balls)})</em></strong>
      </button>)}
    </div>
    <div role="tabpanel" id={`${scorecardId}-innings`} aria-labelledby={`${scorecardId}-${side}`}>
      <div className="scorecard-strip"><span>RUN RATE <b>{innings.rate.toFixed(2)}</b></span><span>{chasing ? "TARGET" : "BALLS LEFT"} <b>{chasing ? roundContext.target : remaining}</b></span><span>BOUNDARIES <b>{innings.fours + innings.sixes}</b></span></div>
      <div className="scorecard-table-wrap"><table><caption>{name(side)} innings</caption><thead><tr><th scope="col">Batting</th><th scope="col">R</th><th scope="col">B</th><th scope="col">4s</th><th scope="col">6s</th><th scope="col">SR</th></tr></thead><tbody><tr><th scope="row">{playerName(side)}</th><td><strong>{innings.batRuns}</strong></td><td>{innings.balls}</td><td>{innings.fours}</td><td>{innings.sixes}</td><td>{innings.balls ? (innings.batRuns * 100 / innings.balls).toFixed(1) : "0.0"}</td></tr></tbody></table></div>
      <div className="scorecard-strip"><span>EXTRAS <b>{innings.extras} NB</b></span><span>TOTAL <b>{innings.runs}/{innings.wickets}</b></span></div>
      <div className="scorecard-bowling"><span>{name(bowling.side)} <small>TEAM BOWLING</small></span><strong>{innings.wickets}/{innings.runs}</strong><span>{formatOvers(innings.balls)} ov</span><span>Econ <b>{innings.rate.toFixed(2)}</b></span></div>
      <div className="scorecard-over"><span>{selectedRound ? `SUPER OVER ${selectedRound}` : `OVER ${Math.floor(overStart / 6) + 1}`}</span><div>{Array.from({ length: Math.min(6, limits.balls - overStart) }, (_, index) => { const ball = thisOver[index]; return <span key={index} title={deliveryLabel(ball)} aria-label={ball ? deliveryLabel(ball) : "Not bowled"} className={`ball-token ${ball?.wicket ? "wicket" : [4, 5, 6].includes(ball?.runs) ? "boundary" : ""}`}>{ball ? ball.wicket ? "W" : ball.noBall ? "5nb" : ball.runs : "-"}</span>; })}</div><b>{thisOver.reduce((total, ball) => total + ball.runs, 0)} runs</b></div>
      <div className="scorecard-falls"><span>FALL OF WICKETS</span><p>{innings.falls.length ? innings.falls.map((fall) => `${fall.runs}/${fall.wicket} (${formatOvers(fall.ball)})`).join("  /  ") : "No wickets fallen"}</p></div>
    </div>
    <footer className="scorecard-result" role="status">{archived ? `${selectedRound ? `Super Over ${selectedRound}` : "Match"} tied / ${round.scores.you.runs} runs each` : context.result ? `${context.result.reason === "abandoned" ? "Match abandoned" : context.result.winner === "tie" ? "Match tied" : `${playerName(context.result.winner)} won`} / ${context.result.margin}` : phase === "superOverBreak" ? `Scores level / Super Over ${(context.superOver || 0) + 1} next` : chasing ? `${name(side)} need ${needed} from ${remaining} balls${remaining ? ` / Required rate ${(needed * 6 / remaining).toFixed(2)}` : ""}` : phase === "setup" ? "Toss pending" : `${name(context.battingFirst)} bat first`}</footer>
    {awardVisible && <div className="scorecard-award"><Trophy size={30} /><div><span>{summary.award.length > 1 ? "JOINT MEN OF THE MATCH" : "MAN OF THE MATCH"}</span><h3>{summary.award.map((entry) => playerName(entry.side)).join(" & ")}</h3>{summary.award.map((entry) => <p key={entry.side}>{playerName(entry.side)}: {entry.runs} runs / {entry.wicketsTaken} {entry.wicketsTaken === 1 ? "wicket" : "wickets"} / {entry.points} impact points</p>)}<small>Impact: runs + 25 per wicket. Match winner breaks equal points; tied matches share the award.</small></div></div>}
  </section>;
}