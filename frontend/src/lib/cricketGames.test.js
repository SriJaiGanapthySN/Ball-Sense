import test from "node:test";
import assert from "node:assert/strict";
import { createActor } from "xstate";
import seedrandom from "seedrandom";
import chaseModel from "./chaseModel.json" with { type: "json" };
import { returnTimeline, victoryFrame, VICTORY_MS, deliveryRunningFrame } from "./cricketPresentation.js";
import { DISMISSALS, FIELD_POSITIONS, CATCH_POSITIONS, KEEPER_INDEX, CHEER_MS, TEAM_COLORS, FIELDER_SPEED, CHEER_STAGE_CENTRES, CEREMONY_ORIGIN, inCheerStageBay, shotPlan, chaseFrame, handshakeLineFrame, awardFrame, cheeringTeam, presentationDuration, matchSummary, tossFrame, dismissalFrame, outcomeDuration, runningFrame, samplePresentation } from "./cricketPresentation.js";
import { opponentPlan, sampleOpponent, training } from "./cricketOpponent.js";
import { formatOvers, handCricketMachine, handMatchInsights, oversToBalls, SCENARIO_PRESETS, scenarioFromMatch, simulateChase, validateScenario } from "./cricketGames.js";

function startGame({ overs = 1, wicketLimit = 1, choice = "bat" } = {}) {
  const actor = createActor(handCricketMachine).start();
  actor.send({ type: "TOSS", call: "heads", coin: "heads", computerDecision: "bat", overs, wicketLimit });
  assert.equal(actor.getSnapshot().value, "toss");
  actor.send({ type: "CHOOSE", choice });
  actor.send({ type: "START" });
  return actor;
}

test("keeper receives running scores only after the final crossing and before unlock", () => {
  for (const runs of [1, 2, 3]) for (const side of [-1, 1]) for (let ball = 1; ball <= 4; ball++) {
    const delivery = { runs, side, ball, batting: "you" };
    const timing = returnTimeline(delivery);
    assert.ok(timing.releaseAt >= timing.pickupAt + 900);
    assert.ok(timing.flightMs >= 900);
    assert.equal(runningFrame(runs, timing.caughtAt).completed, runs);
    assert.equal(runningFrame(runs, timing.caughtAt).moving, false);
    assert.ok(presentationDuration(delivery) >= timing.caughtAt + 350);
  }
});

test("five is four plus a counted no-ball without a free hit", () => {
  const actor = startGame({ wicketLimit: 3 });
  actor.send({ type: "BALL", you: 5, computer: 1, overthrow: true, directHit: true });
  let context = actor.getSnapshot().context;
  assert.deepEqual(context.scores.you, { runs: 5, wickets: 0, balls: 1 });
  assert.equal(context.lastBall.batRuns, 4);
  assert.equal(context.lastBall.extras, 1);
  assert.equal(context.lastBall.noBall, true);
  assert.equal(context.lastBall.overthrow, false);
  assert.equal(context.lastBall.directHit, false);
  assert.equal(matchSummary(context).sides[0].fours, 1);
  assert.equal(matchSummary(context).sides[0].batRuns, 4);
  assert.equal(matchSummary(context).sides[0].extras, 1);
  assert.equal(handMatchInsights(context).boundaries, 1);
  assert.equal(shotPlan(5).chase, false);
  assert.equal(runningFrame(5, 10000).completed, 0);
  actor.send({ type: "BALL", you: 5, computer: 5 });
  context = actor.getSnapshot().context;
  assert.deepEqual(context.scores.you, { runs: 5, wickets: 1, balls: 2 });
  assert.equal(context.lastBall.noBall, false);
  actor.stop();
});

test("overthrows resume only after a missed throw and direct hits occur after safe crossings", () => {
  for (const runs of [2, 3]) for (const side of [-1, 1]) for (let ball = 1; ball <= 4; ball++) {
    const delivery = { runs, side, ball, overthrow: true };
    const timing = returnTimeline(delivery);
    assert.equal(deliveryRunningFrame(delivery, timing.missAt, timing).completed, 1);
    assert.equal(deliveryRunningFrame(delivery, timing.missAt, timing).moving, false);
    assert.equal(deliveryRunningFrame(delivery, timing.extraStart + 500, timing).moving, true);
    assert.equal(deliveryRunningFrame(delivery, timing.runningEnd, timing).completed, runs);
    assert.ok(timing.caughtAt > timing.runningEnd);
    const safe = { runs, side, ball, directHit: true };
    const hit = returnTimeline(safe);
    assert.equal(runningFrame(runs, hit.hitAt).completed, runs);
    assert.ok(presentationDuration(safe) >= hit.caughtAt + 1400);
  }
});

