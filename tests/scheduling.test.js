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

test("high-refresh displays draw the balls on one steady timeline between physics steps", () => {
  for (const hz of [60, 144, 165, 240]) {
    const c = clock();
    // Ball 0 after every physics step; index k = position after k steps.
    const path = [{ x: c.world.balls[0].x, y: c.world.balls[0].y }];
    c.P = { ...P, step(w) { P.step(w); path.push({ x: w.balls[0].x, y: w.balls[0].y }); } };
    const drawn = [];
    c.renderer.drawBalls = (world, now, positions) => drawn.push({ now, ball: positions ? positions[0] : world.balls[0] && { x: world.balls[0].x, y: world.balls[0].y } });
    for (let f = 0; f <= hz * 5; f++) c.frame(f * 1000 / hz);
    // The first frame runs one step, so real time is 1 + t * 60 steps; the
    // balls are drawn half a step behind that, wherever the frame falls.
    let worst = 0;
    for (const { now, ball } of drawn.slice(2)) {
      const s = 0.5 + now * 60 / 1000, k = Math.floor(s), u = s - k;
      const want = { x: path[k].x + (path[k + 1].x - path[k].x) * u, y: path[k].y + (path[k + 1].y - path[k].y) * u };
      worst = Math.max(worst, Math.hypot(ball.x - want.x, ball.y - want.y));
    }
    assert.ok(worst < 1e-6, `${hz} Hz: drawn ball strays ${worst.toFixed(3)} px from the steady timeline`);
  }
});

test("interpolation never changes the simulation", () => {
  const c = clock();
  for (let f = 0; f <= 144 * 20; f++) c.frame(f * 1000 / 144);
  const reference = clock().world;
  for (let i = 0; i < c.world.steps; i++) P.step(reference);
  assert.deepEqual({ balls: c.world.balls, ownership: c.world.ownership, counts: c.world.counts }, { balls: reference.balls, ownership: reference.ownership, counts: reference.counts });
});
