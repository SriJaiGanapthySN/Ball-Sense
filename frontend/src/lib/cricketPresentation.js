export const DISMISSALS = ["bowled", "caught", "lbw", "runout"];
export const DISMISSAL_LABELS = { bowled: "Bowled", caught: "Caught", lbw: "LBW", runout: "Run out" };
export const FIELD_POSITIONS = [[-9, 8], [12, -2], [-16, -8], [21, 12], [-22, 13], [14, -18], [-6, -21], [23, -9], [-18, 0]];
export const CATCH_POSITIONS = [...FIELD_POSITIONS, [0, 11]];
export const KEEPER_INDEX = FIELD_POSITIONS.length;
export const TEAM_COLORS = { you: "#2476d3", computer: "#efc52b" };
export const FIELDER_SPEED = 4.5;
export const UMPIRE_HOME = [0, 0.05, -11.8];
export const BOWLER_HOME = [1.1, 0.05, -18];
export const BALL_RADIUS = 0.05;
export const UMPIRE_SIGNAL_MS = 1800;
export const CHEER_STAGE_CENTRES = [[-20, -25], [20, -25]];
export const CEREMONY_ORIGIN = [12, 0, 0];
export const CHEER_MS = 1800;
export const RECOVERY_MS = 1800;
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

export function movementFacing(start, end, fallback = 0) {
  return Math.hypot(end[0] - start[0], end[2] - start[2]) > 0.00001 ? Math.atan2(start[0] - end[0], start[2] - end[2]) : fallback;
}

function turnFacing(start, end, progress) {
  return start + Math.atan2(Math.sin(end - start), Math.cos(end - start)) * smooth(progress);
}

export function recoveryFrame(start, home, facing, homeFacing, elapsedMs) {
  const progress = clamp(elapsedMs / RECOVERY_MS);
  const travel = smooth((progress - 0.12) / 0.73);
  const distance = Math.hypot(home[0] - start[0], home[2] - start[2]);
  const heading = movementFacing(start, home, facing);
  const moving = distance > 0.01 && progress > 0.12 && progress < 0.85;
  return {
    position: travel === 1 ? [...home] : lerp(start, home, travel),
    facing: progress < 0.12 ? turnFacing(facing, heading, progress / 0.12) : turnFacing(heading, homeFacing, (progress - 0.85) / 0.15),
    moving, complete: progress === 1,
    stride: moving ? Math.sin(distance * travel * 2.9) * Math.sin(clamp((progress - 0.12) / 0.73) * Math.PI) * 0.65 : 0,
  };
}

export function bowlingFrame(progress, length = "good length") {
  const delivery = clamp(progress);
  const runUp = smooth(delivery / 0.58);
  const flight = clamp((delivery - 0.58) / 0.42);
  const windup = smooth((delivery - 0.34) / 0.24);
  const short = /short|bouncer/.test(length);
  const full = /full|yorker/.test(length);
  const bounce = short ? 0.48 : full ? 0.9 : 0.72;
  const impactHeight = short ? 1.87 : full ? 0.27 : 0.82;
  const height = flight < bounce ? 0.17 + 2.36 * (1 - (flight / bounce) ** 2) : 0.17 + (impactHeight - 0.17) * Math.sin((flight - bounce) / (1 - bounce) * Math.PI / 2);
  return {
    position: [BOWLER_HOME[0] - smooth((runUp - 0.95) / 0.05) * 0.8 + smooth(flight) * 0.5, BOWLER_HOME[1], BOWLER_HOME[2] + runUp * 10.4 + smooth(flight) * 2.1],
    facing: Math.PI, released: delivery >= 0.58, flight,
    arm: -Math.PI * windup - Math.PI * smooth(flight),
    stride: delivery < 0.58 ? Math.sin(runUp * 10.4 * 2.9) * Math.sin(runUp * Math.PI) * 0.8 : Math.sin(flight * Math.PI * 2) * (1 - flight) * 0.4,
    ball: [0, height, -7.6 + flight * 14.6],
  };
}

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
    facing: movementFacing(home, target), moving: travelled > 0 && travelled < distance,
    arrived: travelled >= distance, travelled };
}

