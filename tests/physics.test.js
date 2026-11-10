"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../js/physics.js");
const scenarios = require("./scenarios.js");
const golden = require("./golden/physics.json");
const { runScenario, summarize } = require("./run-scenario.js");
const { runLegacyScenario } = require("./legacy/harness.js");

test("golden file covers every scenario", () => {
  assert.deepEqual(
    golden.map((g) => g.name),
    scenarios.map((s) => s.name)
  );
});

for (const [i, scenario] of scenarios.entries()) {
  test(`matches the pinned golden run: ${scenario.name}`, () => {
    const { world, snapshots } = runScenario(scenario);
    const expected = golden[i];
    assert.equal(world.gridWidth, expected.grid.gridWidth);
    assert.equal(world.gridHeight, expected.grid.gridHeight);
    assert.equal(world.width, expected.grid.frameWidth);
    assert.equal(world.height, expected.grid.frameHeight);
    assert.equal(world.ballRadius, expected.grid.ballRadius);
    assert.equal(world.minSpeed, expected.grid.minSpeed);
    assert.equal(world.maxSpeed, expected.grid.maxSpeed);
    assert.deepEqual(summarize(snapshots), expected.snapshots);
  });

  test(`matches the frozen legacy loop tile-for-tile: ${scenario.name}`, () => {
    const legacy = runLegacyScenario(scenario);
    const current = runScenario(scenario);
    assert.equal(current.snapshots.length, legacy.snapshots.length);
    for (let k = 0; k < legacy.snapshots.length; k++) {
      assert.deepEqual(current.snapshots[k].ownership, legacy.snapshots[k].ownership, `ownership @${legacy.snapshots[k].frame}`);
      assert.deepEqual(current.snapshots[k].balls, legacy.snapshots[k].balls, `balls @${legacy.snapshots[k].frame}`);
    }
  });
}

test("the cinematic scenario actually engages the assist", () => {
  const scenario = scenarios.find((s) => s.initialOwnership);
  const { world } = runScenario({ ...scenario, frames: 60, checkpoints: [] });
  assert.equal(world.cinematic.owner, 1);
  assert.ok(world.cinematic.strength > 0);
});

test("incremental tile counts always match a full recount", () => {
  const world = P.createWorld({
    width: 800, height: 600, tileSize: 20, speedMood: 4, chaos: 0.4,
    cinematicMode: true, rng: P.mulberry32(3)
  });
  for (let i = 0; i < 1500; i++) P.step(world);
  const recount = [0, 0];
  for (const o of world.ownership) recount[o]++;
  assert.deepEqual(world.counts, recount);
  assert.equal(recount[0] + recount[1], world.gridWidth * world.gridHeight);
});

test("balls never leave the board, even at max speed and chaos", () => {
  const world = P.createWorld({
    width: 640, height: 480, tileSize: 16, speedMood: 20, chaos: 0.96,
    cinematicMode: true, rng: P.mulberry32(99)
  });
  for (let i = 0; i < 5000; i++) {
    P.step(world);
    for (const b of world.balls) {
      assert.ok(b.x >= world.ballRadius && b.x <= world.width - world.ballRadius);
      assert.ok(b.y >= world.ballRadius && b.y <= world.height - world.ballRadius);
    }
  }
});

test("board snaps up to whole tiles and starts split down the middle", () => {
  const world = P.createWorld({ width: 1000, height: 700, tileSize: 55, speedMood: 2.75, chaos: 0.27 });
  assert.equal(world.gridWidth, 19);
  assert.equal(world.gridHeight, 13);
  assert.equal(world.width, 19 * 55);
  for (const ball of world.balls) {
    const col = Math.floor(ball.x / world.tileSize);
    const row = Math.floor(ball.y / world.tileSize);
    assert.equal(world.ownership[row * world.gridWidth + col], ball.owner, "ball starts inside its own territory");
  }
});

test("resizing keeps territory proportions and ball positions in bounds", () => {
  const world = P.createWorld({ width: 1200, height: 800, tileSize: 40, speedMood: 3, chaos: 0.3, rng: P.mulberry32(5) });
  for (let i = 0; i < 400; i++) P.step(world);
  const before = world.counts[0] / world.ownership.length;
  P.resizeWorld(world, 600, 400);
  const after = world.counts[0] / world.ownership.length;
  assert.ok(Math.abs(before - after) < 0.06);
  for (const b of world.balls) {
    assert.ok(b.x >= world.ballRadius && b.x <= world.width - world.ballRadius);
  }
  P.resizeWorld(world, 600, 400, { tileSize: 20 });
  assert.equal(world.gridWidth, 30);
  assert.equal(world.counts[0] + world.counts[1], world.ownership.length);
});

test("slider curves match the original", () => {
  assert.equal(P.nonLinearTileSize(55), 55);
  assert.equal(P.nonLinearTileSize(0), 14);
  assert.equal(P.nonLinearTileSize(100), 80);
  assert.equal(P.nonLinearChaos(40), 0.268);
  assert.equal(P.nonLinearChaos(0), 0.06);
});
