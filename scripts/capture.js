#!/usr/bin/env node
"use strict";
// Regenerates the README media from the live app:
//   npm run capture        (needs ffmpeg on PATH for the GIF)
// Writes docs/media/demo.gif and docs/media/<palette>.png.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const server = require("./static-server.js");

const OUT = path.join(__dirname, "..", "docs", "media");
const SHOTS = [
  { file: "split-horizon.png", hash: "" },
  { file: "neo-tokyo.png", hash: "p=neonCity&b=comet" },
  { file: "seafoam.png", hash: "p=seafoam&b=halo&t=35" },
  { file: "peach-pit.png", hash: "p=duskPeach&b=emoji&clock=1" }
];

async function settledPage(browser, url, viewport, steps) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, serviceWorkers: "block" });
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForFunction(() => window.endlessPong && window.endlessPong.world.steps > 10);
  // Fast-forward so the board has a real coastline instead of a straight split.
  await page.evaluate((n) => {
    const world = window.endlessPong.world;
    for (let i = 0; i < n; i++) window.PongPhysics.step(world);
  }, steps);
  await page.waitForTimeout(600);
  return { context, page };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const site = await server.start();
  const browser = await chromium.launch();
  try {
    for (const shot of SHOTS) {
      const { context, page } = await settledPage(browser, `${site.url}#${shot.hash}`, { width: 1280, height: 800 }, 2400);
      await page.screenshot({ path: path.join(OUT, shot.file) });
      await context.close();
      console.log(`wrote docs/media/${shot.file}`);
    }

    const videoDir = path.join(OUT, ".video");
    const context = await browser.newContext({
      viewport: { width: 800, height: 500 },
      deviceScaleFactor: 1,
      serviceWorkers: "block",
      recordVideo: { dir: videoDir, size: { width: 800, height: 500 } }
    });
    const page = await context.newPage();
    await page.goto(`${site.url}#t=40`);
    await page.waitForFunction(() => window.endlessPong && window.endlessPong.world.steps > 10);
    await page.evaluate(() => {
      const world = window.endlessPong.world;
      for (let i = 0; i < 1500; i++) window.PongPhysics.step(world);
    });
    await page.mouse.move(400, 250);
    await page.waitForTimeout(9000);
    const video = page.video();
    await context.close();
    const webm = await video.path();
    const gif = path.join(OUT, "demo.gif");
    // Skip the first second (page load), 6 s at 20 fps, 640 px wide, optimized palette.
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error", "-ss", "2", "-t", "6", "-i", webm,
      "-vf", "fps=20,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=48:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle",
      gif
    ]);
    fs.rmSync(videoDir, { recursive: true, force: true });
    console.log(`wrote docs/media/demo.gif (${(fs.statSync(gif).size / 1024).toFixed(0)} KB)`);
  } finally {
    await browser.close();
    await site.close();
  }
})();
