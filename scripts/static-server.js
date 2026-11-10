"use strict";
// Minimal static file server for the e2e tests and the capture/profile
// scripts. `/legacy/*` serves the pre-overhaul app straight from git history
// (commit ae9f8b8) for before/after comparisons, without copying files.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const LEGACY_COMMIT = "ae9f8b8";
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".gif": "image/gif",
  ".woff2": "font/woff2"
};

function legacyFile(rel) {
  try {
    return execFileSync("git", ["show", `${LEGACY_COMMIT}:${rel}`], { cwd: ROOT, maxBuffer: 1 << 24 });
  } catch (e) {
    return null;
  }
}

function start(port = 0) {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
    let body = null;
    if (rel === "legacy" || rel.startsWith("legacy/")) {
      rel = rel.replace(/^legacy\/?/, "") || "index.html";
      body = legacyFile(rel);
    } else {
      if (!rel || rel.endsWith("/")) rel += "index.html";
      const file = path.join(ROOT, rel);
      if (file.startsWith(ROOT) && fs.existsSync(file) && fs.statSync(file).isFile()) body = fs.readFileSync(file);
    }
    if (!body) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, {
      "content-type": TYPES[path.extname(rel)] || "application/octet-stream",
      "cache-control": "no-cache"
    });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${server.address().port}/`;
      resolve({ url, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

module.exports = { start };

if (require.main === module) {
  start(Number(process.env.PORT) || 5173).then(({ url }) => console.log(`serving ${ROOT} at ${url}`));
}
