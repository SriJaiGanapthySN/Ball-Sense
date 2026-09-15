export const DISMISSALS = ["bowled", "caught", "lbw", "runout"];
export const DISMISSAL_LABELS = { bowled: "Bowled", caught: "Caught", lbw: "LBW", runout: "Run out" };
export const FIELD_POSITIONS = [[-9, 8], [12, -2], [-16, -8], [21, 12], [-22, 13], [14, -18], [-6, -21], [23, -9], [-18, 0]];
export const CATCH_POSITIONS = [...FIELD_POSITIONS, [0, 11]];
export const KEEPER_INDEX = FIELD_POSITIONS.length;
export const TEAM_COLORS = { you: "#2476d3", computer: "#efc52b" };
export const FIELDER_SPEED = 4.5;
export const CHEER_STAGE_CENTRES = [[-20, -25], [20, -25]];
export const CEREMONY_ORIGIN = [12, 0, 0];
export const CHEER_MS = 1800;
export const HANDSHAKE_MS = 2000;
export const POST_MATCH_MS = 20000;
export const VICTORY_MS = 13000;
export const TOSS_MS = 2200;
const RUN_START_MS = 500;
const RUN_LEG_MS = 1500;
const DURATIONS = { bowled: 2600, caught: 3800, lbw: 3200, runout: 4200 };
const clamp = (value) => Math.max(0, Math.min(1, value));
const lerp = (start, end, amount) => start.map((value, index) => value + (end[index] - value) * clamp(amount));
const smooth = (value) => { const progress = clamp(value); return progress * progress * (3 - 2 * progress); };

export function shotPlan(runs, side = 1, deliveryNumber = 1) {
  const radius = ({ 1: 10, 2: 18, 3: 25, 4: 34, 5: 34, 6: 36 })[runs] || 10;
  const sector = ["forward", "square", "forward", "backward"][Math.max(0, deliveryNumber - 1) % 4];
  const ranges = { forward: [0.57, 0.94], square: [0.38, 0.55], backward: [0.1, 0.32] };
  const [startAngle, endAngle] = ranges[sector];
  const candidates = Array.from({ length: 18 }, (_, index) => {
    const angle = (startAngle + (index + 0.5) / 18 * (endAngle - startAngle)) * Math.PI;
    const target = [side * Math.sin(angle) * radius, 0.2, Math.cos(angle) * radius * 0.86];
    const distances = FIELD_POSITIONS.map(([positionX, positionZ]) => Math.hypot(target[0] - positionX, target[2] - positionZ));
    const clearance = Math.min(...FIELD_POSITIONS.map(([positionX, positionZ]) => {
      const deltaX = target[0];
      const deltaZ = target[2] - 7;
      const projection = clamp((positionX * deltaX + (positionZ - 7) * deltaZ) / (deltaX ** 2 + deltaZ ** 2));
      return Math.hypot(positionX - projection * deltaX, positionZ - 7 - projection * deltaZ);
    }));
    return { target, sector, chase: [1, 2, 3].includes(runs), clearance, distance: Math.min(...distances), fielderIndex: distances.indexOf(Math.min(...distances)) };
  });
  return candidates.sort((first, second) => (second.clearance + second.distance * 0.6) - (first.clearance + first.distance * 0.6))[0];
}

export function chaseFrame(home, target, elapsedMs) {
  const deltaX = target[0] - home[0];
  const deltaZ = target[2] - home[2];
  const distance = Math.hypot(deltaX, deltaZ);
  const travelled = Math.min(distance, Math.max(0, elapsedMs - 250) / 1000 * FIELDER_SPEED);
  return { position: travelled >= distance ? [...target] : lerp(home, target, distance ? travelled / distance : 1),
    facing: Math.atan2(-deltaX, -deltaZ), moving: travelled > 0 && travelled < distance,
    arrived: travelled >= distance, travelled };
}

export function deliveryShotPlan(delivery) {
  return shotPlan(delivery.overthrow ? 1 : delivery.runs, delivery.side, delivery.ball);
}

