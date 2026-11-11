"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../js/render.js");

function fixture() {
  const pixels = new Map();
  const ctx = new Proxy({
    fillRect(x, y, w, h) { for (let xx = x; xx < x + w; xx++) pixels.set(`${xx},${y}`, this.fillStyle); },
    createRadialGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; }
  }, { get: (o, k) => k in o ? o[k] : () => {} });
  const canvas = () => ({ style: {}, getContext: () => ctx });
  const renderer = R.createRenderer(canvas(), canvas());
  const world = { gridWidth: 2, gridHeight: 1, width: 2, height: 1, tileSize: 1, ownership: [0, 1] };
  renderer.setTheme(["#ffffff", "#000000"], "#ffffff");
  renderer.resize(world, 1, 0);
  return { renderer, world, pixels };
}

for (const kind of ["ownership", "palette"]) test(`rapid ${kind} reversals cannot create more than three flashes per second`, () => {
  const { renderer, world, pixels } = fixture();
  const changes = [];
  let previous = pixels.get("0,0");
  for (let now = 1; now <= 3000; now += 6) {
    const odd = Math.floor(now / 6) % 2;
    if (kind === "ownership") { world.ownership = [odd, 1 - odd]; renderer.paintTiles(world, [0, 1], now); }
    else { renderer.setTheme(odd ? ["#000000", "#ffffff"] : ["#ffffff", "#000000"], "#ffffff"); renderer.paintAllTiles(world, now); }
    renderer.flushTiles(world, now);
    const next = pixels.get("0,0");
    if (next !== previous) changes.push(now);
    previous = next;
  }
  for (const start of changes) assert.ok(changes.filter(t => t >= start && t < start + 1000).length <= 6, `${kind}: more than three opposing pairs in one second`);
  renderer.flushTiles(world, 3300);
  const expected = kind === "ownership" ? ["#ffffff", "#000000"][world.ownership[0]] : "#000000";
  assert.equal(pixels.get("0,0"), expected, "queued paint converges to the latest state");
});

test("monotonic palette fades remain smooth and first claims are immediate", () => {
  const { renderer, world, pixels } = fixture();
  world.ownership[0] = 1;
  renderer.paintTiles(world, [0], 1000);
  assert.equal(pixels.get("0,0"), "#000000");
  for (let i = 1; i <= 10; i++) {
    const hex = `#${(i * 20).toString(16).padStart(2, "0").repeat(3)}`;
    renderer.setTheme(["#ffffff", hex], "#ffffff");
    renderer.paintAllTiles(world, 1500 + i * 6);
    assert.equal(pixels.get("0,0"), hex);
  }
});

test("rebuilding the board cannot bypass the reversal limit", () => {
  const { renderer, world, pixels } = fixture();
  Object.assign(world, { balls: [], ballRadius: 1, ballStyle: "glow" });
  const changes = []; let previous = pixels.get("0,0");
  for (let now = 1; now <= 3000; now += 6) {
    const odd = Math.floor(now / 6) % 2;
    world.ownership = [odd, 1 - odd];
    renderer.resize(world, 1, now);
    renderer.drawBalls(world, now);
    const next = pixels.get("0,0");
    if (next !== previous) changes.push(now);
    previous = next;
  }
  for (const start of changes) assert.ok(changes.filter(t => t >= start && t < start + 1000).length <= 6);
});

test("drawing does not consume the simulation random stream", () => {
  const { renderer, world } = fixture();
  Object.assign(world, { balls: [], ballRadius: 1, ballStyle: "glow" });
  const original = Math.random;
  Math.random = () => { throw Error("renderer consumed physics randomness"); };
  try { for (let now = 0; now < 2000; now += 6) renderer.drawBalls(world, now); }
  finally { Math.random = original; }
});