export function deliveryShotPlan(delivery) {
  return shotPlan(delivery.overthrow ? 1 : delivery.runs, delivery.side, delivery.ball);
}

export function returnTimeline(delivery, plan = deliveryShotPlan(delivery)) {
  if (delivery.overthrow) {
    const impact = [delivery.overthrowHit ? 0 : (delivery.side === -1 ? -1 : 1) * 1.25, 0.7, 8.4];
    const facing = movementFacing(plan.target, impact);
    const release = [plan.target[0] - 0.24 * Math.cos(facing) - 0.55 * Math.sin(facing), 2.05,
      plan.target[2] + 0.24 * Math.sin(facing) - 0.55 * Math.cos(facing)];
    const distance = Math.hypot(impact[0] - release[0], impact[2] - release[2]);
    const flightMs = Math.max(900, distance / 18 * 1000);
    const flightSeconds = flightMs / 1000;
    const pickupAt = Math.max(1700, 250 + plan.distance / FIELDER_SPEED * 1000);
    const releaseAt = Math.max(pickupAt + 900, RUN_START_MS + RUN_LEG_MS + 180 - flightMs);
    const missAt = releaseAt + flightMs;
    const extraStart = missAt + 200;
    const runningEnd = extraStart + (delivery.runs - 1) * RUN_LEG_MS;
    const angle = Math.atan2(impact[0] - release[0], impact[2] - release[2]) + (delivery.overthrowHit ? (delivery.side === -1 ? -1 : 1) * 0.48 : 0);
    const speed = distance / flightSeconds * (delivery.overthrowHit ? 0.48 : 1);
    const vertical = ((impact[1] - release[1]) / flightSeconds - 4.9 * flightSeconds) * (delivery.overthrowHit ? 0.18 : 1);
    const groundSeconds = (vertical + Math.sqrt(vertical ** 2 + 19.6 * (impact[1] - 0.1))) / 9.8;
    const rollSpeed = speed * 0.65;
    const rollSeconds = rollSpeed / 8.5;
    const bounceSpeed = (9.8 * groundSeconds - vertical) * 0.16;
    const stopSeconds = groundSeconds + Math.max(rollSeconds, bounceSpeed / 4.9);
    const distancePast = speed * groundSeconds + rollSpeed * rollSeconds / 2;
    const loose = [impact[0] + Math.sin(angle) * distancePast, 0.1, impact[2] + Math.cos(angle) * distancePast];
    const retrieveAt = Math.max(missAt + stopSeconds * 1000, missAt + 250 + Math.hypot(loose[0], loose[2] - 11) / FIELDER_SPEED * 1000);
    const path = { release, impact, angle, speed, vertical, groundSeconds, rollSpeed, rollSeconds, bounceSpeed, stopSeconds, loose };
    return { pickupAt, releaseAt, flightMs, hitAt: missAt, missAt, extraStart, runningEnd, retrieveAt, path,
      caughtAt: Math.max(retrieveAt, runningEnd) + 650 };
  }
  const pickupAt = Math.max(1700, 250 + plan.distance / FIELDER_SPEED * 1000);
  const flightMs = Math.max(900, Math.hypot(plan.target[0], plan.target[2] - 10.5) / 18 * 1000);
  const releaseAt = Math.max(pickupAt + 900, outcomeDuration(delivery) + 180 - flightMs);
  const hitAt = releaseAt + flightMs;
  return { pickupAt, releaseAt, flightMs, hitAt, caughtAt: hitAt + (delivery.directHit ? 450 : 0) };
}

