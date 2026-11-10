"use strict";
// Regenerates tests/golden/physics.json from the frozen legacy loop.
// Only rerun this if the legacy reference itself changes (it should not).
const fs = require("node:fs");
const path = require("node:path");
const scenarios = require("../scenarios.js");
const { runLegacyScenario } = require("./harness.js");
const { summarize } = require("../run-scenario.js");

const out = scenarios.map((scenario) => {
  const { grid, snapshots } = runLegacyScenario(scenario);
  return { name: scenario.name, grid, snapshots: summarize(snapshots) };
});
const file = path.join(__dirname, "..", "golden", "physics.json");
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(out, null, 1) + "\n");
console.log(`wrote ${path.relative(process.cwd(), file)} (${out.length} scenarios)`);