test("six no-ball boundaries consume the over for either batting side", () => {
  for (const choice of ["bat", "bowl"]) {
    const actor = startGame({ choice });
    const side = actor.getSnapshot().context.batting;
    for (let ball = 0; ball < 6; ball++) actor.send({ type: "BALL", you: side === "you" ? 5 : 1, computer: side === "computer" ? 5 : 1 });
    const { context, value } = actor.getSnapshot();
    assert.equal(value, "inningsBreak");
    assert.deepEqual(context.scores[side], { runs: 30, wickets: 0, balls: 6 });
    const summary = matchSummary(context).sides.find((innings) => innings.side === side);
    assert.equal(summary.extras, 6);
    assert.equal(summary.batRuns, 24);
    assert.equal(summary.fours, 6);
    actor.stop();
  }
});

test("precommitted fielding variants are occasional and never change the score", () => {
  const random = seedrandom("fielding-variants");
  const counts = { overthrow: 0, directHit: 0, ordinary: 0 };
  const actor = startGame({ overs: 5, wicketLimit: 5 });
  for (let index = 0; index < 1000; index++) {
    const sampled = samplePresentation(random);
    assert.ok(!(sampled.overthrow && sampled.directHit));
    counts[sampled.overthrow ? "overthrow" : sampled.directHit ? "directHit" : "ordinary"]++;
  }
  assert.ok(Object.values(counts).every((count) => count > 150 && count < 550));
  for (const runs of [2, 3]) {
    actor.send({ type: "BALL", you: runs, computer: 6, overthrow: true, directHit: true });
    assert.equal(actor.getSnapshot().context.lastBall.overthrow, true);
    assert.equal(actor.getSnapshot().context.lastBall.directHit, false);
    assert.equal(actor.getSnapshot().context.lastBall.runs, runs);
  }
  actor.stop();
});

test("victory poses respect either winner, ties and continuous handshake assembly", () => {
  for (const winner of ["you", "computer", "tie"]) for (let team = 0; team < 2; team++) for (let index = 0; index < 11; index++) {
    const frame = victoryFrame(index, team, winner, 7200);
    assert.equal(frame.won, winner === (team ? "computer" : "you"));
    assert.equal(frame.sad, winner !== "tie" && !frame.won);
    assert.ok(frame.position.every(Number.isFinite));
    assert.ok(frame.position[1] >= 0.05);
    assert.deepEqual(victoryFrame(index, team, winner, VICTORY_MS).position,
      handshakeLineFrame(index, team, 0).position.map((value, axis) => value + CEREMONY_ORIGIN[axis]));
  }
});

test("both squads keep body clearance throughout the celebration and queue assembly", () => {
  for (const winner of ["you", "computer", "tie"]) for (let time = 0; time <= VICTORY_MS; time += 50) {
    const players = Array.from({ length: 22 }, (_, index) => victoryFrame(index % 11, Math.floor(index / 11), winner, time).position);
    for (let first = 0; first < players.length; first++) for (let second = first + 1; second < players.length; second++) {
      const distance = Math.hypot(players[first][0] - players[second][0], players[first][2] - players[second][2]);
      assert.ok(distance >= 1.09, `${winner} at ${time}: players ${first}/${second}, gap ${distance}`);
    }
  }
});

