#!/usr/bin/env node
"use strict";
// Rewrites VERSION in sw.js to a hash of every precached file, so a deploy
// with changed files always ships a new cache. `--check` only verifies.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.join(__dirname, "..");
const swPath = path.join(root, "sw.js");

function precacheList(sw) {
  return JSON.parse(sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1].replace(/,\s*\]/, "]"));
}

function contentVersion(sw) {
  const hash = crypto.createHash("sha256");
  for (const file of precacheList(sw)) {
    if (file === "./") continue;
    hash.update(file);
    hash.update(fs.readFileSync(path.join(root, file)));
  }
  // sw.js itself, minus its own VERSION line
  hash.update(sw.replace(/const VERSION = "[^"]*";/, ""));
  return `endless-pong-${hash.digest("hex").slice(0, 8)}`;
}

function currentVersion(sw) {
  return sw.match(/const VERSION = "([^"]*)";/)[1];
}

module.exports = { contentVersion, currentVersion, precacheList };

if (require.main === module) {
  const sw = fs.readFileSync(swPath, "utf8");
  const want = contentVersion(sw);
  if (process.argv.includes("--check")) {
    if (currentVersion(sw) !== want) {
      console.error(`sw.js VERSION is stale (${currentVersion(sw)}, expected ${want}). Run: npm run stamp`);
      process.exit(1);
    }
    console.log(`sw.js VERSION ok (${want})`);
  } else {
    fs.writeFileSync(swPath, sw.replace(/const VERSION = "[^"]*";/, `const VERSION = "${want}";`));
    console.log(`sw.js VERSION -> ${want}`);
  }
}
