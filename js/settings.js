/*
 * Settings model: palettes, ball styles, defaults, localStorage persistence and
 * the shareable URL hash. Pure functions with no DOM, so they are unit tested.
 * The stored format is backward compatible with the original single-file app.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PongSettings = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const THEMES = [
    { key: "dayNNight", label: "Split Horizon", day: "#eaf6ff", night: "#071427", accent: "#ffd180" },
    { key: "cosmos", label: "Stardust", day: "#fff8e7", night: "#0a0a1a", accent: "#ffd166" },
    { key: "neonCity", label: "Neo Tokyo", day: "#f8f0ff", night: "#0d0518", accent: "#ff6bff" },
    { key: "seafoam", label: "Seafoam", day: "#e9f8f2", night: "#0f2a2f", accent: "#7ce6c7" },
    { key: "duskPeach", label: "Peach Pit", day: "#fff0e6", night: "#2a1421", accent: "#ff9e9e" },
    { key: "neonNoir", label: "Midnight Chrome", day: "#e9ecff", night: "#0b0d18", accent: "#8fd4ff" },
    { key: "retroTerminal", label: "Green Screen", day: "#eeffee", night: "#001100", accent: "#33ff33" }
  ];

  const THEME_ALIASES = { aurora: "seafoam", citrusWave: "cosmos", monoGlass: "neonNoir", skyDrift: "dayNNight" };

  const BALL_STYLES = [
    { key: "glow", label: "Neon Glow" },
    { key: "halo", label: "Orbital Ring" },
    { key: "fill", label: "Soft Core" },
    { key: "grid", label: "Grid Lines" },
    { key: "trail", label: "Ghost Trail" },
    { key: "comet", label: "Comet Tail" },
    { key: "spark", label: "Sparkburst" },
    { key: "glitch", label: "Data Glitch" },
    { key: "pixel", label: "8-Bit Block" },
    { key: "bubble", label: "Soap Bubble" },
    { key: "emoji", label: "Mood Emojis" }
  ];

  const BALL_ALIASES = { ring: "glow", solid: "fill", design: "grid", artsy: "trail" };

  const SPEED_MIN = 0.2;
  const SPEED_MAX = 20;
  const STORAGE_KEY = "daynite-drift-settings";

  const DEFAULTS = Object.freeze({
    themeKey: "dayNNight",
    tileSizeRaw: 55,
    speedMood: 2.75,
    chaosRaw: 40,
    ballStyle: "glow",
    hideScoreBar: false,
    autoHideChrome: false,
    autoHideCursor: false,
    cinematicMode: false,
    dayColor: THEMES[0].day,
    nightColor: THEMES[0].night,
    accentColor: THEMES[0].accent,
    // Added in the screensaver overhaul; both opt-in.
    shuffle: false,
    clock: false
  });

  const BOOLEAN_KEYS = ["hideScoreBar", "autoHideChrome", "autoHideCursor", "cinematicMode", "shuffle", "clock"];

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const isHex = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

  function getTheme(key) {
    return THEMES.find((t) => t.key === key) || THEMES[0];
  }

  function normalizeThemeKey(key) {
    if (key === "custom") return "custom";
    const aliased = THEME_ALIASES[key] || key;
    return THEMES.some((t) => t.key === aliased) ? aliased : DEFAULTS.themeKey;
  }

  function normalizeBallStyle(key) {
    const aliased = BALL_ALIASES[key] || key;
    return BALL_STYLES.some((b) => b.key === aliased) ? aliased : DEFAULTS.ballStyle;
  }

  function bool(v, fallback) {
    if (typeof v === "boolean") return v;
    if (v === "1" || v === "true") return true;
    if (v === "0" || v === "false") return false;
    return fallback;
  }

  function num(v, fallback, lo, hi) {
    if (v === null || v === undefined || v === "") return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
  }

  /**
   * Fill in, clamp and validate a partial settings object. Named palettes
   * always win over stored colors; "custom" keeps the stored colors.
   */
  function sanitize(input) {
    const s = { ...DEFAULTS, ...input };
    s.themeKey = normalizeThemeKey(s.themeKey);
    s.ballStyle = normalizeBallStyle(s.ballStyle);
    s.tileSizeRaw = Math.round(num(s.tileSizeRaw, DEFAULTS.tileSizeRaw, 0, 100));
    s.chaosRaw = Math.round(num(s.chaosRaw, DEFAULTS.chaosRaw, 0, 100));
    s.speedMood = num(s.speedMood, DEFAULTS.speedMood, SPEED_MIN, SPEED_MAX);
    for (const key of BOOLEAN_KEYS) s[key] = bool(s[key], DEFAULTS[key]);
    if (s.themeKey === "custom") {
      s.dayColor = isHex(s.dayColor) ? s.dayColor.toLowerCase() : DEFAULTS.dayColor;
      s.nightColor = isHex(s.nightColor) ? s.nightColor.toLowerCase() : DEFAULTS.nightColor;
      s.accentColor = isHex(s.accentColor) ? s.accentColor.toLowerCase() : DEFAULTS.accentColor;
    } else {
      const theme = getTheme(s.themeKey);
      s.dayColor = theme.day;
      s.nightColor = theme.night;
      s.accentColor = theme.accent;
    }
    return s;
  }

  function fromStorage(raw) {
    try {
      const saved = JSON.parse(raw || "{}");
      return sanitize(saved && typeof saved === "object" ? pick(saved) : {});
    } catch (e) {
      return sanitize({});
    }
  }

  function pick(obj) {
    const out = {};
    for (const key of Object.keys(DEFAULTS)) if (obj[key] !== undefined && obj[key] !== null) out[key] = obj[key];
    return out;
  }

  function toStorage(settings) {
    return JSON.stringify(pick(settings));
  }

  // URL hash keys for the "look" of a board. Local UI preferences (auto-hide)
  // are deliberately not part of a shared link.
  const HASH_KEYS = {
    themeKey: "p",
    ballStyle: "b",
    speedMood: "v",
    chaosRaw: "c",
    tileSizeRaw: "t",
    cinematicMode: "cinematic",
    hideScoreBar: "noscore",
    shuffle: "shuffle",
    clock: "clock"
  };

  const encodeValue = (v) => (typeof v === "boolean" ? (v ? "1" : "0") : String(v));

  /** Encode what differs from the defaults, e.g. "p=seafoam&b=comet". */
  function toHash(settings) {
    const params = new URLSearchParams();
    for (const [key, short] of Object.entries(HASH_KEYS)) {
      const value = key === "speedMood" ? Math.round(settings[key] * 100) / 100 : settings[key];
      if (value !== DEFAULTS[key]) params.set(short, encodeValue(value));
    }
    if (settings.themeKey === "custom") {
      params.set("cc", [settings.dayColor, settings.nightColor, settings.accentColor].map((c) => c.slice(1)).join("-"));
    }
    return params.toString();
  }

  /**
   * Parse a location hash into { settings, flags }. `settings` only contains
   * keys present in the hash; `flags` are one-off modes that are never stored.
   */
  function fromHash(hash) {
    const params = new URLSearchParams(String(hash || "").replace(/^#/, ""));
    const settings = {};
    for (const [key, short] of Object.entries(HASH_KEYS)) {
      if (params.has(short)) settings[key] = params.get(short);
    }
    if (params.has("cc")) {
      const [day, night, accent] = params.get("cc").split("-").map((h) => `#${h}`);
      Object.assign(settings, { dayColor: day, nightColor: night, accentColor: accent });
      if (!settings.themeKey) settings.themeKey = "custom";
    }
    return { settings, flags: { saver: params.has("saver") } };
  }

  /**
   * Apply a shared link on top of local settings. Links only carry values that
   * differ from the defaults, so every "look" key the link leaves out goes
   * back to its default; local preferences (auto-hide) are kept.
   */
  function applyLink(local, linkSettings) {
    const look = {};
    for (const key of Object.keys(HASH_KEYS)) look[key] = DEFAULTS[key];
    return sanitize({ ...local, ...look, ...linkSettings });
  }

  return {
    THEMES,
    BALL_STYLES,
    DEFAULTS,
    SPEED_MIN,
    SPEED_MAX,
    STORAGE_KEY,
    HASH_KEYS,
    getTheme,
    normalizeThemeKey,
    normalizeBallStyle,
    sanitize,
    fromStorage,
    toStorage,
    toHash,
    fromHash,
    applyLink
  };
});