test("20,000 seeded presentation cases preserve scoring and coherent dismissal timelines", () => {
  const random = seedrandom("dismissal-coverage-20000");
  const counts = Object.fromEntries(DISMISSALS.map((kind) => [kind, 0]));
  const fielderCounts = CATCH_POSITIONS.map(() => 0);
  const actor = startGame({ overs: 5, wicketLimit: 5 });
  for (let scenario = 0; scenario < 20000; scenario++) {
    const presentation = samplePresentation(random);
    counts[presentation.dismissal]++;
    fielderCounts[presentation.fielderIndex]++;
    const progress = random();
    const frame = dismissalFrame(presentation.dismissal, progress, presentation.side, presentation.fielderIndex);
    for (const key of ["ball", "batter", "runner", "fielder", "camera", "look"]) assert.ok(frame[key].every(Number.isFinite));
    assert.ok(frame.bails >= 0 && frame.bails <= 1);
    if (["caught", "lbw"].includes(presentation.dismissal)) assert.equal(frame.brokenEnd, null);
    if (presentation.dismissal === "runout" && progress < 0.7) assert.equal(frame.brokenEnd, null);
    if (presentation.dismissal === "bowled" && progress < 0.16) assert.equal(frame.brokenEnd, null);
    assert.deepEqual(frame, dismissalFrame(presentation.dismissal, progress, presentation.side, presentation.fielderIndex));
    if (actor.getSnapshot().value !== "playing") {
      actor.send({ type: "RESET" });
      actor.send({ type: "TOSS", call: "heads", coin: "heads", computerDecision: "bat", overs: 5, wicketLimit: 5 });
      actor.send({ type: "CHOOSE", choice: scenario % 2 ? "bowl" : "bat" });
      actor.send({ type: "START" });
    }
    const you = 1 + Math.floor(random() * 6);
    const computer = scenario % 2 ? you : you % 6 + 1;
    actor.send({ type: "BALL", you, computer, ...presentation });
    const ball = actor.getSnapshot().context.lastBall;
    assert.equal(ball.wicket, you === computer);
    assert.equal(ball.runs, ball.wicket ? 0 : ball.batting === "you" ? you : computer);
    assert.equal(ball.dismissal, ball.wicket ? presentation.dismissal : null);
    assert.equal(ball.fielderIndex, presentation.fielderIndex);
    assert.equal(outcomeDuration(ball), ball.wicket ? frame.duration : ball.overthrow ? returnTimeline(ball).runningEnd : ball.runs === 5 ? 3300 : [1, 2, 3].includes(ball.runs) ? 500 + ball.runs * 1500 : 1700);
  }
  actor.stop();
  for (const count of fielderCounts.slice(0, KEEPER_INDEX)) assert.ok(count > 1800 && count < 2500, `Fielder sample count: ${count}`);
  assert.ok(fielderCounts[KEEPER_INDEX] > 350 && fielderCounts[KEEPER_INDEX] < 650);
  for (const kind of DISMISSALS) {
    assert.ok(counts[kind] > 4500 && counts[kind] < 5500, `${kind}: ${counts[kind]}`);
    assert.deepEqual(dismissalFrame(kind, -1), dismissalFrame(kind, 0));
    assert.deepEqual(dismissalFrame(kind, 2), dismissalFrame(kind, 1));
  }
});

test("trained profiles contain real international samples and complete probabilities", () => {
  assert.ok(training.rows > 100000);
  assert.ok(training.matches > 1000);
  for (const choice of ["bat", "bowl"]) {
    const actor = startGame({ choice });
    for (let profile = 0; profile < training.batters.length; profile++) {
      const plan = opponentPlan(actor.getSnapshot().context, profile, profile);
      assert.ok(Math.abs(plan.probabilities.reduce((sum, value) => sum + value, 0) - 1) < 1e-10);
      assert.ok(plan.probabilities.every((value) => value >= 0.35 / 6 && value < 0.71));
      assert.equal(sampleOpponent(plan, () => 0), 1);
      assert.equal(sampleOpponent(plan, () => 0.9999999), 6);
    }
    actor.stop();
  }
});

test("bowling learns completed repeated hands, with a random escape chance", () => {
  const actor = startGame({ overs: 5, wicketLimit: 5 });
  const before = opponentPlan(actor.getSnapshot().context).probabilities[5];
  for (let delivery = 0; delivery < 12; delivery++) actor.send({ type: "BALL", you: 6, computer: 1 });
  const context = actor.getSnapshot().context;
  const plan = opponentPlan(context);
  assert.ok(plan.probabilities[5] > before + 0.15);
  assert.deepEqual(opponentPlan({ ...context, selected: 1 }), opponentPlan({ ...context, selected: 6 }));
  assert.deepEqual(opponentPlan(context, 0, 0, "classic").probabilities, Array(6).fill(1 / 6));
  actor.send({ type: "RESET" });
  assert.ok(opponentPlan(actor.getSnapshot().context).probabilities[5] < plan.probabilities[5]);
  actor.stop();
});

