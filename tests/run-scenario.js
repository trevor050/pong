"use strict";
// Runs a scenario through the refactored simulation (js/physics.js).
const P = require("../js/physics.js");

const DEFAULTS = { tileSizeRaw: 55, speedMood: 2.75, chaosRaw: 40, ballStyle: "glow", cinematicMode: false };

function runScenario(scenario) {
  const s = { ...DEFAULTS, ...(scenario.storage || {}) };
  const tileSize = P.nonLinearTileSize(s.tileSizeRaw);
  const world = P.createWorld({
    width: scenario.width,
    height: scenario.height,
    tileSize,
    speedMood: s.speedMood,
    chaos: P.nonLinearChaos(s.chaosRaw),
    ballStyle: s.ballStyle,
    cinematicMode: s.cinematicMode,
    rng: P.mulberry32(scenario.seed)
  });
  if (scenario.initialOwnership) {
    world.ownership = scenario.initialOwnership(world.gridWidth, world.gridHeight);
    world.counts = [0, 0];
    for (const o of world.ownership) world.counts[o]++;
  }
  const snapshots = [];
  const checkpoints = new Set(scenario.checkpoints);
  for (let frame = 1; frame <= scenario.frames; frame++) {
    P.step(world);
    world.claimed.length = 0;
    if (checkpoints.has(frame)) {
      snapshots.push({
        frame,
        ownership: Array.from(world.ownership),
        balls: world.balls.map((b) => ({ owner: b.owner, x: b.x, y: b.y, vx: b.vx, vy: b.vy }))
      });
    }
  }
  return { world, snapshots };
}

// FNV-1a over the ownership grid, for compact golden files.
function hashOwnership(owners) {
  let h = 0x811c9dc5;
  for (let i = 0; i < owners.length; i++) {
    h ^= owners[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function summarize(snapshots) {
  return snapshots.map((snap) => ({
    frame: snap.frame,
    ownershipHash: hashOwnership(snap.ownership),
    counts: snap.ownership.reduce((acc, o) => ((acc[o] = (acc[o] || 0) + 1), acc), []),
    balls: snap.balls
  }));
}

module.exports = { runScenario, summarize, hashOwnership };
