import test from "node:test";
import assert from "node:assert/strict";
import { createActor } from "xstate";
import { BOOKS, BOOK_FLIP_MS, bookCricketMachine, bookFlipFrame, bookSpread, pageOutcome, sampleBookPage } from "./bookCricket.js";

test("every delivery closes completely before reopening and revealing the new page", () => {
  assert.equal(bookFlipFrame(0).openness, 1);
  assert.ok(bookFlipFrame(350).openness > 0 && bookFlipFrame(350).openness < 1);
  for (const time of [700, 800, 850, 999]) {
    assert.equal(bookFlipFrame(time).stage, "closed");
    assert.equal(bookFlipFrame(time).openness, 0);
    assert.equal(bookFlipFrame(time).complete, false);
    assert.equal(bookFlipFrame(time).pageTurn, null);
  }
  assert.equal(bookFlipFrame(849).newPage, false);
  assert.equal(bookFlipFrame(850).newPage, true);
  assert.equal(bookFlipFrame(1000).openness, 0);
  assert.equal(bookFlipFrame(1500).openness, .5);
  assert.equal(bookFlipFrame(2000).openness, 1);
  assert.equal(bookFlipFrame(BOOK_FLIP_MS - 1).complete, false);
  assert.equal(bookFlipFrame(BOOK_FLIP_MS).complete, true);
  assert.deepEqual(bookFlipFrame(-50), bookFlipFrame(0));
  assert.deepEqual(bookFlipFrame(BOOK_FLIP_MS + 50), bookFlipFrame(BOOK_FLIP_MS));
  for (const boundary of [700, 1000, 2000]) assert.ok(Math.abs(bookFlipFrame(boundary - .01).openness - bookFlipFrame(boundary).openness) < .00001);
});

function startMatch(options = {}) {
  const actor = createActor(bookCricketMachine).start();
  actor.send({ type: "START", bookId: "pavilion", mode: "solo", overs: 1, wicketLimit: 1, battingFirst: "you", ...options });
  assert.equal(actor.getSnapshot().value, "playing");
  return actor;
}

function flip(actor, page) {
  actor.send({ type: "OPEN", page });
  actor.send({ type: "REVEAL", flipId: actor.getSnapshot().context.flipId });
}