test("batting avoids repeated bowling hands and reacts to phase and target", () => {
  const actor = startGame({ choice: "bowl", overs: 5, wicketLimit: 5 });
  const before = opponentPlan(actor.getSnapshot().context).probabilities[5];
  for (let delivery = 0; delivery < 12; delivery++) actor.send({ type: "BALL", you: 6, computer: 1 });
  const context = actor.getSnapshot().context;
  assert.ok(opponentPlan(context).probabilities[5] < before);
  assert.equal(opponentPlan(context).phase, "middle");
  const finish = opponentPlan({ ...context, target: context.scores.computer.runs + 1 });
  assert.equal(finish.tactic, "Finish the chase");
  assert.notDeepEqual(finish.probabilities, opponentPlan(context).probabilities);
  actor.stop();
});

test("matching hands take a wicket and switch innings only after confirmation", () => {
  const actor = startGame();
  actor.send({ type: "BALL", you: 6, computer: 2 });
  actor.send({ type: "BALL", you: 3, computer: 3 });
  let state = actor.getSnapshot();
  assert.equal(state.value, "inningsBreak");
  assert.deepEqual(state.context.scores.you, { runs: 6, wickets: 1, balls: 2 });
  assert.equal(state.context.target, 7);
  actor.send({ type: "BALL", you: 1, computer: 6 });
  assert.equal(actor.getSnapshot().context.history.length, 2);
  actor.send({ type: "NEXT_INNINGS" });
  state = actor.getSnapshot();
  assert.equal(state.context.batting, "computer");
  assert.equal(state.context.innings, 2);
  actor.stop();
});

test("a chase stops immediately when the target is reached", () => {
  const actor = startGame({ choice: "bowl" });
  actor.send({ type: "BALL", you: 4, computer: 1 });
  actor.send({ type: "BALL", you: 2, computer: 2 });
  actor.send({ type: "NEXT_INNINGS" });
  actor.send({ type: "BALL", you: 6, computer: 1 });
  assert.equal(actor.getSnapshot().value, "finished");
  assert.deepEqual(actor.getSnapshot().context.result, { winner: "you", margin: "1 wicket" });
  actor.send({ type: "BALL", you: 6, computer: 1 });
  assert.equal(actor.getSnapshot().context.scores.you.runs, 6);
  actor.stop();
});

test("all-out equal scores are a tie and a new match resets everything", () => {
  const actor = startGame();
  actor.send({ type: "BALL", you: 1, computer: 1 });
  actor.send({ type: "NEXT_INNINGS" });
  actor.send({ type: "BALL", you: 3, computer: 3 });
  assert.equal(actor.getSnapshot().context.result.winner, "tie");
  actor.send({ type: "RESET" });
  assert.equal(actor.getSnapshot().value, "setup");
  assert.equal(actor.getSnapshot().context.history.length, 0);
  actor.stop();
});

test("over limits end each innings and invalid picks are ignored", () => {
  const actor = startGame({ wicketLimit: 3 });
  actor.send({ type: "BALL", you: 0, computer: 6 });
  actor.send({ type: "BALL", you: 3.5, computer: 6 });
  assert.equal(actor.getSnapshot().context.history.length, 0);
  for (let ball = 0; ball < 6; ball += 1) actor.send({ type: "BALL", you: 6, computer: 1 });
  assert.equal(actor.getSnapshot().value, "inningsBreak");
  actor.send({ type: "NEXT_INNINGS" });
  for (let ball = 0; ball < 6; ball += 1) actor.send({ type: "BALL", you: 6, computer: 1 });
  assert.deepEqual(actor.getSnapshot().context.result, { winner: "you", margin: "30 runs" });
  actor.stop();
});

test("computer toss choice selects the correct batting side", () => {
  const actor = createActor(handCricketMachine).start();
  actor.send({ type: "TOSS", call: "tails", coin: "heads", computerDecision: "bowl", overs: 2, wicketLimit: 3 });
  assert.equal(actor.getSnapshot().value, "ready");
  assert.equal(actor.getSnapshot().context.tossWinner, "computer");
  assert.equal(actor.getSnapshot().context.battingFirst, "you");
  actor.stop();
});

test("cricket overs use six legal balls, not decimal fractions", () => {
  assert.equal(oversToBalls("14.2"), 86);
  assert.equal(formatOvers(119), "19.5");
  for (const value of ["14.6", "14.10", "-1", "", null]) assert.throws(() => oversToBalls(value));
});

