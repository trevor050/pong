"use strict";
// End-to-end checks in a real Chromium: npm run test:e2e
const test = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const server = require("../../scripts/static-server.js");

let browser;
let site;

test.before(async () => {
  site = await server.start();
  browser = await chromium.launch();
});

test.after(async () => {
  await browser?.close();
  await site?.close();
});

async function open(t, { hash = "", viewport = { width: 1280, height: 800 }, ...options } = {}) {
  const context = await browser.newContext({ viewport, ...options });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(site.url + (hash ? `#${hash}` : ""));
  await page.waitForFunction(() => window.endlessPong && window.endlessPong.world.steps > 30);
  return { page, context, errors };
}

const boardState = (page) =>
  page.evaluate(() => {
    const w = window.endlessPong.world;
    const tiles = document.querySelector("#tileCanvas");
    return {
      steps: w.steps,
      counts: [...w.counts],
      width: w.width,
      height: w.height,
      canvasPx: [tiles.width, tiles.height],
      vw: innerWidth,
      vh: innerHeight,
      scrollW: document.documentElement.scrollWidth
    };
  });

test("runs, flips tiles and renders crisp at DPR 2", async (t) => {
  const { page, errors } = await open(t, { deviceScaleFactor: 2 });
  const a = await boardState(page);
  await page.waitForTimeout(1500);
  const b = await boardState(page);
  assert.ok(b.steps - a.steps > 60, "simulation advances at about 60 steps/s");
  assert.ok(b.width >= b.vw && b.height >= b.vh, "board covers the viewport");
  assert.deepEqual(b.canvasPx, [b.width * 2, b.height * 2], "canvas backing store matches device pixels");
  const painted = await page.evaluate(() => {
    const c = document.querySelector("#tileCanvas");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let light = 0;
    for (let i = 0; i < d.length; i += 4 * 97) if (d[i] > 128) light++;
    return light / (d.length / (4 * 97));
  });
  const share = b.counts[0] / (b.counts[0] + b.counts[1]);
  assert.ok(Math.abs(painted - share) < 0.08, `painted light share ${painted} matches simulated ${share}`);
  assert.deepEqual(errors, []);
});

test("a share link sets the look and the URL tracks changes", async (t) => {
  const { page } = await open(t, { hash: "p=seafoam&b=comet&clock=1" });
  const s = await page.evaluate(() => ({ ...window.endlessPong.settings }));
  assert.equal(s.themeKey, "seafoam");
  assert.equal(s.ballStyle, "comet");
  assert.equal(await page.isVisible("#clock"), true);

  await page.keyboard.press("s");
  await page.click("#themeSelected");
  await page.click('#themePanel [data-key="neonCity"]');
  await page.waitForFunction(() => location.hash.includes("p=neonCity"));
  assert.match(await page.evaluate(() => location.hash), /b=comet/);
});

test("settings drawer is keyboard operable and inert when closed", async (t) => {
  const { page } = await open(t);
  assert.equal(await page.evaluate(() => document.querySelector("#configPanel").inert), true);
  await page.keyboard.press("s");
  await page.waitForFunction(() => document.activeElement?.id === "closeConfig");
  assert.equal(await page.evaluate(() => document.querySelector("#configPanel").inert), false);
  // Tab stays inside the drawer.
  for (let i = 0; i < 40; i++) await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.querySelector("#configPanel").contains(document.activeElement)), true);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("#configPanel").classList.contains("open"));
  assert.equal(await page.evaluate(() => document.querySelector("#configPanel").inert), true);
});

test("space pauses and resumes", async (t) => {
  const { page } = await open(t);
  await page.keyboard.press("Space");
  const a = await boardState(page);
  await page.waitForTimeout(500);
  const b = await boardState(page);
  assert.equal(b.steps, a.steps);
  await page.keyboard.press("Space");
  await page.waitForTimeout(300);
  assert.ok((await boardState(page)).steps > b.steps);
});

test("screensaver mode hides the chrome and cursor, drifts, and Escape exits", async (t) => {
  const { page } = await open(t);
  await page.keyboard.press("f");
  await page.waitForTimeout(400);
  const on = await page.evaluate(() => ({
    saver: document.body.classList.contains("saver"),
    cursor: document.body.classList.contains("cursor-hidden"),
    chrome: getComputedStyle(document.querySelector("#chromeControls")).opacity,
    transform: document.querySelector("#canvasFrame").style.transform
  }));
  assert.equal(on.saver, true);
  assert.equal(on.cursor, true);
  assert.equal(on.chrome, "0");
  assert.match(on.transform, /translate/);
  const b = await boardState(page);
  assert.ok(b.width >= b.vw + 16 && b.height >= b.vh + 16, "board is oversized so drift never shows an edge");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => document.body.classList.contains("saver")), false);
});

test("#saver kiosk link shows no UI at all", async (t) => {
  const { page } = await open(t, { hash: "saver&p=cosmos" });
  assert.equal(await page.isVisible("#chromeControls"), false);
  await page.mouse.move(600, 300);
  await page.keyboard.press("s");
  assert.equal(await page.evaluate(() => document.querySelector("#configPanel").classList.contains("open")), false);
  assert.equal(await page.evaluate(() => window.endlessPong.settings.themeKey), "cosmos");
});

test("phone viewport: fills the screen without horizontal scroll, survives rotation", async (t) => {
  const { page, errors } = await open(t, {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  });
  let s = await boardState(page);
  assert.ok(s.width >= 390 && s.height >= 844);
  assert.equal(s.scrollW, 390);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(300);
  s = await boardState(page);
  assert.ok(s.width >= 844 && s.height >= 390, "board follows orientation change");
  assert.equal(s.scrollW, 844);
  await page.tap("#configBtn");
  await page.waitForTimeout(300);
  const drawerWidth = await page.evaluate(() => document.querySelector("#configPanel").getBoundingClientRect().width);
  assert.ok(drawerWidth >= 300);
  assert.deepEqual(errors, []);
});

test("reduced motion freezes flicker effects", async (t) => {
  const { page } = await open(t, { reducedMotion: "reduce" });
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("reduce-motion")), true);
});

test("installable and works offline after the first visit", async (t) => {
  const { page, context } = await open(t);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const manifest = await page.evaluate(async () => (await fetch(document.querySelector('link[rel="manifest"]').href)).json());
  assert.equal(manifest.display, "standalone");

  await context.setOffline(true);
  await page.goto(site.url + "?offline=1#p=duskPeach");
  await page.waitForFunction(() => window.endlessPong && window.endlessPong.world.steps > 30);
  assert.equal(await page.evaluate(() => window.endlessPong.settings.themeKey), "duskPeach");
  const fontOk = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('16px "Space Grotesk"');
  });
  assert.equal(fontOk, true, "self-hosted font loads offline");
});