export function returnTimeline(delivery, plan = deliveryShotPlan(delivery)) {
  if (delivery.overthrow) {
    const first = returnTimeline({ ...delivery, runs: 1, overthrow: false, directHit: false }, plan);
    const missAt = first.caughtAt;
    const extraStart = missAt + 200;
    const runningEnd = extraStart + (delivery.runs - 1) * RUN_LEG_MS;
    const retrieveAt = missAt + 800 + Math.hypot(4, 6) / FIELDER_SPEED * 1000;
    return { ...first, missAt, extraStart, runningEnd, retrieveAt, caughtAt: Math.max(retrieveAt, runningEnd) + 650 };
  }
  const pickupAt = Math.max(1700, 250 + plan.distance / FIELDER_SPEED * 1000);
  const flightMs = Math.max(900, Math.hypot(plan.target[0], plan.target[2] - 10.5) / 18 * 1000);
  const releaseAt = Math.max(pickupAt + 900, outcomeDuration(delivery) + 180 - flightMs);
  const hitAt = releaseAt + flightMs;
  return { pickupAt, releaseAt, flightMs, hitAt, caughtAt: hitAt + (delivery.directHit ? 450 : 0) };
}

export function deliveryRunningFrame(delivery, elapsedMs, timeline) {
  if (!delivery.overthrow) return runningFrame(delivery.runs, elapsedMs);
  const timing = timeline || returnTimeline(delivery);
  if (elapsedMs < timing.extraStart) return runningFrame(1, elapsedMs);
  return runningFrame(delivery.runs, RUN_START_MS + RUN_LEG_MS + elapsedMs - timing.extraStart);
}

export function deliveryLabel(delivery) {
  if (!delivery) return "";
  if (delivery.wicket) return `${DISMISSAL_LABELS[delivery.dismissal] || "Wicket"}. Wicket!`;
  if (delivery.runs === 5) return "FOUR + NO BALL / 5 RUNS";
  if (delivery.overthrow) return `1 + ${delivery.runs - 1} OVERTHROW${delivery.runs === 3 ? "S" : ""} / ${delivery.runs} RUNS`;
  if (delivery.directHit) return `${delivery.runs} RUN${delivery.runs === 1 ? "" : "S"} / NOT OUT`;
  return `${delivery.runs} run${delivery.runs === 1 ? "" : "s"}`;
}

export function victoryFrame(index, teamIndex, winner, elapsedMs) {
  const won = winner === (teamIndex ? "computer" : "you");
  const tied = winner === "tie";
  const runningTime = Math.min(6500, Math.max(0, elapsedMs));
  const angle = -1.4 + (teamIndex ? 10 - index : index) * 0.18 + smooth(runningTime / 6500);
  const start = won ? [12 + Math.cos(angle) * 10, 0.05, Math.sin(angle) * 14] : [teamIndex ? 24.8 : 6, 0.05, (teamIndex ? 5 - index : index - 5) * 1.6];
  const line = handshakeLineFrame(index, teamIndex, 0).position.map((value, axis) => value + CEREMONY_ORIGIN[axis]);
  const assemble = smooth((elapsedMs - 9000) / 4000);
  const position = assemble === 1 ? [...line] : lerp(start, line, assemble);
  const jumping = won && elapsedMs >= 6500 && elapsedMs < 9000;
  const jumpPhase = clamp((elapsedMs - 6700 - index % 3 * 180) / 650);
  const secondJump = clamp((elapsedMs - 7850 - index % 3 * 180) / 650);
  const jump = jumping ? (Math.sin(jumpPhase * Math.PI) ** 2 + Math.sin(secondJump * Math.PI) ** 2) * 0.38 : 0;
  position[1] += jump;
  const moving = won && elapsedMs < 6500 || assemble > 0 && assemble < 1;
  const restingFacing = index === 0 ? teamIndex ? Math.PI / 2 : -Math.PI / 2 : teamIndex ? Math.PI : 0;
  const travelFacing = Math.atan2(start[0] - line[0], start[2] - line[2]);
  const settle = smooth((elapsedMs - 12400) / 600);
  const cheerFacing = teamIndex ? Math.PI / 2 : -Math.PI / 2;
  const joggingFacing = Math.atan2(Math.sin(angle) * 10, -Math.cos(angle) * 14);
  const turnToCheer = smooth((elapsedMs - 6200) / 700);
  const turnToLine = smooth((elapsedMs - 9000) / 500);
  const approachFacing = cheerFacing + Math.atan2(Math.sin(travelFacing - cheerFacing), Math.cos(travelFacing - cheerFacing)) * turnToLine;
  const facing = assemble > 0 ? approachFacing + Math.atan2(Math.sin(restingFacing - approachFacing), Math.cos(restingFacing - approachFacing)) * settle : won ? joggingFacing + Math.atan2(Math.sin(cheerFacing - joggingFacing), Math.cos(cheerFacing - joggingFacing)) * turnToCheer : cheerFacing;
  return { position, facing, moving, jump, won, sad: !won && !tied && assemble < 1,
    celebration: won ? (elapsedMs < 6500 ? 0.35 : 1) * (1 - assemble) : 0,
    stride: moving ? Math.sin(elapsedMs * 0.011 + index * 0.8) * (assemble > 0 ? Math.sin(assemble * Math.PI) * 0.4 : Math.sin(runningTime / 6500 * Math.PI) * 0.65) : 0,
    stage: elapsedMs < 6500 ? "lap" : elapsedMs < 9000 ? "celebrate" : "assemble" };
}