test("seeded simulations are reproducible and probabilities sum to one", () => {
  const options = { trials: 300, seed: "test" };
  const first = simulateChase(SCENARIO_PRESETS[0], options);
  assert.deepEqual(first, simulateChase(SCENARIO_PRESETS[0], options));
  assert.ok(Math.abs(first.winProbability + first.tieProbability + first.lossProbability - 1) < 1e-10);
  assert.equal(first.timeline.length, 7);
  assert.equal(first.timeline[0].score, 165);
});

test("empirical chase cells normalize and outperform old weights on held-out deliveries", () => {
  for (const format of ["T20", "ODI"]) {
    const validation = chaseModel.validation[format];
    assert.ok(validation.deliveries > 10000);
    assert.ok(validation.modelLogLoss < validation.oldLogLoss);
    for (const cells of Object.values(chaseModel.cells[format])) for (const cell of cells) {
      assert.ok(cell.samples > 0);
      assert.ok(Math.abs(cell.outcomes.reduce((sum, entry) => sum + entry[3], 0) - 1) < 1e-10);
      assert.ok(cell.outcomes.some((entry) => entry[2] === 0));
      assert.ok(cell.outcomes.every(([runs, wicket, legal, probability]) => runs >= 0 && [0, 1].includes(wicket) && [0, 1].includes(legal) && probability > 0));
    }
  }
});

test("sampling intervals contain the estimate and shrink with more trials", () => {
  const small = simulateChase(SCENARIO_PRESETS[0], { trials: 100 });
  const large = simulateChase(SCENARIO_PRESETS[0], { trials: 10000 });
  for (const result of [small, large]) {
    assert.ok(result.winInterval[0] <= result.winProbability);
    assert.ok(result.winInterval[1] >= result.winProbability);
  }
  assert.ok(large.winInterval[1] - large.winInterval[0] < small.winInterval[1] - small.winInterval[0]);
});

test("extra runs cannot reduce chase probability with matched random trials", () => {
  const baseline = simulateChase(SCENARIO_PRESETS[0], { trials: 500 });
  const alternative = simulateChase({ ...SCENARIO_PRESETS[0], runs: 171 }, { trials: 500 });
  assert.ok(alternative.winProbability >= baseline.winProbability);
});

test("illegal extras do not consume the final legal ball", () => {
  const cell = chaseModel.cells.T20.death[1];
  const original = cell.outcomes;
  try {
    cell.outcomes = [[1, 0, 0, 0.5], [0, 0, 1, 0.5]];
    const seed = "extras-clock";
    const random = seedrandom(`${seed}:0`);
    let extras = 0;
    while (random() < 0.5) extras += 1;
    const result = simulateChase({ ...SCENARIO_PRESETS[0], ballsBowled: 119, target: 1000 }, { trials: 1, seed });
    assert.equal(result.averageScore, 165 + extras);
    assert.equal(result.timeline.length, 2);
    assert.equal(result.timeline[1].ball, 120);
    const sample = simulateChase({ ...SCENARIO_PRESETS[0], ballsBowled: 119, target: 1000 }, { trials: 2000, seed });
    assert.ok(sample.averageScore > 165.8 && sample.averageScore < 166.2);
  } finally {
    cell.outcomes = original;
  }
});

test("a wicket switches the next delivery to the new wickets-lost bucket", () => {
  const cells = chaseModel.cells.T20.death;
  const original = cells.map((cell) => cell.outcomes);
  try {
    cells[1].outcomes = [[0, 1, 1, 1]];
    cells[2].outcomes = [[4, 0, 1, 1]];
    const result = simulateChase({ ...SCENARIO_PRESETS[0], ballsBowled: 118 }, { trials: 1 });
    assert.deepEqual(result.timeline.map((point) => point.score), [165, 165, 169]);
  } finally {
    cells.forEach((cell, index) => { cell.outcomes = original[index]; });
  }
});

test("won, all-out, tied, and very unlikely chases have correct terminal outcomes", () => {
  const base = { ...SCENARIO_PRESETS[0] };
  assert.equal(simulateChase({ ...base, runs: 180 }, { trials: 10 }).winProbability, 1);
  assert.equal(simulateChase({ ...base, wickets: 10 }, { trials: 10 }).lossProbability, 1);
  assert.equal(simulateChase({ ...base, runs: 179, ballsBowled: 120 }, { trials: 10 }).tieProbability, 1);
  assert.equal(simulateChase({ ...base, target: 220 }, { trials: 100 }).winProbability, 0);
});

