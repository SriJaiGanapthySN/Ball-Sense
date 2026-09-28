import test from "node:test";
import assert from "node:assert/strict";
import { apiUrl } from "../api.js";
import { inviteCode, mergeRoomState, multiplayerToss, readRoomResponse, readRoomSession, roomAction, roomInviteUrl, roomProtocolError, roomSocketUrl, secondsLeft, synchronizedElapsed } from "./handMultiplayer.js";
import { handMatchInsights, initialHandContext } from "./cricketGames.js";

test("invites open only valid rooms and use secure same-origin sockets", () => {
  assert.equal(inviteCode("?room=abc234"), "ABC234");
  assert.equal(inviteCode("?room=<script>"), "");
  const location = new URL("https://cricket.example/?other=1#old");
  assert.equal(roomSocketUrl(location, "ABC234"), "wss://cricket.example/api/hand/rooms/ABC234/ws");
  assert.equal(roomInviteUrl(location, "ABC234"), "https://cricket.example/?other=1&room=ABC234");
  assert.equal(roomSocketUrl(new URL("http://localhost:5173/"), "ABC234"), "ws://localhost:5173/api/hand/rooms/ABC234/ws");
});

test("split deployments use the configured backend for room HTTP and WebSocket requests", () => {
  const frontend = new URL("https://ballsense-frontend.onrender.com/");
  const backend = "https://ball-sense.onrender.com/api";
  assert.equal(apiUrl("/hand/rooms", backend), `${backend}/hand/rooms`);
  assert.equal(apiUrl("/hand/rooms/ABC234/join", `${backend}/`), `${backend}/hand/rooms/ABC234/join`);
  assert.equal(apiUrl("/hand/rooms"), "/api/hand/rooms");
  assert.equal(roomSocketUrl(frontend, "ABC234", `${backend}/`), "wss://ball-sense.onrender.com/api/hand/rooms/ABC234/ws");
  assert.equal(roomSocketUrl(frontend, "ABC234", "/services/api/"), "wss://ballsense-frontend.onrender.com/services/api/hand/rooms/ABC234/ws");
  assert.equal(roomSocketUrl(frontend, "ABC234", "http://localhost:8010/api"), "ws://localhost:8010/api/hand/rooms/ABC234/ws");
  assert.equal(roomInviteUrl(frontend, "ABC234"), "https://ballsense-frontend.onrender.com/?room=ABC234");
});

test("room responses reject static-site fallbacks with deployment guidance", async () => {
  await assert.rejects(readRoomResponse(new Response("<!doctype html><html></html>", { headers: { "content-type": "text/html" } })), /VITE_API_BASE.*\/api.*rebuild and redeploy/);
  const session = { code: "ABC234", token: "test-session".repeat(4) };
  assert.deepEqual(await readRoomResponse(Response.json({ ...session, extra: "ignored" }, { status: 201 })), session);
  for (const payload of [null, {}, { ...session, code: "wrong" }, { ...session, token: "short" }, { ...session, token: 123 }]) {
    await assert.rejects(readRoomResponse(Response.json(payload)), /invalid room/);
  }
  await assert.rejects(readRoomResponse(new Response("broken JSON", { headers: { "content-type": "application/json" } })), /invalid room/);
});

test("room responses preserve backend validation and availability errors", async () => {
  await assert.rejects(readRoomResponse(Response.json({ detail: "This room already has two players." }, { status: 409 })), /already has two players/);
  await assert.rejects(readRoomResponse(Response.json({ detail: [] }, { status: 422 })), /Check your name/);
  await assert.rejects(readRoomResponse(new Response("Service unavailable", { status: 503 })), /server is unavailable/);
});

test("room session parsing tolerates blocked or corrupted storage", () => {
  assert.equal(readRoomSession({ getItem: () => "invalid" }), null);
  assert.equal(readRoomSession({ getItem: () => { throw new Error("blocked"); } }), null);
  assert.equal(readRoomSession({ getItem: () => JSON.stringify({ code: "ABC234", token: "short" }) }), null);
  const session = { code: "ABC234", token: "private".repeat(8) };
  assert.deepEqual(readRoomSession({ getItem: () => JSON.stringify(session) }), session);
});