export function handshakeLineFrame(index, teamIndex, elapsedMs) {
  const beat = Math.max(0, elapsedMs) / 900;
  const round = Math.min(20, Math.floor(beat));
  const fraction = Math.min(1, beat - round);
  const advance = (round + smooth((fraction - 0.38) / 0.62)) * 0.8;
  const partner = round - index;
  return { position: [teamIndex ? 0.55 : -0.55, 0.05, (teamIndex ? -1 : 1) * (index * 1.6 - advance)],
    facing: teamIndex ? Math.PI : 0,
    partner: partner >= 0 && partner < 11 && fraction <= 0.38 ? partner : null,
    walking: fraction > 0.38, beat: fraction };
}

export function awardFrame(elapsedMs) {
  const approach = smooth(elapsedMs / 1600);
  const offer = smooth((elapsedMs - 1600) / 1300);
  const lift = smooth((elapsedMs - 3400) / 1600);
  return { presenterX: 2.3 - approach * 1.78, recipientX: -2.3 + approach * 1.78,
    offer, lift, owner: elapsedMs < 3100 ? "presenter" : "recipient",
    stage: elapsedMs < 1600 ? "approach" : elapsedMs < 3100 ? "handover" : "portrait" };
}

export function samplePresentation(random = Math.random) {
  const dismissal = DISMISSALS[Math.min(3, Math.floor(random() * 4))];
  const side = random() < 0.5 ? -1 : 1;
  const count = dismissal === "caught" ? CATCH_POSITIONS.length : FIELD_POSITIONS.length;
  const fielderIndex = Math.min(count - 1, Math.floor(random() * count));
  const variant = random();
  return { dismissal, side, fielderIndex, overthrow: variant < 0.3, directHit: variant >= 0.3 && variant < 0.55 };
}

export function cheeringTeam(delivery) {
  if (!delivery) return null;
  if (delivery.wicket) return delivery.batting === "you" ? "computer" : "you";
  return [4, 5, 6].includes(delivery.runs) ? delivery.batting : null;
}

export function presentationDuration(delivery) {
  if (delivery && !delivery.wicket && [1, 2, 3].includes(delivery.runs)) return Math.max(outcomeDuration(delivery), returnTimeline(delivery).caughtAt + (delivery.directHit ? 1400 : 350));
  return outcomeDuration(delivery) + (cheeringTeam(delivery) ? CHEER_MS : 0);
}

