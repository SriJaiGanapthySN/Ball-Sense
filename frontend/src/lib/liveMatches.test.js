import test from "node:test";
import assert from "node:assert/strict";
import { formatMatchDate, matchState, orderMatches } from "./liveMatches.js";

test("scheduled fixtures and toss announcements are not live or finished", () => {
  assert.equal(matchState({ match_started: false, status: "India won the toss" }), "upcoming");
  assert.equal(matchState({ status: "India won the toss" }), "upcoming");
  assert.equal(matchState({ status: "Match not started" }), "upcoming");
});

test("provider flags and explicit results classify matches", () => {
  assert.equal(matchState({ match_started: true }), "live");
  assert.equal(matchState({ match_started: true, match_ended: true }), "finished");
  for (const status of ["India won by 6 wickets", "Match drawn", "No result", "Match abandoned", "Match tied"]) {
    assert.equal(matchState({ status }), "finished");
  }
  assert.equal(matchState({}), "unknown");
});

test("matches are sorted without mutating the provider response", () => {
  const matches = [{ match_ended: true }, { match_started: false }, { match_started: true }];
  assert.deepEqual(orderMatches(matches).map(matchState), ["live", "upcoming", "finished"]);
  assert.equal(matchState(matches[0]), "finished");
});

test("dates handle missing values and preserve calendar dates", () => {
  assert.equal(formatMatchDate({}), "Time to be confirmed");
  assert.equal(formatMatchDate({ date: "invalid" }), "Time to be confirmed");
  assert.equal(formatMatchDate({ date: "2026-09-10" }), "Sep 10");
});