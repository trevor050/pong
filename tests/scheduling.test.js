"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../js/physics.js");
const source = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
const frame = source.slice(source.indexOf("  function frame(now)"), source.indexOf("  function startLoop()"));
function clock() {
  const world = P.createWorld({ width: 1280, height: 800, tileSize: 14, speedMood: 2.75, chaos: 0.4, rng: P.mulberry32(981) });
  const c = { world, P, isPlaying: true, lastFrameTime: null, stepDebt: 0, playTime: 0, STEP_MS: 1000 / 60, crossfade: null,
    renderer: { paintTiles() {}, drawBalls() {} }, updateScoreUI() {}, tickShuffle() {}, requestAnimationFrame() { return 1; }, Math };
  vm.createContext(c); vm.runInContext(frame, c); return c;
}

test("refresh rate does not change physics over the same elapsed time", () => {
  let reference;
  for (const hz of [30, 60, 120, 144, 165, 240]) {
    const c = clock();
    for (let f = 0; f <= hz * 30; f++) c.frame(f * 1000 / hz);
    const w = c.world, snapshot = { steps: w.steps, counts: w.counts, balls: w.balls, ownership: w.ownership };
    assert.equal(w.steps, 1801);
    if (reference) assert.deepEqual(snapshot, reference);
    else reference = snapshot;
  }
});

test("a minute of throttled frames stays paused and resumes without catch-up", () => {
  const c = clock();
  for (let f = 0; f <= 15; f++) c.frame(f * 1000 / 60);
  const steps = c.world.steps;
  for (let now = 1250; now <= 61250; now += 1000) c.frame(now);
  assert.equal(c.world.steps, steps, "1 Hz background callbacks must not keep advancing the simulation");
  c.frame(61250 + 1000 / 60);
  assert.equal(c.world.steps, steps + 1);
});
