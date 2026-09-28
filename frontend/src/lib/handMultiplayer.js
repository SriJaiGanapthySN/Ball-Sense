import { API_BASE, apiUrl } from "../api.js";

export const ROOM_SESSION_KEY = "ballsense-hand-room-v1";
const validRoomSession = (session) => /^[A-Z2-9]{6}$/.test(session?.code) && typeof session?.token === "string" && session.token.length >= 32;

export function inviteCode(search) {
  const code = new URLSearchParams(search).get("room")?.trim().toUpperCase() || "";
  return /^[A-Z2-9]{6}$/.test(code) ? code : "";
}

export function readRoomSession(storage) {
  try {
    const session = JSON.parse(storage.getItem(ROOM_SESSION_KEY));
    return validRoomSession(session) ? session : null;
  } catch { return null; }
}

export async function readRoomResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (response.ok && !/[/+]json\b/i.test(contentType)) {
    throw new Error("Room requests are not reaching the multiplayer API. Set VITE_API_BASE to your backend URL ending in /api, then rebuild and redeploy the frontend.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.detail === "string" ? data.detail : response.status === 422 ? "Check your name and match settings." : "The multiplayer server is unavailable.");
  if (!validRoomSession(data)) throw new Error("The multiplayer API returned an invalid room. Check VITE_API_BASE and deploy the latest backend.");
  return { code: data.code, token: data.token };
}

export function roomSocketUrl(location, code, base = API_BASE) {
  const url = new URL(apiUrl(`/hand/rooms/${encodeURIComponent(code)}/ws`, base), location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}

export function roomInviteUrl(location, code) {
  const url = new URL(location.href);
  url.searchParams.set("room", code);
  url.hash = "";
  return url.href;
}

export function mergeRoomState(previous, incoming) {
  if (incoming?.type !== "STATE") return previous;
  if (previous && incoming.version < previous.version) return previous;
  if (previous?.matchId === incoming.matchId && previous.turn === incoming.turn) {
    return { ...incoming, context: { ...incoming.context, lastBall: incoming.context.lastBall ? previous.context.lastBall : null, history: previous.context.history } };
  }
  return incoming;
}

export function roomAction(state, type, values = {}) {
  if (!state) return null;
  return { ...values, type, matchId: state.matchId, phase: state.phase, turn: state.turn };
}

export function roomProtocolError(message) {
  return message?.type === "STATE" && !message.toss
    ? "This multiplayer server is out of date. Restart the backend, then leave this room and create a new one."
    : "";
}

export function secondsLeft(deadline, now) {
  return deadline == null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function multiplayerToss(room) {
  const stage = room?.phase === "toss" ? room.toss?.stage || "call" : room?.phase === "ready" ? "complete" : "none";
  const caller = room?.toss?.caller || "computer";
  const callerName = room?.players[caller]?.name || "Away captain";
  const winnerName = room?.players[room?.context.tossWinner]?.name;
  const coinLabel = room?.context.coin === "heads" ? "Heads" : room?.context.coin === "tails" ? "Tails" : "";
  const canCall = stage === "call" && room?.seat === caller;
  const canChoose = room?.phase === "toss" && stage === "complete" && room?.seat === room?.context.tossWinner;
  const headlines = {
    call: canCall ? "Call the toss" : `${callerName} calls the toss`,
    flipping: "Coin in flight", landed: coinLabel,
    result: `${winnerName || "Captain"} wins the toss`,
    handshake: "Captains shake hands",
    complete: canChoose ? "You won the toss" : `${winnerName || "Captain"} chooses`,
  };
  return {
    stage, caller, callerName, winnerName, coinLabel, canCall, canChoose,
    headline: headlines[stage] || "The toss",
    announcement: stage === "call" ? `${callerName} / Away captain` : ["flipping", "landed"].includes(stage) ? `${callerName} called ${room.call}` : `${coinLabel}. ${winnerName || "Captain"} won the toss.`,
    step: stage === "call" ? 0 : ["flipping", "landed"].includes(stage) ? 1 : ["result", "handshake"].includes(stage) ? 2 : 3,
  };
}

export function synchronizedElapsed(startedAt, serverOffset = 0, now = Date.now()) {
  return startedAt == null ? null : Math.max(0, now + serverOffset - startedAt);
}