test("invalid scenarios fail explicitly", () => {
  for (const changes of [{ ballsBowled: 121 }, { wickets: 11 }, { target: 0 }, { runs: "" }, { totalOvers: 0 }, { runs: -1 }, { team: "Australia" }, { format: "Test" }]) {
    assert.ok(validateScenario({ ...SCENARIO_PRESETS[0], ...changes }));
    assert.throws(() => simulateChase({ ...SCENARIO_PRESETS[0], ...changes }));
  }
  assert.throws(() => simulateChase(SCENARIO_PRESETS[0], { trials: 10001 }));
});

test("only unambiguous live limited-overs chases can seed a scenario", () => {
  const match = { name: "India vs Australia", match_type: "t20", match_started: true, teams: ["India", "Australia"], score: [{ inning: "India Inning 1", r: 180, w: 6, o: 20 }, { inning: "Australia Inning 1", r: 120, w: 3, o: 14.2 }] };
  const scenario = scenarioFromMatch(match);
  assert.equal(scenario.team, "Australia");
  assert.equal(scenario.target, 181);
  assert.equal(scenario.ballsBowled, 86);
  assert.equal(scenario.targetInferred, true);
  for (const changes of [{ match_type: "test" }, { match_ended: true }, { status: "Revised DLS target" }, { score: match.score.slice(0, 1) }, { score: [...match.score, match.score[0]] }]) assert.equal(scenarioFromMatch({ ...match, ...changes }), null);
});

test("arena objectives reflect only the user's batting and bowling", () => {
  const actor = startGame({ wicketLimit: 3 });
  for (const value of [4, 6, 5, 4]) actor.send({ type: "BALL", you: value, computer: 1 });
  actor.send({ type: "BALL", you: 2, computer: 2 });
  const stats = handMatchInsights(actor.getSnapshot().context);
  assert.equal(stats.boundaries, 4);
  assert.equal(stats.wicketsTaken, 0);
  assert.equal(stats.bestStreak, 4);
  assert.equal(stats.objectives[0].value, 3);
  assert.equal(stats.requiredRate, null);
  actor.send({ type: "RESET" });
  assert.equal(handMatchInsights(actor.getSnapshot().context).boundaries, 0);
  actor.stop();
});

test("arena chase pressure is arithmetic, with no fabricated win probability", () => {
  const actor = startGame({ wicketLimit: 3 });
  for (let ball = 0; ball < 6; ball++) actor.send({ type: "BALL", you: 6, computer: 1 });
  actor.send({ type: "NEXT_INNINGS" });
  const stats = handMatchInsights(actor.getSnapshot().context);
  assert.equal(stats.runsNeeded, 37);
  assert.equal(stats.ballsLeft, 6);
  assert.equal(stats.requiredRate, 37);
  assert.equal(stats.pressure, "Out of reach");
  assert.equal(stats.chaseProgress, 0);
  actor.stop();
});

test("arena results and one-wicket objectives remain attainable", () => {
  const actor = startGame();
  actor.send({ type: "BALL", you: 6, computer: 1 });
  actor.send({ type: "BALL", you: 2, computer: 2 });
  actor.send({ type: "NEXT_INNINGS" });
  actor.send({ type: "BALL", you: 3, computer: 3 });
  const stats = handMatchInsights(actor.getSnapshot().context);
  assert.equal(stats.requiredRate, null);
  assert.equal(stats.pressure, "Full time");
  assert.deepEqual(stats.objectives.map((objective) => [objective.value, objective.target]), [[1, 3], [1, 1], [1, 1]]);
  actor.stop();
});

test("dismissal contact moments and replay frames are stable at their endpoints", () => {
  const catchFrame = dismissalFrame("caught", 0.6, -1);
  assert.deepEqual(catchFrame.fielder, [-7, 0.05, -4]);
  assert.ok(Math.abs(catchFrame.ball[0] + 7) < 1e-8);
  assert.equal(catchFrame.stage, "held");
  assert.equal(dismissalFrame("caught", 1).ballVisible, true);
  assert.equal(dismissalFrame("runout", 0.699).brokenEnd, null);
  assert.equal(dismissalFrame("runout", 0.7).brokenEnd, 0);
  assert.equal(dismissalFrame("bowled", 0.16).brokenEnd, 1);
  assert.equal(dismissalFrame("lbw", 0.5).signal, 0);
  assert.equal(dismissalFrame("lbw", 1).signal, 1);
  assert.equal(dismissalFrame("lbw", 1).bails, 0);
});

