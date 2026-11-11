"use strict";
// Fixed-seed scenarios that pin the simulation's behavior. Each one is run
// through the frozen legacy loop and through js/physics.js and must match
// exactly. Avoid the "glitch" and "pixel" ball styles here: the legacy code
// called Math.random() while drawing those, which shares the RNG stream with
// the physics and makes the comparison meaningless.

const skewed = (share) => (gridWidth, gridHeight) =>
  Array.from({ length: gridWidth * gridHeight }, (_, idx) => ((idx % gridWidth) < gridWidth * share ? 0 : 1));

module.exports = [
  {
    name: "defaults on a laptop viewport",
    width: 1280,
    height: 800,
    seed: 1,
    storage: null,
    frames: 3000,
    checkpoints: [1, 10, 100, 500, 1000, 2000, 3000]
  },
  {
    name: "small tiles, fast, chaotic, comet, cinematic on",
    width: 1920,
    height: 1080,
    seed: 42,
    storage: { tileSizeRaw: 10, speedMood: 6, chaosRaw: 85, ballStyle: "comet", cinematicMode: true },
    frames: 2000,
    checkpoints: [1, 50, 400, 1200, 2000]
  },
  {
    name: "lopsided board triggers the cinematic assist",
    width: 900,
    height: 600,
    seed: 7,
    storage: { tileSizeRaw: 40, speedMood: 3.5, chaosRaw: 20, ballStyle: "spark", cinematicMode: true },
    initialOwnership: skewed(0.88),
    frames: 2500,
    checkpoints: [1, 100, 600, 1500, 2500]
  },
  {
    name: "phone portrait, calm, zero chaos",
    width: 390,
    height: 844,
    seed: 2024,
    storage: { tileSizeRaw: 30, speedMood: 1, chaosRaw: 0, ballStyle: "bubble", cinematicMode: false },
    frames: 2000,
    checkpoints: [1, 300, 1000, 2000]
  }
];