export function matchSummary(context) {
  const sides = ["you", "computer"].map((side) => {
    const deliveries = context.history.filter((ball) => ball.batting === side);
    const score = context.scores[side];
    let total = 0;
    const falls = [];
    for (const ball of deliveries) {
      total += ball.runs;
      if (ball.wicket) falls.push({ wicket: falls.length + 1, runs: total, ball: ball.ball });
    }
    const wicketsTaken = context.scores[side === "you" ? "computer" : "you"].wickets;
    const extras = deliveries.reduce((total, ball) => total + (ball.extras || 0), 0);
    return { side, ...score, extras, batRuns: score.runs - extras, fours: deliveries.filter((ball) => [4, 5].includes(ball.runs)).length,
      sixes: deliveries.filter((ball) => ball.runs === 6).length, falls, wicketsTaken,
      rate: score.balls ? score.runs * 6 / score.balls : 0,
      points: score.runs + wicketsTaken * 25 };
  });
  const best = Math.max(...sides.map((side) => side.points));
  const leaders = sides.filter((side) => side.points === best);
  const winningLeader = leaders.find((side) => side.side === context.result?.winner);
  return { sides, award: context.result ? winningLeader ? [winningLeader] : leaders : [] };
}

export function tossFrame(progress) {
  const flight = clamp(progress);
  const landing = 0.78;
  const height = flight < landing ? 1.4 * (1 - flight / landing) + Math.sin(flight / landing * Math.PI) * 2.5 : Math.abs(Math.sin((flight - landing) / (1 - landing) * Math.PI * 2)) * (1 - flight) * 0.9;
  return { height: 0.11 + height, spin: flight * Math.PI * 8, landed: flight >= landing };
}

export function outcomeDuration(delivery) {
  return delivery?.wicket ? DURATIONS[delivery.dismissal] || DURATIONS.bowled : delivery?.overthrow ? returnTimeline(delivery).runningEnd : delivery?.runs === 5 ? 3300 : [1, 2, 3].includes(delivery?.runs) ? RUN_START_MS + delivery.runs * RUN_LEG_MS : 1700;
}

export function runningFrame(runs, elapsedMs) {
  const count = [1, 2, 3].includes(runs) ? runs : 0;
  const distance = Math.max(0, Math.min(count, (elapsedMs - RUN_START_MS) / RUN_LEG_MS));
  const leg = Math.min(Math.floor(distance), Math.max(0, count - 1));
  const fraction = count ? distance - leg : 0;
  const crossing = leg % 2 ? 1 - smooth(fraction) : smooth(fraction);
  const moving = elapsedMs > RUN_START_MS && distance < count;
  return {
    batterZ: 7 - crossing * 14, runnerZ: -7 + crossing * 14,
    batterFacing: leg % 2 ? Math.PI : 0, runnerFacing: leg % 2 ? 0 : Math.PI,
    completed: Math.floor(distance), moving,
    stride: moving ? Math.sin(fraction * Math.PI * 10) * Math.sin(Math.PI * fraction) : 0,
  };
}

