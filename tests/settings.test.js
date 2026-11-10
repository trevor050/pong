"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../js/settings.js");

test("defaults encode to an empty hash", () => {
  assert.equal(S.toHash(S.sanitize({})), "");
});

test("hash round-trips a shared look", () => {
  const look = S.sanitize({ themeKey: "seafoam", ballStyle: "comet", speedMood: 6.5, chaosRaw: 80, tileSizeRaw: 20, cinematicMode: true, shuffle: true, clock: true, hideScoreBar: true });
  const hash = S.toHash(look);
  assert.equal(hash, "p=seafoam&b=comet&v=6.5&c=80&t=20&cinematic=1&noscore=1&shuffle=1&clock=1");
  const parsed = S.sanitize(S.fromHash("#" + hash).settings);
  for (const key of Object.keys(S.HASH_KEYS)) assert.equal(parsed[key], look[key], key);
  assert.equal(parsed.dayColor, "#e9f8f2");
});

test("custom colors travel in the hash", () => {
  const look = S.sanitize({ themeKey: "custom", dayColor: "#ABCDEF", nightColor: "#010203", accentColor: "#ff0000" });
  const hash = S.toHash(look);
  assert.equal(hash, "p=custom&cc=abcdef-010203-ff0000");
  const parsed = S.sanitize(S.fromHash(hash).settings);
  assert.deepEqual([parsed.dayColor, parsed.nightColor, parsed.accentColor], ["#abcdef", "#010203", "#ff0000"]);
  // cc without p implies custom
  assert.equal(S.sanitize(S.fromHash("cc=111111-222222-333333").settings).themeKey, "custom");
});

test("hostile or junk hash values are clamped or ignored", () => {
  const parsed = S.sanitize(S.fromHash("p=<script>&b=nope&v=9999&c=-5&t=abc&cc=zzz-1-2&clock=maybe").settings);
  assert.equal(parsed.themeKey, "dayNNight");
  assert.equal(parsed.ballStyle, "glow");
  assert.equal(parsed.speedMood, S.SPEED_MAX);
  assert.equal(parsed.chaosRaw, 0);
  assert.equal(parsed.tileSizeRaw, S.DEFAULTS.tileSizeRaw);
  assert.equal(parsed.clock, false);
});

test("saver flag is parsed but never stored", () => {
  const { settings, flags } = S.fromHash("#saver&p=cosmos");
  assert.equal(flags.saver, true);
  assert.ok(!("saver" in settings));
  assert.ok(!S.toStorage(S.sanitize(settings)).includes("saver"));
});

test("reads settings saved by the original single-file version", () => {
  const legacy = JSON.stringify({
    themeKey: "aurora", tileSizeRaw: 30, speedMood: 4, chaosRaw: 10, ballStyle: "ring",
    hideScoreBar: true, autoHideChrome: true, autoHideCursor: false, cinematicMode: true,
    dayColor: "#ffffff", nightColor: "#000000", accentColor: "#123456"
  });
  const s = S.fromStorage(legacy);
  assert.equal(s.themeKey, "seafoam");
  assert.equal(s.ballStyle, "glow");
  assert.equal(s.tileSizeRaw, 30);
  assert.equal(s.hideScoreBar, true);
  assert.equal(s.autoHideChrome, true);
  assert.equal(s.dayColor, "#e9f8f2", "named palettes win over stale stored colors");
  assert.equal(s.shuffle, false);
  assert.deepEqual(S.fromStorage("not json"), S.sanitize({}));
});

test("a shared link defines the whole look but keeps local preferences", () => {
  const local = S.sanitize({ ballStyle: "comet", speedMood: 9, autoHideChrome: true, clock: true });
  const applied = S.applyLink(local, S.fromHash("p=seafoam").settings);
  assert.equal(applied.themeKey, "seafoam");
  assert.equal(applied.ballStyle, "glow", "unspecified look keys fall back to defaults");
  assert.equal(applied.speedMood, S.DEFAULTS.speedMood);
  assert.equal(applied.clock, false);
  assert.equal(applied.autoHideChrome, true, "local UI preference survives");
});