test("batters complete exactly 1, 2, or 3 crossings and turn at each crease", () => {
  for (const runs of [1, 2, 3]) {
    assert.equal(runningFrame(runs, 0).batterZ, 7);
    for (let completed = 1; completed <= runs; completed++) {
      const frame = runningFrame(runs, 500 + completed * 1500);
      assert.equal(frame.completed, completed);
      assert.equal(frame.batterZ, completed % 2 ? -7 : 7);
      assert.equal(frame.runnerZ, -frame.batterZ);
    }
    const end = runningFrame(runs, outcomeDuration({ runs }));
    assert.equal(end.moving, false);
    assert.deepEqual(end, runningFrame(runs, 100000));
  }
  assert.equal(runningFrame(4, 5000).completed, 0);
  assert.equal(runningFrame(6, 5000).completed, 0);
});

test("all fielders are selectable and own their catch or runout paths", () => {
  const selected = new Set();
  FIELD_POSITIONS.forEach((position, index) => {
    const values = [0.9, 0.1, (index + 0.1) / FIELD_POSITIONS.length];
    const choice = samplePresentation(() => values.shift());
    selected.add(choice.fielderIndex);
    for (const kind of ["caught", "runout"]) {
      const start = dismissalFrame(kind, 0, 1, index);
      assert.deepEqual(start.fielder, [position[0], 0.05, position[1]]);
      const end = dismissalFrame(kind, 1, 1, index);
      assert.deepEqual(end.fielder, [position[0] * 0.9, 0.05, position[1] * 0.9]);
      const contact = dismissalFrame(kind, kind === "caught" ? 0.6 : 0.32, 1, index);
      assert.ok(Math.abs(contact.ball[0] - end.fielder[0]) < 1e-8);
    }
  });
  assert.equal(selected.size, FIELD_POSITIONS.length);
});

test("keeper catches are sampled, retained by scoring and stay behind the stumps", () => {
  const values = [0.3, 0.2, 0.99];
  const presentation = samplePresentation(() => values.shift());
  assert.equal(presentation.fielderIndex, KEEPER_INDEX);
  const actor = startGame();
  actor.send({ type: "BALL", you: 2, computer: 2, ...presentation });
  assert.equal(actor.getSnapshot().context.lastBall.fielderIndex, KEEPER_INDEX);
  for (const progress of [0, 0.3, 0.6, 1]) {
    const frame = dismissalFrame("caught", progress, 1, KEEPER_INDEX);
    assert.ok(frame.fielder[2] >= 10.6);
    assert.ok(frame.ball[1] < 3);
    assert.equal(frame.brokenEnd, null);
    assert.match(frame.shot, /KEEPER/);
  }
  actor.stop();
});

test("cheers follow the scoring team or wicket-taking team after the outcome", () => {
  for (const batting of ["you", "computer"]) {
    for (const runs of [1, 2, 3, 4, 5, 6]) {
      const ball = { batting, runs, wicket: false };
      assert.equal(cheeringTeam(ball), [4, 5, 6].includes(runs) ? batting : null);
      assert.equal(presentationDuration(ball), [4, 5, 6].includes(runs) ? outcomeDuration(ball) + CHEER_MS : returnTimeline(ball).caughtAt + 350);
    }
    const ball = { batting, wicket: true, dismissal: "caught" };
    assert.equal(cheeringTeam(ball), batting === "you" ? "computer" : "you");
    assert.equal(presentationDuration(ball), outcomeDuration(ball) + CHEER_MS);
  }
});

test("coin lands flat on the ground and scorecard awards use actual match totals", () => {
  assert.equal(tossFrame(1).height, 0.11);
  assert.equal(tossFrame(1).landed, true);
  assert.ok(tossFrame(0.4).height > tossFrame(0).height);
  const actor = startGame({ wicketLimit: 1 });
  actor.send({ type: "BALL", you: 4, computer: 1 });
  actor.send({ type: "BALL", you: 2, computer: 2 });
  actor.send({ type: "NEXT_INNINGS" });
  actor.send({ type: "BALL", you: 3, computer: 3 });
  const summary = matchSummary(actor.getSnapshot().context);
  assert.equal(summary.sides[0].fours, 1);
  assert.deepEqual(summary.sides[0].falls, [{ wicket: 1, runs: 4, ball: 2 }]);
  assert.equal(summary.sides[0].rate, 12);
  assert.equal(summary.award[0].side, "you");
  assert.equal(summary.award[0].points, 29);
  const tied = { ...actor.getSnapshot().context, scores: { you: { runs: 0, balls: 1, wickets: 1 }, computer: { runs: 0, balls: 1, wickets: 1 } }, history: [], result: { winner: "tie" } };
  assert.equal(matchSummary(tied).award.length, 2);
  assert.equal(matchSummary({ ...tied, result: null }).award.length, 0);
  actor.stop();
});

