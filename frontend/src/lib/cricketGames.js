import { assign, createMachine } from "xstate";
import seedrandom from "seedrandom";
import chaseModel from "./chaseModel.json" with { type: "json" };
import { matchState } from "./liveMatches.js";
import { DISMISSALS, CATCH_POSITIONS } from "./cricketPresentation.js";

const emptyScore = () => ({ runs: 0, wickets: 0, balls: 0 });
export const initialHandContext = () => ({
  overs: 2, wicketLimit: 3, innings: 1, batting: "you", battingFirst: "you",
  scores: { you: emptyScore(), computer: emptyScore() },
  target: null, history: [], lastBall: null, result: null, tossWinner: null, coin: null,
});
const validPick = (value) => Number.isInteger(value) && value >= 1 && value <= 6;
const inningsOver = (context) => context.scores[context.batting].wickets >= context.wicketLimit || context.scores[context.batting].balls >= context.overs * 6;

function scoreDelivery(context, event) {
  const wicket = event.you === event.computer;
  const runs = wicket ? 0 : event[context.batting];
  const previous = context.scores[context.batting];
  const score = { runs: previous.runs + runs, wickets: previous.wickets + Number(wicket), balls: previous.balls + 1 };
  const delivery = { you: event.you, computer: event.computer, runs, wicket, batting: context.batting, ball: score.balls, innings: context.innings, length: event.length || "good length", dismissal: wicket ? DISMISSALS.includes(event.dismissal) ? event.dismissal : "bowled" : null, side: event.side === -1 ? -1 : 1, fielderIndex: Number.isInteger(event.fielderIndex) && CATCH_POSITIONS[event.fielderIndex] && (event.fielderIndex < CATCH_POSITIONS.length - 1 || event.dismissal === "caught") ? event.fielderIndex : 0 };
  delivery.noBall = !wicket && runs === 5;
  delivery.batRuns = delivery.noBall ? 4 : runs;
  delivery.extras = Number(delivery.noBall);
  delivery.overthrow = !wicket && [2, 3].includes(runs) && event.overthrow === true;
  delivery.directHit = !wicket && [1, 2, 3].includes(runs) && !delivery.overthrow && event.directHit === true;
  return { scores: { ...context.scores, [context.batting]: score }, lastBall: delivery, history: [...context.history, delivery] };
}

export const handCricketMachine = createMachine({
  id: "handCricket",
  initial: "setup",
  context: initialHandContext,
  on: { RESET: { target: ".setup", actions: assign(initialHandContext) } },
  states: {
    setup: {
      on: {
        TOSS: {
          guard: ({ event }) => [1, 2, 5].includes(event.overs) && [1, 3, 5].includes(event.wicketLimit) && ["heads", "tails"].includes(event.call) && ["heads", "tails"].includes(event.coin) && ["bat", "bowl"].includes(event.computerDecision),
          target: "toss",
          actions: assign(({ event }) => ({ ...initialHandContext(), overs: event.overs, wicketLimit: event.wicketLimit, coin: event.coin, tossWinner: event.coin === event.call ? "you" : "computer", battingFirst: event.computerDecision === "bat" ? "computer" : "you", batting: event.computerDecision === "bat" ? "computer" : "you" })),
        },
      },
    },
    toss: {
      always: { guard: ({ context }) => context.tossWinner === "computer", target: "ready" },
      on: {
        CHOOSE: {
          guard: ({ event }) => ["bat", "bowl"].includes(event.choice),
          target: "ready",
          actions: assign(({ event }) => ({ battingFirst: event.choice === "bat" ? "you" : "computer", batting: event.choice === "bat" ? "you" : "computer" })),
        },
      },
    },
    ready: { on: { START: "playing" } },
    playing: {
      on: {
        BALL: {
          guard: ({ event }) => validPick(event.you) && validPick(event.computer),
          target: "resolving",
          actions: assign(({ context, event }) => scoreDelivery(context, event)),
        },
      },
    },
    resolving: {
      always: [
        {
          guard: ({ context }) => context.innings === 2 && (context.scores[context.batting].runs >= context.target || inningsOver(context)),
          target: "finished",
          actions: assign(({ context }) => {
            const difference = context.scores.you.runs - context.scores.computer.runs;
            const chased = context.scores[context.batting].runs >= context.target;
            const remainingWickets = context.wicketLimit - context.scores[context.batting].wickets;
            return { result: { winner: difference === 0 ? "tie" : difference > 0 ? "you" : "computer", margin: difference === 0 ? "Scores level" : chased ? `${remainingWickets} wicket${remainingWickets === 1 ? "" : "s"}` : `${Math.abs(difference)} run${Math.abs(difference) === 1 ? "" : "s"}` } };
          }),
        },
        { guard: ({ context }) => inningsOver(context), target: "inningsBreak", actions: assign(({ context }) => ({ target: context.scores[context.batting].runs + 1 })) },
        { target: "playing" },
      ],
    },
    inningsBreak: {
      on: { NEXT_INNINGS: { target: "playing", actions: assign(({ context }) => ({ innings: 2, batting: context.battingFirst === "you" ? "computer" : "you", lastBall: null })) } },
    },
    finished: {},
  },
});

