import training from "./cricketTraining.js";

export { training };
export const DELIVERY_MS = 1400;
export const FOLLOW_THROUGH_MS = 1700;
const normalize = (weights) => weights.map((weight) => weight / weights.reduce((sum, value) => sum + value, 0));

export function opponentPlan(context, batterIndex = 0, bowlerIndex = 0, mode = "adaptive") {
  const score = context.scores[context.batting];
  const fraction = score.balls / (context.overs * 6);
  const phase = fraction < 0.3 ? "powerplay" : fraction >= 0.8 ? "death" : "middle";
  const batter = training.batters[batterIndex] || training.batters[0];
  const bowler = training.bowlers[bowlerIndex] || training.bowlers[0];
  const observed = context.history.filter((ball) => ball.batting === context.batting).slice(-24);
  const counts = Array(6).fill(2);
  observed.forEach((ball, index) => { counts[ball.you - 1] += Math.pow(0.94, observed.length - index - 1); });
  const latest = observed.at(-1)?.you;
  observed.slice(1).forEach((ball, index) => {
    if (observed[index].you === latest) counts[ball.you - 1] += 0.6;
  });
  const prediction = normalize(counts);
  const bowling = bowler.phases[phase] || Object.values(bowler.phases)[0];
  const lengths = Object.entries(bowling).filter(([key]) => key.startsWith("length:"));
  const ballsLeft = Math.max(1, context.overs * 6 - score.balls);
  const needed = context.target == null ? null : Math.max(1, context.target - score.runs);
  const pressure = needed == null ? fraction : Math.min(1.5, needed / ballsLeft / 4);
  let weights;
  let tactic;
  if (context.batting === "you") {
    const strikeRate = bowling.wickets / Math.max(1, bowling.balls);
    weights = prediction.map((chance, index) => chance * (1 + (index + 1) * Math.min(0.18, strikeRate + fraction * 0.1)));
    tactic = observed.length >= 4 ? "Read the pattern" : phase === "death" ? "Protect the boundary" : "Probe the crease";
  } else {
    const outcomes = batter.phases[phase] || Object.values(batter.phases)[0];
    const scoring = normalize(outcomes.slice(1).map((count) => count + 8));
    const wicketsLeft = Math.max(1, context.wicketLimit - score.wickets);
    const survival = 2 + 3 / wicketsLeft;
    weights = scoring.map((chance, index) => {
      const runs = index + 1;
      const reward = needed == null ? runs : Math.min(runs, needed);
      return Math.pow(chance, 0.55) * Math.pow(1 - prediction[index], survival) * Math.pow(reward, 0.5 + pressure);
    });
    tactic = needed != null && needed <= 6 ? "Finish the chase" : wicketsLeft === 1 && pressure < 0.7 ? "Build the innings" : pressure > 0.8 ? "Attack the boundary" : "Rotate and accelerate";
  }
  const fitted = normalize(weights);
  return {
    phase, tactic: mode === "classic" ? "Classic random" : tactic,
    probabilities: mode === "classic" ? Array(6).fill(1 / 6) : fitted.map((chance) => 0.35 / 6 + 0.65 * chance),
    lengths: lengths.length ? lengths.map(([key, count]) => ({ name: key.slice(7), probability: count / lengths.reduce((sum, entry) => sum + entry[1], 0) })) : [{ name: "good length", probability: 1 }],
  };
}

export function sampleOpponent(plan, random = Math.random) {
  const draw = random();
  let cumulative = 0;
  for (let index = 0; index < 6; index++) {
    cumulative += plan.probabilities[index];
    if (draw < cumulative) return index + 1;
  }
  return 6;
}

export function sampleLength(plan, random = Math.random) {
  const draw = random();
  let cumulative = 0;
  return plan.lengths.find((length) => { cumulative += length.probability; return draw < cumulative; })?.name || "good length";
}