test("gap shots use a fixed fielder speed and face the direction of travel", () => {
  assert.deepEqual(TEAM_COLORS, { you: "#2476d3", computer: "#efc52b" });
  for (const runs of [1, 2, 3, 4, 5, 6]) for (const side of [-1, 1]) {
    const plan = shotPlan(runs, side);
    assert.ok(plan.clearance > 1.5);
    const [positionX, positionZ] = FIELD_POSITIONS[plan.fielderIndex];
    const home = [positionX, 0.05, positionZ];
    const start = chaseFrame(home, plan.target, 300);
    const next = chaseFrame(home, plan.target, 400);
    assert.ok(Math.abs(next.travelled - start.travelled - FIELDER_SPEED * 0.1) < 1e-8);
    const movement = [next.position[0] - start.position[0], next.position[2] - start.position[2]];
    assert.ok(-Math.sin(next.facing) * movement[0] - Math.cos(next.facing) * movement[1] > 0);
    assert.deepEqual(chaseFrame(home, plan.target, 100000).position, plan.target);
  }
});

test("opposing handshake queues meet every opponent without overlapping teammates", () => {
  const contacts = new Set();
  for (let round = 0; round <= 20; round++) {
    for (let index = 0; index < 11; index++) {
      const frame = handshakeLineFrame(index, 0, round * 900 + 100);
      if (frame.partner !== null) {
        const partner = handshakeLineFrame(frame.partner, 1, round * 900 + 100);
        assert.ok(Math.abs(frame.position[2] - partner.position[2]) < 1e-8);
        contacts.add(`${index}:${frame.partner}`);
      }
      if (index < 10) assert.ok(Math.abs(frame.position[2] - handshakeLineFrame(index + 1, 0, round * 900 + 100).position[2]) > 1.5);
    }
  }
  assert.equal(contacts.size, 121);
  assert.equal(awardFrame(0).owner, "presenter");
  assert.equal(awardFrame(2500).stage, "handover");
  assert.equal(awardFrame(6000).owner, "recipient");
  assert.equal(awardFrame(6000).lift, 1);
});

test("high scores use forward, square and backward gaps without boundary chases", () => {
  for (const runs of [3, 4, 5, 6]) for (const side of [-1, 1]) {
    const shots = Array.from({ length: 12 }, (_, index) => shotPlan(runs, side, index + 1));
    assert.equal(shots.filter((shot) => shot.sector === "forward").length, 6);
    assert.ok(shots.filter((shot) => shot.sector === "forward").every((shot) => shot.target[2] < 0));
    assert.ok(shots.filter((shot) => shot.sector === "backward").every((shot) => shot.target[2] > 7));
    assert.equal(new Set(shots.map((shot) => shot.sector)).size, 3);
    assert.ok(shots.every((shot) => shot.chase === (runs === 3)));
  }
  for (const runs of [1, 2]) assert.equal(shotPlan(runs).chase, true);
});

test("stage bays reserve clear ground and ceremonies remain away from the pitch", () => {
  for (const [positionX, positionZ] of CHEER_STAGE_CENTRES) {
    for (const offsetX of [-3.7, 0, 3.7]) for (const offsetZ of [-1.8, 0, 2.4]) {
      assert.equal(inCheerStageBay(positionX + offsetX, positionZ + offsetZ), true);
    }
  }
  for (const team of [0, 1]) for (let index = 0; index < 11; index++) {
    const frame = handshakeLineFrame(index, team, 9500);
    assert.ok(frame.position[0] + CEREMONY_ORIGIN[0] > 10);
  }
  for (const elapsed of [0, 1600, 3000, 6000]) {
    const frame = awardFrame(elapsed);
    assert.ok(frame.presenterX + CEREMONY_ORIGIN[0] > 9);
    assert.ok(frame.recipientX + CEREMONY_ORIGIN[0] > 9);
  }
});