export function overthrowFrame(timeline, elapsedMs) {
  const { path } = timeline;
  if (elapsedMs < timeline.hitAt) {
    const flight = clamp((elapsedMs - timeline.releaseAt) / timeline.flightMs);
    const ball = lerp(path.release, path.impact, flight);
    ball[1] += 4.9 * (timeline.flightMs / 1000) ** 2 * flight * (1 - flight);
    return { ball, stopped: false };
  }
  const elapsed = Math.max(0, (elapsedMs - timeline.hitAt) / 1000);
  const falling = Math.min(elapsed, path.groundSeconds);
  const rolling = Math.max(0, elapsed - path.groundSeconds);
  const travel = Math.min(rolling, path.rollSeconds);
  const distance = path.speed * falling + path.rollSpeed * travel - 4.25 * travel ** 2;
  const height = elapsed < path.groundSeconds ? path.impact[1] + path.vertical * elapsed - 4.9 * elapsed ** 2
    : 0.1 + Math.max(0, path.bounceSpeed * rolling - 4.9 * rolling ** 2);
  return { ball: [path.impact[0] + Math.sin(path.angle) * distance, height, path.impact[2] + Math.cos(path.angle) * distance],
    stopped: elapsed >= path.stopSeconds };
}

export function deliveryRunningFrame(delivery, elapsedMs, timeline) {
  if (!delivery.overthrow) return runningFrame(delivery.runs, elapsedMs);
  const timing = timeline || returnTimeline(delivery);
  if (elapsedMs < timing.extraStart) {
    const waiting = runningFrame(1, elapsedMs);
    const turn = smooth((elapsedMs - timing.missAt) / (timing.extraStart - timing.missAt));
    return { ...waiting, batterFacing: turn * Math.PI, runnerFacing: (1 + turn) * Math.PI };
  }
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
  const dismissalRoll = random();
  const dismissal = DISMISSALS[Math.min(3, Math.floor(dismissalRoll * 4))];
  const side = random() < 0.5 ? -1 : 1;
  const count = dismissal === "caught" ? CATCH_POSITIONS.length : FIELD_POSITIONS.length;
  const fielderIndex = Math.min(count - 1, Math.floor(random() * count));
  const variant = random();
  return { dismissal, dismissalRoll, side, fielderIndex, overthrow: variant < 0.3, overthrowHit: variant < 0.1, directHit: variant >= 0.3 && variant < 0.55 };
}

export function dismissalForShot(attemptedRuns, candidate, length = "good length", roll) {
  const eligible = DISMISSALS.filter((kind) => (kind !== "runout" || attemptedRuns <= 3) && (kind !== "lbw" || !/short|bouncer/.test(length)));
  if (Number.isFinite(roll)) return eligible[Math.min(eligible.length - 1, Math.floor(clamp(roll) * eligible.length))];
  return eligible.includes(candidate) ? candidate : eligible[0];
}

export function cheeringTeam(delivery) {
  if (!delivery) return null;
  if (delivery.wicket) return delivery.batting === "you" ? "computer" : "you";
  return [4, 5, 6].includes(delivery.runs) ? delivery.batting : null;
}

export function umpireSignalFrame(delivery, elapsedMs) {
  if (!delivery || delivery.wicket || ![4, 5, 6].includes(delivery.runs)) return { kind: null, amount: 0, sweep: 0 };
  const boundaryAt = outcomeDuration(delivery);
  const noBall = delivery.runs === 5 && elapsedMs < boundaryAt;
  const start = noBall ? 1700 : boundaryAt;
  const end = noBall ? boundaryAt : boundaryAt + UMPIRE_SIGNAL_MS;
  if (elapsedMs < start || elapsedMs >= end) return { kind: null, amount: 0, sweep: 0 };
  return { kind: noBall ? "no-ball" : delivery.runs === 6 ? "six" : "four",
    amount: smooth((elapsedMs - start) / 300) * (1 - smooth((elapsedMs - end + 300) / 300)),
    sweep: 0.3 + (1 - Math.cos(Math.max(0, elapsedMs - start - 300) * Math.PI / 500)) * 1.1 };
}

