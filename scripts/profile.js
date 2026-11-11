#!/usr/bin/env node
"use strict";
// Compares the render loop cost of the current app against the pre-overhaul
// version (served from git history) at a 4K device resolution:
//   npm run profile
// Reports main-thread task time and renderer/GPU process CPU over 6 seconds.
// Headless Chromium numbers are for relative comparison, not absolute truth.
const { chromium } = require("playwright");
const server = require("./static-server.js");

const VIEWPORT = { width: 1920, height: 1080 };
const DPR = 2;
const SECONDS = 6;

async function measure(browser, url, tileSizeRaw) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR, serviceWorkers: "block" });
  await context.addInitScript((raw) => {
    localStorage.setItem("daynite-drift-settings", JSON.stringify({ tileSizeRaw: raw }));
  }, tileSizeRaw);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const browserCdp = await browser.newBrowserCDPSession();
  await cdp.send("Performance.enable");
  await page.goto(url);
  await page.waitForTimeout(3000);

  const cpu = async () => {
    const { processInfo } = await browserCdp.send("SystemInfo.getProcessInfo");
    const byType = {};
    for (const p of processInfo) byType[p.type] = (byType[p.type] || 0) + p.cpuTime;
    return byType;
  };
  const metrics = async () =>
    Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame((a) => requestAnimationFrame((b) => r(b - a)))));

  const c0 = await cpu();
  const m0 = await metrics();
  await page.waitForTimeout(SECONDS * 1000);
  const c1 = await cpu();
  const m1 = await metrics();
  const frameMs = await frames();
  const canvas = await page.evaluate(() => {
    const c = [...document.querySelectorAll("canvas")].sort((a, b) => b.width - a.width)[0];
    return `${c.width}x${c.height}`;
  });
  await browserCdp.detach();
  await context.close();
  return {
    canvas,
    mainThreadMsPerSec: (((m1.TaskDuration - m0.TaskDuration) / SECONDS) * 1000).toFixed(1),
    styleLayoutMsPerSec: ((((m1.RecalcStyleDuration + m1.LayoutDuration) - (m0.RecalcStyleDuration + m0.LayoutDuration)) / SECONDS) * 1000).toFixed(1),
    rendererCpuPct: (((c1.renderer - c0.renderer) / SECONDS) * 100).toFixed(1),
    gpuCpuPct: (((c1.GPU - c0.GPU) / SECONDS) * 100).toFixed(1),
    frameIntervalMs: frameMs.toFixed(1)
  };
}

(async () => {
  const site = await server.start();
  const browser = await chromium.launch();
  const rows = [];
  try {
    for (const tileSizeRaw of [55, 0]) {
      for (const [name, path] of [["before", "legacy/"], ["after", ""]]) {
        const r = await measure(browser, site.url + path, tileSizeRaw);
        rows.push({ version: name, tiles: tileSizeRaw === 55 ? "default (55px)" : "smallest (14px)", ...r });
      }
    }
  } finally {
    await browser.close();
    await site.close();
  }
  console.log(`${VIEWPORT.width}x${VIEWPORT.height} CSS px at DPR ${DPR}, ${SECONDS}s per run, headless Chromium`);
  console.table(rows);
})();