test("only the units digit scores, with 7/8/9 wrapping to 1/2/3 and only zero out", () => {
  const expectedRuns = [0, 1, 2, 3, 4, 5, 6, 1, 2, 3];
  for (let page = 1; page <= 500; page++) {
    assert.deepEqual(pageOutcome(page), { page, digit: page % 10, runs: expectedRuns[page % 10], wicket: page % 10 === 0 });
  }
  for (const page of [0, -1, 1.5, "126", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => pageOutcome(page), RangeError);
});

test("all three books have 400-500 pages and identical scoring probabilities", () => {
  assert.equal(BOOKS.length, 3);
  assert.equal(new Set(BOOKS.map((book) => book.binding)).size, 3);
  for (const book of BOOKS) {
    assert.ok(book.pages >= 400 && book.pages <= 500);
    const counts = Array(7).fill(0);
    for (let page = 1; page <= book.pages; page++) counts[pageOutcome(page).runs]++;
    assert.deepEqual(counts, [1, 2, 2, 2, 1, 1, 1].map((weight) => weight * book.pages / 10));
  }
});

test("random opening can select every odd and even page including both endpoints", () => {
  for (const book of BOOKS) {
    assert.equal(sampleBookPage(book.pages, () => 0), 1);
    assert.equal(sampleBookPage(book.pages, () => 1 - Number.EPSILON), book.pages);
    for (let page = 1; page <= book.pages; page++) assert.equal(sampleBookPage(book.pages, () => (page - 0.5) / book.pages), page);
  }
  for (const sample of [-0.1, 1, NaN, Infinity]) assert.throws(() => sampleBookPage(420, () => sample), RangeError);
  for (const count of [0, -2, 420.5, "420", Infinity]) assert.throws(() => sampleBookPage(count), RangeError);
});

test("spreads keep even pages on the left, odd pages on the right and endpapers unnumbered", () => {
  assert.deepEqual(bookSpread(1, 420), { left: null, right: 1 });
  assert.deepEqual(bookSpread(127, 420), { left: 126, right: 127 });
  assert.deepEqual(bookSpread(128, 420), { left: 128, right: 129 });
  assert.deepEqual(bookSpread(420, 420), { left: 420, right: null });
  assert.throws(() => bookSpread(421, 420), RangeError);
});

test("flips lock the committed page and score exactly once after a matching reveal", () => {
  const actor = startMatch({ wicketLimit: 3 });
  actor.send({ type: "REVEAL", flipId: 0 });
  for (const page of [0, 421, 10.5, "125", NaN]) actor.send({ type: "OPEN", page });
  assert.equal(actor.getSnapshot().value, "playing");
  actor.send({ type: "OPEN", page: 125 });
  const flipId = actor.getSnapshot().context.flipId;
  actor.send({ type: "OPEN", page: 130 });
  actor.send({ type: "REVEAL", flipId: flipId - 1 });
  assert.equal(actor.getSnapshot().context.scores.you.balls, 0);
  assert.equal(actor.getSnapshot().context.pendingPage, 125);
  actor.send({ type: "REVEAL", flipId });
  actor.send({ type: "REVEAL", flipId });
  assert.deepEqual(actor.getSnapshot().context.scores.you, { runs: 5, wickets: 0, balls: 1 });
  assert.equal(actor.getSnapshot().context.history.length, 1);
  assert.equal(actor.getSnapshot().context.lastBall.page, 125);
  actor.stop();
});

test("the first innings ends on the wicket limit and a chase can finish immediately", () => {
  const actor = startMatch();
  flip(actor, 129);
  flip(actor, 120);
  assert.equal(actor.getSnapshot().value, "inningsBreak");
  assert.equal(actor.getSnapshot().context.target, 4);
  actor.send({ type: "OPEN", page: 106 });
  assert.equal(actor.getSnapshot().context.history.length, 2);
  actor.send({ type: "NEXT_INNINGS" });
  flip(actor, 104);
  const { value, context } = actor.getSnapshot();
  assert.equal(value, "finished");
  assert.deepEqual(context.result, { winner: "opponent", margin: "1 wicket" });
  assert.deepEqual(context.scores.opponent, { runs: 4, wickets: 0, balls: 1 });
  flip(actor, 100);
  assert.equal(actor.getSnapshot().context.history.length, 3);
  actor.stop();
});

test("overs terminate an innings and equal completed scores are a tie for either batting order", () => {
  for (const battingFirst of ["you", "opponent"]) {
    const actor = startMatch({ battingFirst });
    for (let ball = 0; ball < 6; ball++) flip(actor, 118);
    assert.equal(actor.getSnapshot().value, "inningsBreak");
    assert.equal(actor.getSnapshot().context.target, 13);
    actor.send({ type: "NEXT_INNINGS" });
    for (let ball = 0; ball < 6; ball++) flip(actor, 102);
    assert.equal(actor.getSnapshot().value, "finished");
    assert.deepEqual(actor.getSnapshot().context.result, { winner: "tie", margin: "Scores level" });
    actor.stop();
  }
});

test("a defended total reports runs and an all-out zero sets a target of one", () => {
  const actor = startMatch({ battingFirst: "opponent" });
  flip(actor, 106);
  flip(actor, 100);
  actor.send({ type: "NEXT_INNINGS" });
  flip(actor, 103);
  flip(actor, 200);
  assert.deepEqual(actor.getSnapshot().context.result, { winner: "opponent", margin: "3 runs" });
  actor.stop();
  const duck = startMatch();
  flip(duck, 420);
  assert.equal(duck.getSnapshot().context.target, 1);
  duck.send({ type: "NEXT_INNINGS" });
  flip(duck, 417);
  assert.equal(duck.getSnapshot().value, "finished");
  duck.stop();
});

test("reset cancels a pending flip and stale animation callbacks cannot score a new match", () => {
  const actor = startMatch();
  actor.send({ type: "OPEN", page: 100 });
  const staleId = actor.getSnapshot().context.flipId;
  actor.send({ type: "RESET" });
  actor.send({ type: "START", bookId: "atlas", mode: "local", overs: 2, wicketLimit: 3, battingFirst: "you", youName: "  Alex  ", opponentName: "Sam" });
  actor.send({ type: "OPEN", page: 456 });
  actor.send({ type: "REVEAL", flipId: staleId });
  assert.equal(actor.getSnapshot().value, "flipping");
  assert.deepEqual(actor.getSnapshot().context.names, { you: "Alex", opponent: "Sam" });
  actor.send({ type: "REVEAL", flipId: actor.getSnapshot().context.flipId });
  assert.deepEqual(actor.getSnapshot().context.scores.you, { runs: 6, wickets: 0, balls: 1 });
  actor.stop();
});

test("invalid match options are rejected and local player names are bounded", () => {
  for (const invalid of [{ bookId: "missing" }, { mode: "online" }, { overs: 0 }, { wicketLimit: 11 }, { battingFirst: "nobody" }]) {
    const actor = createActor(bookCricketMachine).start();
    actor.send({ type: "START", bookId: "pavilion", mode: "solo", overs: 1, wicketLimit: 1, battingFirst: "you", ...invalid });
    assert.equal(actor.getSnapshot().value, "setup");
    actor.stop();
  }
  const actor = startMatch({ mode: "local", youName: " ", opponentName: "Long name ".repeat(10) });
  assert.equal(actor.getSnapshot().context.names.you, "Player 1");
  assert.equal(actor.getSnapshot().context.names.opponent.length, 24);
  actor.stop();
});