export function formatOvers(balls) {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

export function handMatchInsights(context, playerSide = "you") {
  const score = context.scores[context.batting];
  const ballsLeft = Math.max(0, context.overs * 6 - score.balls);
  const runsNeeded = context.target == null ? null : Math.max(0, context.target - score.runs);
  const requiredRate = runsNeeded == null || !ballsLeft || context.result ? null : runsNeeded * 6 / ballsLeft;
  const boundaries = context.history.filter((ball) => ball.batting === playerSide && [4, 5, 6].includes(ball.runs)).length;
  const wicketsTaken = context.history.filter((ball) => ball.batting !== playerSide && ball.wicket).length;
  let streak = 0;
  let bestStreak = 0;
  for (const ball of context.history.filter((delivery) => delivery.batting === playerSide)) {
    streak = ball.wicket ? 0 : streak + 1;
    bestStreak = Math.max(bestStreak, streak);
  }
  return {
    ballsLeft, runsNeeded, requiredRate, boundaries, wicketsTaken, bestStreak,
    currentRate: score.balls ? score.runs * 6 / score.balls : 0,
    pressure: context.result ? "Full time" : runsNeeded == null ? "Set the target" : runsNeeded > ballsLeft * 6 ? "Out of reach" : ballsLeft <= 6 ? "Final over" : requiredRate >= 18 ? "Pressure on" : "Chase in play",
    chaseProgress: context.target ? Math.min(100, score.runs / context.target * 100) : 0,
    objectives: [
      { label: "Find the rope", detail: "3 boundaries", value: Math.min(boundaries, 3), target: 3 },
      { label: "Break the stand", detail: `${Math.min(context.wicketLimit, 2)} wickets`, value: Math.min(wicketsTaken, 2), target: Math.min(context.wicketLimit, 2) },
      { label: "Close it out", detail: "Win the match", value: Number(context.result?.winner === playerSide), target: 1 },
    ],
  };
}

export function oversToBalls(overs) {
  if (!/^\d+(?:\.[0-5])?$/.test(String(overs))) throw new Error("Overs must use cricket notation, such as 14.2.");
  const [whole, remainder = "0"] = String(overs).split(".");
  return Number(whole) * 6 + Number(remainder);
}

export const SCENARIO_PRESETS = [
  { id: "final-over", title: "The final-over thriller", label: "15 RUNS / 6 BALLS", team: "India", opponent: "Australia", format: "T20", totalOvers: 20, runs: 165, wickets: 5, ballsBowled: 114, target: 180 },
  { id: "rebuild", title: "The middle-order rescue", label: "116 RUNS / 78 BALLS", team: "England", opponent: "South Africa", format: "T20", totalOvers: 20, runs: 45, wickets: 4, ballsBowled: 42, target: 161 },
  { id: "odi-finish", title: "The ODI run chase", label: "44 RUNS / 36 BALLS", team: "New Zealand", opponent: "Pakistan", format: "ODI", totalOvers: 50, runs: 241, wickets: 6, ballsBowled: 264, target: 285 },
];

export function validateScenario(scenario) {
  if (!scenario.team?.trim() || !scenario.opponent?.trim() || scenario.team.trim().toLowerCase() === scenario.opponent.trim().toLowerCase()) return "Choose two different teams.";
  if (!["T20", "ODI"].includes(scenario.format)) return "Choose a limited-overs format.";
  const limits = { totalOvers: [1, scenario.format === "T20" ? 20 : 50], runs: [0, 1000], wickets: [0, 10], ballsBowled: [0, Number(scenario.totalOvers) * 6], target: [1, 1000] };
  for (const [key, [minimum, maximum]] of Object.entries(limits)) {
    if (scenario[key] === "" || scenario[key] == null || !Number.isInteger(Number(scenario[key])) || Number(scenario[key]) < minimum || Number(scenario[key]) > maximum) return `${key.replace(/([A-Z])/g, " $1")} must be a whole number from ${minimum} to ${maximum}.`;
  }
  if (scenario.approach && !["cautious", "balanced", "attacking"].includes(scenario.approach)) return "Unknown batting approach.";
  if (scenario.pitch && !["balanced", "batting", "bowling"].includes(scenario.pitch)) return "Unknown pitch conditions.";
  return null;
}

export const SIMULATION_TRIALS = 10000;
export const CHASE_MODEL_INFO = { trainedThrough: chaseModel.trainedThrough, trainingMatches: chaseModel.trainingMatches, validation: chaseModel.validation };

export function simulateChase(scenario, { trials = SIMULATION_TRIALS, seed = "cricket-ai" } = {}) {
  const error = validateScenario(scenario);
  if (error) throw new Error(error);
  if (!Number.isInteger(trials) || trials < 1 || trials > 10000) throw new Error("Use between 1 and 10,000 simulations.");
  const initialRuns = Number(scenario.runs);
  const initialWickets = Number(scenario.wickets);
  const ballsBowled = Number(scenario.ballsBowled);
  const totalBalls = Number(scenario.totalOvers) * 6;
  const remaining = totalBalls - ballsBowled;
  const target = Number(scenario.target);
  const attack = { cautious: 0.8, balanced: 1, attacking: 1.3 }[scenario.approach || "balanced"];
  const pitch = { batting: 1.13, balanced: 1, bowling: 0.86 }[scenario.pitch || "balanced"];
  const distributions = Object.fromEntries(Object.entries(chaseModel.cells[scenario.format]).map(([phase, cells]) => [phase, cells.map((cell) => {
    const weighted = cell.outcomes.map(([runs, wicket, legal, probability]) => ({ runs, wicket, legal,
      weight: probability * (wicket ? attack ** 1.5 / pitch : (attack * pitch) ** (runs / 3)) }));
    const totalWeight = weighted.reduce((sum, outcome) => sum + outcome.weight, 0);
    let cumulative = 0;
    return weighted.map((outcome) => ({ ...outcome, threshold: cumulative += outcome.weight / totalWeight }));
  })]));
  const timelineSums = Array(remaining + 1).fill(0);
  const finalScores = [];
  let wins = 0;
  let ties = 0;

  for (let trial = 0; trial < trials; trial += 1) {
    const random = seedrandom(`${seed}:${trial}`);
    let runs = initialRuns;
    let wickets = initialWickets;
    timelineSums[0] += runs;
    for (let offset = 1; offset <= remaining; offset += 1) {
      const ballIndex = ballsBowled + offset - 1;
      const phase = ballIndex < (scenario.format === "T20" ? 36 : 60) ? "powerplay" : ballIndex >= (scenario.format === "T20" ? 96 : 240) ? "death" : "middle";
      let attempts = 0;
      while (runs < target && wickets < 10) {
        if (++attempts > 1000) throw new Error("Too many illegal deliveries in a simulated ball.");
        const distribution = distributions[phase][Math.min(2, Math.floor(wickets / 3))];
        const roll = random();
        const outcome = distribution.find((entry) => roll < entry.threshold) || distribution[distribution.length - 1];
        runs += outcome.runs;
        wickets += outcome.wicket;
        if (outcome.legal) break;
      }
      timelineSums[offset] += runs;
    }
    wins += Number(runs >= target);
    ties += Number(runs === target - 1);
    finalScores.push(runs);
  }
  finalScores.sort((first, second) => first - second);
  const probability = wins / trials;
  const denominator = 1 + 1.96 ** 2 / trials;
  const centre = (probability + 1.96 ** 2 / (2 * trials)) / denominator;
  const halfWidth = 1.96 * Math.sqrt(probability * (1 - probability) / trials + 1.96 ** 2 / (4 * trials ** 2)) / denominator;
  return {
    trials, winProbability: wins / trials, tieProbability: ties / trials, lossProbability: (trials - wins - ties) / trials,
    winInterval: [Math.max(0, centre - halfWidth), Math.min(1, centre + halfWidth)], modelVersion: chaseModel.version,
    averageScore: finalScores.reduce((sum, score) => sum + score, 0) / trials,
    lowScore: finalScores[Math.floor((trials - 1) * 0.1)], highScore: finalScores[Math.floor((trials - 1) * 0.9)],
    timeline: timelineSums.map((sum, offset) => ({ ball: ballsBowled + offset, score: Math.round(sum / trials * 10) / 10 })),
  };
}

export function scenarioFromMatch(match) {
  const format = { t20: "T20", t20i: "T20", odi: "ODI" }[match.match_type?.toLowerCase()];
  if (!format || matchState(match) !== "live" || match.score?.length !== 2 || match.teams?.length !== 2 || /dls|d\/l|duckworth|revised|reduced|rain|shortened/i.test(`${match.name} ${match.status}`)) return null;
  const [first, second] = match.score;
  const team = match.teams.find((name) => second.inning?.toLowerCase().startsWith(name.toLowerCase()));
  const opponent = match.teams.find((name) => first.inning?.toLowerCase().startsWith(name.toLowerCase()));
  if (!team || !opponent || first.r == null || second.r == null || second.w == null || second.o == null || !Number.isInteger(Number(first.r)) || Number(first.r) < 0) return null;
  try {
    const scenario = { team, opponent, format, totalOvers: format === "T20" ? 20 : 50, runs: Number(second.r), wickets: Number(second.w), ballsBowled: oversToBalls(second.o), target: Number(first.r) + 1, source: match.name, targetInferred: true };
    if (validateScenario(scenario) || scenario.runs >= scenario.target || scenario.wickets >= 10 || scenario.ballsBowled >= scenario.totalOvers * 6) return null;
    return scenario;
  } catch {
    return null;
  }
}