test("presence changes preserve delivery identity and stale states cannot rewind a match", () => {
  const first = { type: "STATE", matchId: "match", turn: 1, version: 4, context: { lastBall: { runs: 6 }, history: [{ runs: 6 }] } };
  const next = mergeRoomState(first, { ...first, version: 5, context: structuredClone(first.context) });
  assert.equal(next.context.lastBall, first.context.lastBall);
  assert.equal(next.context.history, first.context.history);
  assert.equal(mergeRoomState(next, first), next);
  const delivery = { ...first, version: 6, turn: 2, context: { lastBall: { runs: 4 }, history: [] } };
  assert.equal(mergeRoomState(next, delivery), delivery);
  const inningsChange = mergeRoomState(next, { ...next, version: 6, context: { ...next.context, lastBall: null, innings: 2 } });
  assert.equal(inningsChange.context.lastBall, null);
});

test("match insights use the guest's actual team without changing solo defaults", () => {
  const context = { ...initialHandContext(), history: [{ batting: "computer", runs: 6, wicket: false }, { batting: "you", runs: 0, wicket: true }], result: { winner: "computer" } };
  const guest = handMatchInsights(context, "computer");
  assert.equal(guest.boundaries, 1);
  assert.equal(guest.wicketsTaken, 1);
  assert.equal(guest.objectives[2].value, 1);
  assert.equal(handMatchInsights(context).boundaries, 0);
});

test("actions identify the match phase and ball without trusting submitted identity or score", () => {
  const state = { matchId: "match", phase: "playing", turn: 3 };
  assert.deepEqual(roomAction(state, "PICK", { pick: 6 }), { type: "PICK", matchId: "match", phase: "playing", turn: 3, pick: 6 });
  assert.equal(roomAction(null, "READY"), null);
  assert.equal(secondsLeft(11000, 9500), 2);
  assert.equal(secondsLeft(11000, 12000), 0);
  assert.equal(secondsLeft(null, 12000), null);
});

test("away captain alone gets call controls and the winner waits for the handshake", () => {
  const room = { phase: "toss", seat: "you", toss: { stage: "call", caller: "computer" }, players: { you: { name: "Home captain" }, computer: { name: "Visiting captain" } }, context: initialHandContext() };
  assert.equal(multiplayerToss(room).canCall, false);
  assert.equal(multiplayerToss({ ...room, seat: "computer" }).canCall, true);
  assert.equal(multiplayerToss(room).headline, "Visiting captain calls the toss");
  room.context = { ...room.context, coin: "tails", tossWinner: "you" };
  for (const stage of ["flipping", "landed", "result", "handshake"]) {
    room.toss.stage = stage;
    assert.equal(multiplayerToss(room).canChoose, false);
  }
  room.toss.stage = "complete";
  assert.equal(multiplayerToss(room).canChoose, true);
  assert.equal(multiplayerToss({ ...room, seat: "computer" }).canChoose, false);
  assert.equal(multiplayerToss({ ...room, phase: "ready" }).canChoose, false);
  assert.equal(multiplayerToss(null).stage, "none");
});

test("toss animation timestamps survive reconnect and compensate for clock offset", () => {
  assert.equal(synchronizedElapsed(10000, 500, 10600), 1100);
  assert.equal(synchronizedElapsed(10000, -200, 11000), 800);
  assert.equal(synchronizedElapsed(10000, 0, 9000), 0);
  assert.equal(synchronizedElapsed(null, 0, 11000), null);
});

test("outdated backends report an actionable error instead of offering unsupported toss calls", () => {
  const oldState = { type: "STATE", phase: "toss", context: { coin: "heads", tossWinner: "you" } };
  assert.match(roomProtocolError(oldState), /out of date.*Restart the backend/);
  assert.match(roomProtocolError({ ...oldState, phase: "lobby" }), /out of date/);
  assert.equal(roomProtocolError({ ...oldState, toss: { stage: "call", caller: "computer" } }), "");
  assert.equal(roomProtocolError({ type: "PONG" }), "");
  assert.equal(roomProtocolError(null), "");
});