export function presentationDuration(delivery) {
  if (delivery && !delivery.wicket && [1, 2, 3].includes(delivery.runs)) return Math.max(outcomeDuration(delivery), returnTimeline(delivery).caughtAt + (delivery.directHit ? 1400 : 350)) + RECOVERY_MS;
  return outcomeDuration(delivery) + (!delivery?.wicket && [4, 5, 6].includes(delivery?.runs) ? UMPIRE_SIGNAL_MS : 0) + (cheeringTeam(delivery) ? CHEER_MS : 0) + (delivery ? RECOVERY_MS : 0);
}

export function matchSummary(context, superOver = context.superOver || 0) {
  const summarize = (scores, history) => ["you", "computer"].map((side) => {
    const deliveries = history.filter((ball) => ball.batting === side);
    const score = scores[side];
    let total = 0;
    const falls = [];
    for (const ball of deliveries) {
      total += ball.runs;
      if (ball.wicket) falls.push({ wicket: falls.length + 1, runs: total, ball: ball.ball });
    }
    const wicketsTaken = scores[side === "you" ? "computer" : "you"].wickets;
    const extras = deliveries.reduce((total, ball) => total + (ball.extras || 0), 0);
    return { side, ...score, extras, batRuns: score.runs - extras, fours: deliveries.filter((ball) => [4, 5].includes(ball.runs)).length,
      sixes: deliveries.filter((ball) => ball.runs === 6).length, falls, wicketsTaken,
      rate: score.balls ? score.runs * 6 / score.balls : 0,
      points: score.runs + wicketsTaken * 25 };
  });
  const rounds = context.completedRounds || [];
  const round = rounds.find((entry) => entry.superOver === superOver);
  const sides = summarize(round?.scores || context.scores, context.history.filter((ball) => (ball.superOver || 0) === superOver));
  const totalScores = Object.fromEntries(["you", "computer"].map((side) => [side,
    Object.fromEntries(["runs", "wickets", "balls"].map((stat) => [stat, context.scores[side][stat] + rounds.reduce((total, entry) => total + entry.scores[side][stat], 0)])),
  ]));
  const totals = rounds.length ? summarize(totalScores, context.history) : sides;
  const best = Math.max(...totals.map((side) => side.points));
  const leaders = totals.filter((side) => side.points === best);
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
  const travel = clamp(fraction / 0.82);
  const crossing = leg % 2 ? 1 - smooth(travel) : smooth(travel);
  const moving = elapsedMs > RUN_START_MS && distance < count && travel > 0 && travel < 1;
  const turn = leg < count - 1 ? smooth((fraction - 0.82) / 0.18) : 0;
  const facing = (leg % 2 ? 1 - turn : turn) * Math.PI;
  return {
    batterZ: 7 - crossing * 14, runnerZ: -7 + crossing * 14,
    batterFacing: facing, runnerFacing: facing + Math.PI,
    completed: count ? leg + (travel === 1 ? 1 : 0) : 0, moving,
    stride: moving ? Math.sin(travel * Math.PI * 10) * Math.sin(Math.PI * travel) : 0,
  };
}