export function dismissalFrame(kind, progress, side = 1, fielderIndex) {
  const phase = clamp(progress);
  const direction = side === -1 ? -1 : 1;
  const isKeeper = kind === "caught" && fielderIndex === KEEPER_INDEX;
  const position = (kind === "caught" ? CATCH_POSITIONS : FIELD_POSITIONS)[fielderIndex];
  const home = position ? [position[0], 0.05, position[1]] : [direction * 9, 0.05, -2];
  const destination = isKeeper ? [0.35, 0.05, 10.6] : position ? [position[0] * 0.9, 0.05, position[1] * 0.9] : [direction * 7, 0.05, -4];
  const [fieldX, , fieldZ] = destination;
  const frame = {
    ball: [0, 0.65, 7], batter: [0.65, 0.05, 7], runner: [-1.3, 0.05, -7],
    fielder: home, ballVisible: true,
    bails: 0, brokenEnd: null, appeal: 0, signal: 0, celebrate: 0,
    catchReach: 0, throwArm: 0, dive: 0, run: 0, swing: 0,
    camera: [5, 3.8, 16], look: [0, 1.1, 7], shot: "BOWLED / STUMPS",
    stage: "impact", duration: DURATIONS[kind] || DURATIONS.bowled,
  };
  if (kind === "caught") {
    const flight = clamp(phase / 0.6);
    const move = smooth(phase / 0.5);
    frame.fielder = lerp(home, destination, move);
    frame.catchReach = smooth((phase - 0.25) / 0.25) * (1 - smooth((phase - 0.75) / 0.25) * 0.7);
    frame.ball = lerp([0, 0.75, 7], [fieldX, 2.15, fieldZ - 0.4], flight);
    frame.ball[1] += Math.sin(flight * Math.PI) * (isKeeper ? 0.35 : 6);
    frame.swing = Math.sin(clamp(phase / 0.25) * Math.PI);
    frame.celebrate = smooth((phase - 0.67) / 0.2);
    frame.camera = [fieldX + (fieldX < 0 ? -4 : 4), 4.8, fieldZ + 7];
    frame.look = [fieldX, 2.2, fieldZ];
    frame.shot = isKeeper ? "CAUGHT BEHIND / KEEPER" : "CAUGHT / SAFE HANDS";
    frame.stage = phase < 0.6 ? "flight" : "held";
  } else if (kind === "lbw") {
    frame.ball = phase < 0.14 ? lerp([0, 0.65, 7], [0.43, 0.48, 6.85], phase / 0.14) : lerp([0.43, 0.48, 6.85], [1.4, 0.18, 5.8], (phase - 0.14) / 0.28);
    frame.appeal = smooth((phase - 0.2) / 0.15);
    frame.signal = smooth((phase - 0.57) / 0.15);
    frame.celebrate = smooth((phase - 0.78) / 0.18);
    frame.camera = phase < 0.55 ? [4, 2.4, 12] : [5, 3, -17];
    frame.look = phase < 0.55 ? [0.4, 0.8, 7] : [1.3, 1.6, -11];
    frame.shot = phase < 0.55 ? "LBW / PAD IMPACT" : "LBW / UMPIRE DECISION";
    frame.stage = phase < 0.2 ? "impact" : phase < 0.57 ? "appeal" : "decision";
  } else if (kind === "runout") {
    const pickup = [fieldX, 0.22, fieldZ];
    frame.fielder = lerp(home, destination, smooth(phase / 0.3));
    frame.run = clamp((phase - 0.06) / 0.76);
    frame.batter = lerp([0.65, 0.05, 7], [0.65, 0.05, -7.6], frame.run);
    frame.runner = lerp([-1.3, 0.05, -7], [-1.3, 0.05, 7], frame.run);
    frame.swing = Math.sin(clamp(phase / 0.18) * Math.PI);
    frame.throwArm = Math.sin(clamp((phase - 0.32) / 0.22) * Math.PI);
    if (phase < 0.32) frame.ball = lerp([0, 0.25, 7], pickup, phase / 0.32);
    else if (phase < 0.46) frame.ball = lerp(pickup, [fieldX, 2.2, fieldZ], (phase - 0.32) / 0.14);
    else frame.ball = lerp([fieldX, 2.2, fieldZ], [0, 0.75, -8.4], (phase - 0.46) / 0.24);
    frame.brokenEnd = phase >= 0.7 ? 0 : null;
    frame.bails = clamp((phase - 0.7) / 0.22);
    frame.dive = smooth((phase - 0.67) / 0.2);
    frame.signal = smooth((phase - 0.85) / 0.12);
    frame.celebrate = frame.signal;
    frame.camera = phase < 0.48 ? [fieldX + (fieldX < 0 ? -6 : 6), 7, fieldZ + 9] : [-7, 4, -14];
    frame.look = phase < 0.48 ? [fieldX, 1, fieldZ] : [0, 0.9, -7.7];
    frame.shot = phase < 0.48 ? "RUN OUT / PICKUP" : "RUN OUT / DIRECT HIT";
    frame.stage = phase < 0.32 ? "pickup" : phase < 0.7 ? "throw" : "broken";
  } else {
    frame.ball = lerp([0, 0.55, 7], [0, 0.65, 8.4], phase / 0.16);
    frame.brokenEnd = phase >= 0.16 ? 1 : null;
    frame.bails = clamp((phase - 0.16) / 0.35);
    frame.celebrate = smooth((phase - 0.3) / 0.3);
    frame.stage = phase < 0.16 ? "impact" : "broken";
  }
  return frame;
}

export function inCheerStageBay(positionX, positionZ, margin = 0) {
  return CHEER_STAGE_CENTRES.some(([centreX, centreZ]) => Math.abs(positionX - centreX) < 5.5 + margin && Math.abs(positionZ - centreZ) < 5 + margin);
}