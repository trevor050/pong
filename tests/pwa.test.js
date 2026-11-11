"use strict";
// Static checks that keep the offline cache honest: every precached file
// exists, and every local asset the page loads is precached.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

const { contentVersion, currentVersion, precacheList } = require("../scripts/stamp-sw.js");

const sw = read("sw.js");
const precache = precacheList(sw);

test("service worker VERSION matches the precached content (run npm run stamp)", () => {
  assert.equal(currentVersion(sw), contentVersion(sw));
});

test("every precached file exists", () => {
  for (const file of precache) {
    if (file === "./") continue;
    assert.ok(fs.existsSync(path.join(root, file)), `${file} is precached but missing`);
  }
});

test("every local asset referenced by index.html, styles.css and the manifest is precached", () => {
  const html = read("index.html");
  const refs = [
    ...[...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map((m) => m[1]),
    ...[...read("styles.css").matchAll(/url\("?([^")]+)"?\)/g)].map((m) => m[1]),
    ...JSON.parse(read("manifest.webmanifest")).icons.map((i) => i.src)
  ].filter((ref) => !/^(https?:|data:|mailto:)/.test(ref));
  assert.ok(refs.length > 8);
  for (const ref of new Set(refs)) assert.ok(precache.includes(ref), `${ref} is loaded but not precached`);
});

test("manifest is installable", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((i) => i.sizes === "192x192"));
  assert.ok(manifest.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable"));
  assert.ok(manifest.start_url && manifest.name);
});