export function dismissalFrame(kind, progress, side = 1, fielderIndex, length = "good length") {
  const phase = clamp(progress);
  const impact = bowlingFrame(1, length).ball;
  const direction = side === -1 ? -1 : 1;
  const isKeeper = kind === "caught" && fielderIndex === KEEPER_INDEX;
  const position = (kind === "caught" ? CATCH_POSITIONS : FIELD_POSITIONS)[fielderIndex];
  const home = position ? [position[0], 0.05, position[1]] : [direction * 9, 0.05, -2];
  const destination = isKeeper ? [0.35, 0.05, 10.6] : position ? [position[0] * 0.9, 0.05, position[1] * 0.9] : [direction * 7, 0.05, -4];
  const [fieldX, , fieldZ] = destination;
  const frame = {
    ball: [0, 0.65, 7], batter: [0.65, 0.05, 7], runner: [-1.3, 0.05, -7],
    fielder: home, fielderFacing: movementFacing(home, destination), ballVisible: true,
    bails: 0, brokenEnd: null, appeal: 0, signal: 0, celebrate: 0,
    catchReach: 0, throwArm: 0, dive: 0, run: 0, swing: 0,
    camera: [5, 3.8, 16], look: [0, 1.1, 7], shot: "BOWLED / STUMPS",
    stage: "impact", duration: DURATIONS[kind] || DURATIONS.bowled,
  };
  if (kind === "caught") {
    const flight = clamp(phase / 0.6);
    const move = smooth(phase / 0.5);
    frame.fielder = lerp(home, destination, move);
    const catchingFacing = movementFacing(destination, [0, 0.05, 7]);
    frame.fielderFacing = turnFacing(frame.fielderFacing, catchingFacing, (phase - 0.5) / 0.1);
    frame.catchReach = smooth((phase - 0.25) / 0.25) * (1 - smooth((phase - 0.75) / 0.25) * 0.7);
    frame.ball = lerp(impact, [fieldX - Math.sin(catchingFacing) * 0.4, 2.15, fieldZ - Math.cos(catchingFacing) * 0.4], flight);
    frame.ball[1] += Math.sin(flight * Math.PI) * (isKeeper ? 0.35 : 6);
    frame.swing = Math.sin(clamp(phase / 0.25) * Math.PI);
    frame.celebrate = smooth((phase - 0.67) / 0.2);
    frame.camera = [fieldX + (fieldX < 0 ? -4 : 4), 4.8, fieldZ + 7];
    frame.look = [fieldX, 2.2, fieldZ];
    frame.shot = isKeeper ? "CAUGHT BEHIND / KEEPER" : "CAUGHT / SAFE HANDS";
    frame.stage = phase < 0.6 ? "flight" : "held";
  } else if (kind === "lbw") {
    frame.ball = phase < 0.14 ? lerp(impact, [0.43, 0.48, 6.85], phase / 0.14) : lerp([0.43, 0.48, 6.85], [1.4, 0.18, 5.8], (phase - 0.14) / 0.28);
    frame.appeal = smooth((phase - 0.2) / 0.15);
    frame.signal = smooth((phase - 0.57) / 0.15);
    frame.celebrate = smooth((phase - 0.78) / 0.18);
    frame.camera = phase < 0.55 ? [4, 2.4, 12] : [2.2, 2.7, -5.9];
    frame.look = phase < 0.55 ? [0.4, 0.8, 7] : [UMPIRE_HOME[0], 1.6, UMPIRE_HOME[2]];
    frame.shot = phase < 0.55 ? "LBW / PAD IMPACT" : "LBW / UMPIRE DECISION";
    frame.stage = phase < 0.2 ? "impact" : phase < 0.57 ? "appeal" : "decision";
  } else if (kind === "runout") {
    const pickup = [fieldX, 0.22, fieldZ];
    frame.fielder = lerp(home, destination, smooth(phase / 0.3));
    frame.fielderFacing = turnFacing(frame.fielderFacing, movementFacing(destination, [0, 0.05, -8.4]), (phase - 0.3) / 0.12);
    frame.run = clamp((phase - 0.06) / 0.76);
    frame.batter = lerp([0.65, 0.05, 7], [0.65, 0.05, -7.6], frame.run);
    frame.runner = lerp([-1.3, 0.05, -7], [-1.3, 0.05, 7], frame.run);
    frame.swing = Math.sin(clamp(phase / 0.18) * Math.PI);
    frame.throwArm = Math.sin(clamp((phase - 0.32) / 0.22) * Math.PI);
    if (phase < 0.32) frame.ball = lerp(impact, pickup, phase / 0.32);
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
    const choppedOn = /short|bouncer/.test(length);
    frame.ball = phase < 0.16 ? lerp(impact, [0, 0.65, 8.4], phase / 0.16) : lerp([0, 0.65, 8.4], [direction * 0.8, 0.1, 9.3], (phase - 0.16) / 0.2);
    frame.swing = choppedOn ? Math.sin(clamp(phase / 0.16) * Math.PI) : 0;
    frame.shot = choppedOn ? "BOWLED / INSIDE EDGE" : "BOWLED / STUMPS";
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