"use strict";
// Runs the frozen pre-refactor script (tests/legacy/script.legacy.js, taken
// verbatim from commit ae9f8b8) inside a Node VM with a stub DOM and a seeded
// Math.random, so the refactored physics can be compared against it exactly.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { mulberry32 } = require("../../js/physics.js");

const LEGACY_SOURCE = fs.readFileSync(path.join(__dirname, "script.legacy.js"), "utf8");

// A permissive stand-in for any DOM node or canvas context: every property
// read returns another stub (or a stored value), every call returns a stub.
function makeStub(overrides = {}) {
  const store = { ...overrides };
  const target = function stub() {};
  return new Proxy(target, {
    get(_, prop) {
      if (prop in store) return store[prop];
      if (prop === Symbol.toPrimitive) return () => 0;
      if (prop === "length") return 0;
      if (prop === "forEach") return () => {};
      if (prop === "contains") return () => false;
      if (prop === "querySelectorAll") return () => [];
      if (prop === "hasPointerCapture") return () => false;
      const child = makeStub();
      store[prop] = child;
      return child;
    },
    set(_, prop, value) {
      store[prop] = value;
      return true;
    },
    apply() {
      return makeStub();
    }
  });
}

function makeContext({ width, height, storage, seed }) {
  const storageMap = new Map(storage ? [["daynite-drift-settings", JSON.stringify(storage)]] : []);
  const ctx2d = makeStub();
  const elements = new Map();
  const getElement = (selector) => {
    if (!elements.has(selector)) {
      const el = makeStub(
        selector === "#gameCanvas" ? { width: 720, height: 720, getContext: () => ctx2d } : {}
      );
      elements.set(selector, el);
    }
    return elements.get(selector);
  };
  const document = makeStub({
    querySelector: getElement,
    querySelectorAll: () => [],
    createElement: () => makeStub({ getContext: () => ctx2d }),
    addEventListener: () => {},
    documentElement: makeStub(),
    body: makeStub(),
    hidden: false,
    fullscreenElement: null,
    webkitFullscreenElement: null
  });
  const window = {
    innerWidth: width,
    innerHeight: height,
    devicePixelRatio: 1,
    addEventListener: () => {}
  };
  const sandbox = {
    window,
    document,
    localStorage: {
      getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
      setItem: (k, v) => storageMap.set(k, String(v))
    },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    performance: { now: () => 0 },
    console
  };
  const context = vm.createContext(sandbox);
  context.__rng = mulberry32(seed);
  vm.runInContext("Math.random = () => __rng();", context);
  return context;
}

// Hooks appended to the legacy script so the harness can reach its
// script-scoped `let` bindings.
const HOOKS = `
globalThis.__legacy = {
  render,
  get ownership() { return ownership; },
  set ownership(v) { ownership = v; },
  get balls() { return balls; },
  get grid() { return { gridWidth, gridHeight, frameWidth, frameHeight, ballRadius, minSpeed, maxSpeed, tileSize: settings.tileSize, chaos: settings.chaos }; }
};
`;

function runLegacyScenario(scenario) {
  const context = makeContext(scenario);
  vm.runInContext(LEGACY_SOURCE + HOOKS, context, { filename: "script.legacy.js" });
  const legacy = context.__legacy;
  if (scenario.initialOwnership) {
    const { gridWidth, gridHeight } = legacy.grid;
    legacy.ownership = scenario.initialOwnership(gridWidth, gridHeight);
  }
  // Init code (background seeds etc.) draws from Math.random too; start the
  // seeded stream fresh at the first frame so only the physics consumes it.
  context.__rng = mulberry32(scenario.seed);
  const snapshots = [];
  const checkpoints = new Set(scenario.checkpoints);
  for (let frame = 1; frame <= scenario.frames; frame++) {
    legacy.render();
    if (checkpoints.has(frame)) {
      snapshots.push({
        frame,
        ownership: Array.from(legacy.ownership),
        balls: legacy.balls.map((b) => ({ owner: b.owner, x: b.x, y: b.y, vx: b.vx, vy: b.vy }))
      });
    }
  }
  // JSON round-trip moves the data out of the VM realm (doubles survive exactly).
  return JSON.parse(JSON.stringify({ grid: legacy.grid, snapshots }));
}

module.exports = { runLegacyScenario };
