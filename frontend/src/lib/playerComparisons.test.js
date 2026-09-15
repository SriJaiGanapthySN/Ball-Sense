import test from "node:test";
import assert from "node:assert/strict";
import { loadNotebook, matchupId, NOTEBOOK_LIMIT, saveMatchup } from "./playerComparisons.js";

const profile = (player) => ({ player, batting: { ODI: { runs: 100 } }, bowling: {} });
const result = (first = "A", second = "B") => ({ player_a: profile(first), player_b: profile(second), ai_summary: "Recorded insight", notice: "Old retry" });
const storage = (value) => ({ getItem: () => JSON.stringify(value) });

test("saved comparisons preserve stats and insight but not transient notices", () => {
  const saved = saveMatchup([], result(), new Date("2026-09-11T12:00:00Z"));
  assert.equal(saved[0].result.player_a.batting.ODI.runs, 100);
  assert.equal(saved[0].result.ai_summary, "Recorded insight");
  assert.equal(saved[0].result.notice, null);
  assert.deepEqual(loadNotebook(storage(saved)), saved);
});

test("saving a reversed matchup replaces its existing snapshot", () => {
  const saved = saveMatchup(saveMatchup([], result()), result("B", "A"));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, matchupId(result()));
  assert.equal(saved[0].result.player_a.player, "B");
});

test("notebook keeps the latest six snapshots", () => {
  let saved = [];
  for (let index = 0; index < 8; index++) saved = saveMatchup(saved, result(`Player ${index}`, "B"));
  assert.equal(saved.length, NOTEBOOK_LIMIT);
  assert.equal(saved[0].result.player_a.player, "Player 7");
});

test("corrupt or unavailable storage cannot break comparison", () => {
  assert.deepEqual(loadNotebook({ getItem: () => "not JSON" }), []);
  assert.deepEqual(loadNotebook({ getItem: () => { throw new Error("Blocked"); } }), []);
  assert.deepEqual(loadNotebook(storage([null, {}, { result: result(), savedAt: "bad" } ])), []);
  assert.deepEqual(loadNotebook(storage({ unexpected: true })), []);
});

test("duplicate and self-comparison snapshots are ignored", () => {
  const saved = saveMatchup([], result());
  assert.equal(loadNotebook(storage([...saved, ...saved])).length, 1);
  assert.deepEqual(loadNotebook(storage(saveMatchup([], result("A", "A")))), []);
});