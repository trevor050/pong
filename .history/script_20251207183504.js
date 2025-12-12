const canvasFrame = document.querySelector("#canvasFrame");
const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");

const playPauseBtn = document.querySelector("#playPauseBtn");
const resetBtn = document.querySelector("#resetBtn");
const configBtn = document.querySelector("#configBtn");
const closeConfigBtn = document.querySelector("#closeConfig");
const configPanel = document.querySelector("#configPanel");
const chromeControls = document.querySelector("#chromeControls");
const fullscreenHint = document.querySelector("#fullscreenHint");
const drawerOverlay = document.querySelector("#drawerOverlay");
const drawerPlayPause = document.querySelector("#drawerPlayPause");
const drawerReset = document.querySelector("#drawerReset");
const drawerFullscreen = document.querySelector("#drawerFullscreen");

const themePicker = document.querySelector("#themePicker");
const themeSelected = document.querySelector("#themeSelected");
const themePanel = document.querySelector("#themePanel");
const themeLabel = document.querySelector("#themeLabel");
const themeSwatches = document.querySelector("#themeSwatches");
const dayColorInput = document.querySelector("#dayColorInput");
const nightColorInput = document.querySelector("#nightColorInput");
const tileSizeInput = document.querySelector("#tileSizeInput");
const tileSizeValue = document.querySelector("#tileSizeValue");
const speedValue = document.querySelector("#speedValue");
const chaosInput = document.querySelector("#chaosInput");
const chaosValue = document.querySelector("#chaosValue");
const scatterBtn = document.querySelector("#scatterBtn");
const swapSidesBtn = document.querySelector("#swapSidesBtn");
const drawerResetSettings = document.querySelector("#drawerResetSettings");
const speedDial = document.querySelector("#speedDial");
const speedDialFill = document.querySelector("#speedDialFill");
const speedDialThumb = document.querySelector("#speedDialThumb");
const hideScoreToggle = document.querySelector("#hideScoreToggle");
const autoHideUiToggle = document.querySelector("#autoHideUiToggle");
const revealHotspot = document.querySelector("#revealHotspot");
const ballPicker = document.querySelector("#ballPicker");
const ballSelected = document.querySelector("#ballSelected");
const ballPanel = document.querySelector("#ballPanel");
const ballLabel = document.querySelector("#ballLabel");
const ballSwatch = document.querySelector("#ballSwatch");

const scoreNotch = document.querySelector("#scoreNotch");
const scoreDayLabel = document.querySelector("#dayScoreLabel");
const scoreNightLabel = document.querySelector("#nightScoreLabel");
const scoreDayBar = scoreNotch.querySelector(".score-notch__day");
const scoreNightBar = scoreNotch.querySelector(".score-notch__night");

const dragHandles = document.querySelectorAll(".corner-handle");

const themeList = [
  { key: "skyDrift", label: "Sky Drift", day: "#e8f5ff", night: "#0b1b2c", accent: "#6fd2ff" },
  { key: "seafoam", label: "Seafoam Calm", day: "#e9f8f2", night: "#0f2a2f", accent: "#7ce6c7" },
  { key: "duskPeach", label: "Peach Dusk", day: "#fff0e6", night: "#2a1421", accent: "#ff9e9e" },
  { key: "neonNoir", label: "Neon Noir", day: "#e9ecff", night: "#0b0d18", accent: "#8fd4ff" },
  { key: "forestMist", label: "Forest Mist", day: "#e5f5e6", night: "#0f2418", accent: "#7de68a" },
  { key: "sunBloom", label: "Sun Bloom", day: "#f9ebff", night: "#1f0e2a", accent: "#ff8dd6" },
  { key: "monoGlass", label: "Glass Mono", day: "#f1f1f1", night: "#101010", accent: "#9bd8ff" },
  { key: "citrusWave", label: "Citrus Wave", day: "#f5ffe6", night: "#1a2414", accent: "#ffd166" },
  { key: "starfield", label: "Starfield", day: "#d8e6ff", night: "#040714", accent: "#8ae2ff" },
  { key: "auroraSoft", label: "Aurora Soft", day: "#e4f4ff", night: "#0b1e33", accent: "#7de4ff" }
];

function getThemeByKey(key) {
  return themeList.find((t) => t.key === key) || themeList[0];
}

const defaultSettings = {
  themeKey: "skyDrift",
  tileSizeRaw: 35,
  tileSize: 20,
  speedMood: 1.2,
  chaosRaw: 40,
  chaos: 0.14,
  ballStyle: "glow",
  hideScoreBar: false,
  autoHideChrome: false
};

const settings = { ...defaultSettings };

let grid = [];
let ownership = [];
let balls = [];
let gridWidth = 0;
let gridHeight = 0;
let ballRadius = 0;
let minSpeed = 0;
let maxSpeed = 0;
let isPlaying = true;
let animationFrameId = null;
let frameWidth = 720;
let frameHeight = 720;
let resizeRaf = null;
let pendingSize = null;
let backgroundSeed = null;
let isImmersive = false;
let isNativeFullscreen = false;
let savedSize = null;
let chromeHideTimeout = null;

const baseTheme = getThemeByKey(settings.themeKey);
defaultSettings.dayColor = defaultSettings.dayColor || baseTheme.day;
defaultSettings.nightColor = defaultSettings.nightColor || baseTheme.night;
defaultSettings.accentColor = defaultSettings.accentColor || baseTheme.accent;
settings.dayColor = settings.dayColor || defaultSettings.dayColor;
settings.nightColor = settings.nightColor || defaultSettings.nightColor;
settings.accentColor = settings.accentColor || defaultSettings.accentColor;

const colors = {
  day: settings.dayColor,
  night: settings.nightColor,
  accent: settings.accentColor
};

const SPEED_MIN = 0.2;
const SPEED_MAX = 20;
const STORAGE_KEY = "daynite-drift-settings";

const ballStyles = [
  { key: "glow", label: "Neon Glow", preview: ["#6fd2ff", "#ffffff", "#0b1e33"] },
  { key: "halo", label: "Halo Bloom", preview: ["#7de4ff", "#ffffff", "#102235"] },
  { key: "fill", label: "Soft Core", preview: ["#f2f2f2", "#6fd2ff", "#0b1e33"] },
  { key: "grid", label: "Grid Lines", preview: ["#ffffff", "#6fd2ff", "#0b1e33"] },
  { key: "trail", label: "Ghost Trail", preview: ["#dff5ff", "#6fd2ff", "#08121f"] },
  { key: "comet", label: "Comet Tail", preview: ["#ffffff", "#7de4ff", "#0b0d18"] },
  { key: "spark", label: "Sparkburst", preview: ["#fff7e6", "#ffd166", "#0b1e33"] }
];

const ballAliases = { ring: "glow", solid: "fill", design: "grid", artsy: "trail" };

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

function normalizeBallStyle(key) {
  return ballAliases[key] || key;
}

function hexToRgb(hex) {
  const parsed = hex.replace("#", "");
  const bigint = parseInt(parsed, 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mixHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const r = Math.round(ca.r + (cb.r - ca.r) * t);
  const g = Math.round(ca.g + (cb.g - ca.g) * t);
  const bVal = Math.round(ca.b + (cb.b - ca.b) * t);
  const toHex = (v) => v.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(bVal)}`;
}

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function liftToContrast(hex, targetLum = 0.28) {
  let current = hex;
  let tries = 0;
  while (luminance(current) < targetLum && tries < 3) {
    current = mixHex(current, "#ffffff", 0.35);
    tries++;
  }
  return current;
}

function hydrateSettings() {
  loadSettingsFromStorage();
  settings.tileSizeRaw = Number(settings.tileSizeRaw ?? defaultSettings.tileSizeRaw);
  settings.chaosRaw = Number(settings.chaosRaw ?? defaultSettings.chaosRaw);
  settings.tileSize = nonLinearTileSize(settings.tileSizeRaw);
  settings.chaos = nonLinearChaos(settings.chaosRaw);
  settings.speedMood = clamp(Number(settings.speedMood) || defaultSettings.speedMood, SPEED_MIN, SPEED_MAX);
  colors.day = settings.dayColor;
  colors.night = settings.nightColor;
  colors.accent = settings.accentColor;
  updateCssPalette();
}

function loadSettingsFromStorage() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (!saved) return;
    Object.assign(settings, {
      themeKey: saved.themeKey ?? settings.themeKey,
      tileSizeRaw: saved.tileSizeRaw ?? settings.tileSizeRaw,
      speedMood: saved.speedMood ?? settings.speedMood,
      chaosRaw: saved.chaosRaw ?? settings.chaosRaw,
      ballStyle: normalizeBallStyle(saved.ballStyle ?? settings.ballStyle),
      hideScoreBar: saved.hideScoreBar ?? settings.hideScoreBar,
      autoHideChrome: saved.autoHideChrome ?? settings.autoHideChrome,
      dayColor: saved.dayColor ?? settings.dayColor,
      nightColor: saved.nightColor ?? settings.nightColor,
      accentColor: saved.accentColor ?? settings.accentColor
    });
  } catch (e) {
    // Ignore storage errors
  }
}

function saveSettingsToStorage() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        themeKey: settings.themeKey,
        tileSizeRaw: settings.tileSizeRaw,
        speedMood: settings.speedMood,
        chaosRaw: settings.chaosRaw,
        ballStyle: settings.ballStyle,
        hideScoreBar: settings.hideScoreBar,
        autoHideChrome: settings.autoHideChrome,
        dayColor: colors.day,
        nightColor: colors.night,
        accentColor: colors.accent
      })
    );
  } catch (e) {
    // Ignore
  }
}
function buildBackgroundSeed() {
  return {
    angle: 150 + Math.random() * 50,
    accentX: 0.12 + Math.random() * 0.2,
    accentY: 0.08 + Math.random() * 0.14,
    ambientX: 0.65 + Math.random() * 0.2,
    ambientY: 0.08 + Math.random() * 0.16,
    depthX: 0.14 + Math.random() * 0.2
  };
}

function refreshBackgroundSeed() {
  backgroundSeed = buildBackgroundSeed();
}

function updateCssPalette() {
  const root = document.documentElement;
  root.style.setProperty("--day", colors.day);
  root.style.setProperty("--night", colors.night);
  root.style.setProperty("--accent", colors.accent);
}

function updateDynamicBackground(dayRatio = 0.5, topHalfRatio = dayRatio, centroid = { x: 0.5, y: 0.5 }) {
  if (isNativeFullscreen) {
    document.body.style.background = "#000";
    return;
  }
  if (!backgroundSeed) refreshBackgroundSeed();
  
  // Ambilight: Project colors outward based on game state
  const dayColor = colors.day;
  const nightColor = colors.night;
  const accentColor = colors.accent;

  // Strong intensity based on dominance
  const dayPower = Math.pow(dayRatio, 0.8) * 0.7;
  const nightPower = Math.pow(1 - dayRatio, 0.8) * 0.7;
  
  // Position-based projections
  const topDayPower = Math.pow(topHalfRatio, 0.9) * 0.5;
  const bottomNightPower = Math.pow(1 - topHalfRatio, 0.9) * 0.5;
  
  // Centroid-based accent glow
  const centroidX = clamp(centroid.x * 100, 10, 90);
  const centroidY = clamp(centroid.y * 100, 10, 90);
  const accentPower = dayRatio * 0.4;

  const bg = `
    radial-gradient(circle at 0% 50%, ${rgba(dayColor, dayPower)}, transparent 45%),
    radial-gradient(circle at 100% 50%, ${rgba(nightColor, nightPower)}, transparent 45%),
    radial-gradient(circle at 50% 0%, ${rgba(dayColor, topDayPower)}, transparent 40%),
    radial-gradient(circle at 50% 100%, ${rgba(nightColor, bottomNightPower)}, transparent 40%),
    radial-gradient(ellipse at ${centroidX}% ${centroidY}%, ${rgba(accentColor, accentPower)}, transparent 35%),
    linear-gradient(135deg, ${rgba(nightColor, 0.3)} 0%, ${rgba(dayColor, 0.15)} 100%)
  `;
  
  const stars =
    settings.themeKey === "starfield"
      ? `,
    radial-gradient(1px 1px at 18% 22%, rgba(255, 255, 255, 0.26), transparent 50%),
    radial-gradient(1px 1px at 64% 14%, rgba(255, 255, 255, 0.24), transparent 50%),
    radial-gradient(1px 1px at 82% 68%, rgba(255, 255, 255, 0.2), transparent 50%),
    radial-gradient(1px 1px at 32% 78%, rgba(255, 255, 255, 0.22), transparent 50%)`
      : "";

  document.body.style.background = bg + stars;
}

function nonLinearTileSize(raw) {
  const min = 14;
  const max = 52;
  const t = Math.pow(raw / 100, 1.7);
  return Math.round(min + t * (max - min));
}

function nonLinearChaos(raw) {
  const t = Math.pow(raw / 100, 2.4);
  return parseFloat((t * 1.1).toFixed(3));
}

function updateBallRadius() {
  const style = normalizeBallStyle(settings.ballStyle);
  const scaleMap = {
    glow: 0.52,
    halo: 0.54,
    fill: 0.5,
    grid: 0.48,
    trail: 0.5,
    comet: 0.52,
    spark: 0.48
  };
  const scale = scaleMap[style] || 0.44;
  ballRadius = settings.tileSize * scale;
}

function updateDerived() {
  const t = clamp((settings.speedMood - SPEED_MIN) / (SPEED_MAX - SPEED_MIN), 0, 1);
  const lift = Math.pow(t, 0.82);
  const punch = Math.pow(t, 1.2);
  minSpeed = 1 + settings.speedMood * 0.7 + lift * 8;
  maxSpeed = 3 + settings.speedMood * 1.4 + punch * 28;
}

function setSpeedMood(value) {
  settings.speedMood = clamp(value, SPEED_MIN, SPEED_MAX);
  speedValue.textContent = `${settings.speedMood.toFixed(2)}x`;
  const pct = ((settings.speedMood - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * 100;
  speedDialFill.style.width = `${pct}%`;
  speedDialThumb.style.left = `${pct}%`;
  speedDial.setAttribute("aria-valuenow", settings.speedMood.toFixed(2));
  updateDerived();
  saveSettingsToStorage();
}

function attachSpeedDial() {
  let startX = 0;
  let startValue = settings.speedMood;
  let dialWidth = 200;
  let activePointerId = null;

  function handleMove(clientX) {
    const dx = clientX - startX;
    const span = Math.max(140, dialWidth);
    const norm = clamp(Math.abs(dx) / span, 0, 1);
    const fineDelta = (dx / span) * 3.2;
    const sprint = Math.pow(norm, 1.35) * (SPEED_MAX - SPEED_MIN) * 0.55;
    const delta = fineDelta + Math.sign(dx) * sprint;
    setSpeedMood(startValue + delta);
  }

  speedDial.addEventListener("pointerdown", (e) => {
    activePointerId = e.pointerId;
    startX = e.clientX;
    startValue = settings.speedMood;
    dialWidth = speedDial.getBoundingClientRect().width || 200;
    speedDial.setPointerCapture(activePointerId);
  });

  speedDial.addEventListener("pointermove", (e) => {
    if (activePointerId === null) return;
    handleMove(e.clientX);
  });

  function releasePointer(e) {
    if (activePointerId === null) return;
    if (e.pointerId === activePointerId && speedDial.hasPointerCapture(activePointerId)) {
      speedDial.releasePointerCapture(activePointerId);
    }
    saveSettingsToStorage();
    activePointerId = null;
  }

  speedDial.addEventListener("pointerup", releasePointer);
  speedDial.addEventListener("pointercancel", releasePointer);

  speedDial.addEventListener("keydown", (e) => {
    if (["ArrowRight", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      setSpeedMood(settings.speedMood + 0.2);
      saveSettingsToStorage();
    } else if (["ArrowLeft", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      setSpeedMood(settings.speedMood - 0.2);
      saveSettingsToStorage();
    } else if (e.key === "Home") {
      e.preventDefault();
      setSpeedMood(SPEED_MIN);
      saveSettingsToStorage();
    } else if (e.key === "End") {
      e.preventDefault();
      setSpeedMood(SPEED_MAX);
      saveSettingsToStorage();
    }
  });
}

function syncPlayPauseButtons() {
  playPauseBtn.setAttribute("data-state", isPlaying ? "playing" : "paused");
  playPauseBtn.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
  playPauseBtn.setAttribute("title", isPlaying ? "Pause" : "Play");
  drawerPlayPause.textContent = isPlaying ? "Pause" : "Play";
}

function renderIfPaused() {
  if (!isPlaying) render();
}

function updateFullscreenHint() {
  // If the hint button has been removed from DOM, skip DOM ops but keep drawer label updated
  const nearFull = frameWidth >= window.innerWidth * 0.92 || frameHeight >= window.innerHeight * 0.92;
  const show = nearFull && !isNativeFullscreen && !configPanel.classList.contains("open");
  drawerFullscreen.textContent = isNativeFullscreen ? "Exit fullscreen" : "Fullscreen";
  if (!fullscreenHint) return;
  fullscreenHint.classList.toggle("visible", show);
  fullscreenHint.title = isNativeFullscreen ? "Exit fullscreen" : "Enter fullscreen";
}

function getNativeFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement;
}

function requestNativeFullscreen() {
  const el = document.documentElement;
  const method = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!method) return Promise.reject(new Error("Fullscreen API not supported"));
  return Promise.resolve(method.call(el));
}

function exitNativeFullscreen() {
  const method = document.exitFullscreen || document.webkitExitFullscreen;
  if (!method) return Promise.reject(new Error("Fullscreen API not supported"));
  return Promise.resolve(method.call(document));
}

function restoreFrameFromSaved() {
  if (savedSize) {
    setFrameSize(savedSize.w, savedSize.h, true);
  } else {
    const initialW = clamp(Math.min(window.innerWidth - 120, 900), 420, window.innerWidth - 48);
    const initialH = clamp(Math.min(window.innerHeight - 200, 900), 420, window.innerHeight - 160);
    setFrameSize(initialW, initialH, true);
  }
}

function handleFullscreenChange() {
  isNativeFullscreen = Boolean(getNativeFullscreenElement());
  if (isNativeFullscreen) {
    savedSize = savedSize || { w: frameWidth, h: frameHeight };
    setFrameSize(window.innerWidth, window.innerHeight, true);
  } else {
    restoreFrameFromSaved();
  }
  updateDynamicBackground();
  updateFullscreenHint();
}

function enterFullscreen() {
  if (isNativeFullscreen) return;
  savedSize = { w: frameWidth, h: frameHeight };
  requestNativeFullscreen().catch(() => {
    // Fall back to the in-page immersive sizing if native fullscreen isn't available
    setFrameSize(window.innerWidth, window.innerHeight, true);
    updateFullscreenHint();
  });
}

function exitFullscreen() {
  if (isNativeFullscreen) {
    exitNativeFullscreen().catch(() => {
      restoreFrameFromSaved();
      updateFullscreenHint();
    });
    return;
  }
  restoreFrameFromSaved();
  updateFullscreenHint();
}

function toggleFullscreen(force) {
  const shouldEnter = force !== undefined ? force : !isNativeFullscreen;
  if (shouldEnter) enterFullscreen();
  else exitFullscreen();
}

function remapOwnership(oldOwners, oldW, oldH, newW, newH) {
  if (!oldOwners || !oldOwners.length) {
    return Array.from({ length: newW * newH }, (_, idx) => (idx % newW < newW / 2 ? 0 : 1));
  }
  const mapped = new Array(newW * newH);
  for (let y = 0; y < newH; y++) {
    const srcY = Math.min(oldH - 1, Math.floor((y / newH) * oldH));
    for (let x = 0; x < newW; x++) {
      const srcX = Math.min(oldW - 1, Math.floor((x / newW) * oldW));
      mapped[y * newW + x] = oldOwners[srcY * oldW + srcX];
    }
  }
  return mapped;
}

function setFrameSize(width, height, preserveOwnership = true) {
  const marginW = isImmersive ? 0 : 48;
  const marginH = isImmersive ? 0 : 160;
  const maxW = Math.max(420, window.innerWidth - marginW);
  const maxH = Math.max(420, window.innerHeight - marginH);
  frameWidth = clamp(width, 420, maxW);
  frameHeight = clamp(height, 420, maxH);
  rebuildGrid(preserveOwnership);
  updateFullscreenHint();
}

function rebuildGrid(preserveOwnership = true) {
  const oldOwnership = preserveOwnership ? ownership.slice() : null;
  const oldW = gridWidth || 1;
  const oldH = gridHeight || 1;
  const oldCanvasW = canvas.width || frameWidth;
  const oldCanvasH = canvas.height || frameHeight;

  gridWidth = Math.max(8, Math.round(frameWidth / settings.tileSize));
  gridHeight = Math.max(8, Math.round(frameHeight / settings.tileSize));
  canvas.width = gridWidth * settings.tileSize;
  canvas.height = gridHeight * settings.tileSize;
  frameWidth = canvas.width;
  frameHeight = canvas.height;
  canvasFrame.style.width = `${frameWidth}px`;
  canvasFrame.style.height = `${frameHeight}px`;

  ownership = remapOwnership(oldOwnership, oldW, oldH, gridWidth, gridHeight);
  grid = Array.from({ length: gridWidth * gridHeight }, (_, idx) => ({
    x: (idx % gridWidth) * settings.tileSize,
    y: Math.floor(idx / gridWidth) * settings.tileSize
  }));

  const scaleX = canvas.width / oldCanvasW;
  const scaleY = canvas.height / oldCanvasH;
  if (balls.length === 0) {
    createBalls();
  } else {
    balls = balls.map((b) => ({
      ...b,
      x: b.x * scaleX,
      y: b.y * scaleY,
      vx: b.vx * scaleX,
      vy: b.vy * scaleY,
      history: (b.history || []).map((p) => ({ x: p.x * scaleX, y: p.y * scaleY }))
    }));
  }
}

function createBalls() {
  const base = minSpeed + (maxSpeed - minSpeed) * 0.32;
  balls = [
    { owner: 0, x: canvas.width * 0.25, y: canvas.height * 0.5, vx: base, vy: -base, history: [] },
    { owner: 1, x: canvas.width * 0.75, y: canvas.height * 0.5, vx: -base, vy: base, history: [] }
  ];
}

function resetGame() {
  ownership = Array.from({ length: gridWidth * gridHeight }, (_, idx) => (idx % gridWidth < gridWidth / 2 ? 0 : 1));
  createBalls();
}

function togglePlayPause() {
  isPlaying = !isPlaying;
  syncPlayPauseButtons();
  if (isPlaying) {
    animationFrameId = requestAnimationFrame(render);
  } else {
    cancelAnimationFrame(animationFrameId);
  }
}

function toggleSettings(open) {
  const shouldOpen = open ?? !configPanel.classList.contains("open");
  configPanel.classList.toggle("open", shouldOpen);
  configBtn.classList.toggle("is-active", shouldOpen);
  chromeControls.classList.toggle("hidden", shouldOpen);
  drawerOverlay.classList.toggle("visible", shouldOpen);
  document.body.classList.toggle("drawer-open", shouldOpen);
  configBtn.setAttribute("aria-pressed", shouldOpen);
  configBtn.setAttribute("aria-expanded", shouldOpen);
  if (shouldOpen) {
    chromeControls.classList.remove("is-revealed");
  } else if (!settings.autoHideChrome) {
    chromeControls.classList.add("is-revealed");
  } else {
    hideChromeAfterDelay(600);
  }
  updateFullscreenHint();
}

function buildBallPalette(baseHex, accentHex) {
  const light = luminance(baseHex) > 0.6;
  const trailBase = mixHex(baseHex, light ? "#0a0d16" : "#ffffff", light ? 0.22 : 0.28);
  return {
    isLight: light,
    outline: mixHex(baseHex, light ? "#000000" : "#ffffff", light ? 0.72 : 0.55),
    rim: mixHex(accentHex, light ? "#0b1e33" : "#ffffff", light ? 0.25 : 0.2),
    depth: mixHex(baseHex, light ? "#0b1e33" : "#ffffff", light ? 0.3 : 0.2),
    trail: liftToContrast(trailBase, 0.4)
  };
}

function setScoreBarVisibility(hidden) {
  scoreNotch.classList.toggle("is-hidden", hidden);
}

function isInRevealZone(x, y) {
  if (revealHotspot) {
    const rect = revealHotspot.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }
  return x > window.innerWidth - 160 && y < 130;
}

function revealChrome(linger = 1400) {
  chromeControls.classList.add("is-revealed");
  if (settings.autoHideChrome && !configPanel.classList.contains("open")) {
    clearTimeout(chromeHideTimeout);
    chromeHideTimeout = setTimeout(() => chromeControls.classList.remove("is-revealed"), linger);
  }
}

function hideChromeAfterDelay(delay = 900) {
  if (!settings.autoHideChrome || configPanel.classList.contains("open")) return;
  clearTimeout(chromeHideTimeout);
  chromeHideTimeout = setTimeout(() => chromeControls.classList.remove("is-revealed"), delay);
}

function applyChromeAutoHideState(enabled) {
  settings.autoHideChrome = enabled;
  chromeControls.classList.toggle("auto-hide", enabled);
  if (revealHotspot) revealHotspot.classList.toggle("is-active", enabled);
  autoHideUiToggle.checked = enabled;
  if (!enabled) {
    chromeControls.classList.add("is-revealed");
    clearTimeout(chromeHideTimeout);
  } else if (!configPanel.classList.contains("open")) {
    hideChromeAfterDelay(500);
  }
}

function handleChromePeek(e) {
  if (!settings.autoHideChrome || configPanel.classList.contains("open")) return;
  if (isInRevealZone(e.clientX, e.clientY)) {
    revealChrome(1800);
  } else {
    hideChromeAfterDelay(800);
  }
}

function drawTile(tile, owner) {
  ctx.fillStyle = owner === 0 ? colors.day : colors.night;
  ctx.fillRect(tile.x, tile.y, settings.tileSize, settings.tileSize);
}

function paintBall(ctxTarget, ball, palette, style, radius) {
  const baseColor = ball.owner === 0 ? colors.day : colors.night;
  const accent = colors.accent;
  ctxTarget.save();
  ctxTarget.translate(ball.x, ball.y);

  if (style === "fill") {
    const grad = ctxTarget.createRadialGradient(-radius * 0.25, -radius * 0.25, radius * 0.18, 0, 0, radius * 1.08);
    grad.addColorStop(0, rgba(mixHex(baseColor, "#ffffff", palette.isLight ? 0.05 : 0.2), 0.98));
    grad.addColorStop(0.55, rgba(mixHex(baseColor, accent, 0.25), 0.92));
    grad.addColorStop(1, rgba(mixHex(baseColor, "#000000", 0.2), 0.92));
    ctxTarget.fillStyle = grad;
    ctxTarget.beginPath();
    ctxTarget.arc(0, 0, radius * 0.96, 0, Math.PI * 2);
    ctxTarget.fill();
    ctxTarget.strokeStyle = rgba(palette.outline, 0.9);
    ctxTarget.lineWidth = Math.max(1.6, radius * 0.16);
    ctxTarget.stroke();

    ctxTarget.strokeStyle = rgba(palette.rim, 0.9);
    ctxTarget.lineWidth = Math.max(1.1, radius * 0.12);
    ctxTarget.beginPath();
    ctxTarget.arc(-radius * 0.12, -radius * 0.12, radius * 0.7, 0, Math.PI * 2);
    ctxTarget.stroke();

    ctxTarget.shadowColor = rgba(palette.outline, 0.35);
    ctxTarget.shadowBlur = 10;
    ctxTarget.beginPath();
    ctxTarget.arc(0, 0, radius * 1.02, 0, Math.PI * 2);
    ctxTarget.stroke();
    ctxTarget.shadowBlur = 0;
  } else if (style === "halo") {
    const contrast = palette.isLight ? colors.night : "#ffffff";
    const halo = ctxTarget.createRadialGradient(0, 0, radius * 0.45, 0, 0, radius * 1.55);
    halo.addColorStop(0, rgba(palette.rim, 0.65));
    halo.addColorStop(0.6, rgba(palette.depth, 0.32));
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctxTarget.fillStyle = halo;
    ctxTarget.beginPath();
    ctxTarget.arc(0, 0, radius * 1.25, 0, Math.PI * 2);
    ctxTarget.fill();

    const ring = ctxTarget.createLinearGradient(-radius, -radius, radius, radius);
    ring.addColorStop(0, rgba(contrast, 0.85));
    ring.addColorStop(1, rgba(palette.rim, 0.95));
    ctxTarget.lineWidth = Math.max(2.4, radius * 0.34);
    ctxTarget.strokeStyle = ring;
    ctxTarget.beginPath();
    ctxTarget.arc(0, 0, radius * 0.9, 0, Math.PI * 2);
    ctxTarget.stroke();

    ctxTarget.strokeStyle = rgba(palette.outline, 0.68);
    ctxTarget.lineWidth = 1.3;
    ctxTarget.beginPath();
    ctxTarget.arc(0, 0, radius * 0.78, 0, Math.PI * 2);
    ctxTarget.stroke();
  } else if (style === "grid") {
    ctxTarget.save();
    ctxTarget.beginPath();
    ctxTarget.arc(0, 0, radius, 0, Math.PI * 2);
    ctxTarget.clip();
    const baseGrad = ctxTarget.createLinearGradient(-radius, -radius, radius, radius);
    baseGrad.addColorStop(0, rgba(mixHex(baseColor, "#ffffff", palette.isLight ? 0.1 : 0.24), 0.95));
    baseGrad.addColorStop(1, rgba(mixHex(baseColor, accent, 0.38), 0.95));
    ctxTarget.fillStyle = baseGrad;
    ctxTarget.fillRect(-radius, -radius, radius * 2, radius * 2);

    ctxTarget.strokeStyle = rgba(palette.outline, 0.9);
    ctxTarget.lineWidth = Math.max(1.8, radius * 0.18);
    ctxTarget.beginPath();
    ctxTarget.moveTo(-radius, -radius * 0.18);
    ctxTarget.lineTo(radius, radius * 0.18);
    ctxTarget.moveTo(-radius * 0.18, radius);
    ctxTarget.lineTo(radius * 0.18, -radius);
    ctxTarget.stroke();

    ctxTarget.strokeStyle = rgba(palette.rim, 0.85);
    ctxTarget.lineWidth = Math.max(1.2, radius * 0.14);
    ctxTarget.setLineDash([radius * 0.35, radius * 0.2]);
    ctxTarget.beginPath();
    ctxTarget.arc(0, 0, radius * 0.58, 0, Math.PI * 2);
    ctxTarget.stroke();
    ctxTarget.setLineDash([]);
    ctxTarget.restore();

    ctxTarget.strokeStyle = rgba(palette.outline, 0.95);
    ctxTarget.lineWidth = Math.max(2, radius * 0.16);
    ctxTarget.beginPath();
    ctxTarget.arc(0, 0, radius * 0.98, 0, Math.PI * 2);
    ctxTarget.stroke();
  } else if (style === "trail") {
    const history = ball.history || [];
    for (let i = 0; i < history.length; i++) {
      const point = history[i];
      const t = 1 - i / Math.max(1, history.length);
      const size = radius * (0.55 + t * 0.35);
      const alpha = 0.08 + t * 0.2;
      ctxTarget.fillStyle = rgba(palette.trail, alpha);
      ctxTarget.beginPath();
      ctxTarget.arc(point.x - ball.x, point.y - ball.y, size, 0, Math.PI * 2);
      ctxTarget.fill();
    }

    const glow = ctxTarget.createRadialGradient(0, 0, radius * 0.25, 0, 0, radius * 1.25);
    glow.addColorStop(0, rgba(palette.rim, 0.7));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctxTarget.fillStyle = glow;
    ctxTarget.beginPath();
    ctxTarget.arc(0, 0, radius * 1.25, 0, Math.PI * 2);
    ctxTarget.fill();

    const grad = ctxTarget.createRadialGradient(-radius * 0.18, -radius * 0.18, radius * 0.12, 0, 0, radius);
    grad.addColorStop(0, rgba(mixHex(baseColor, "#ffffff", palette.isLight ? 0.08 : 0.26), 1));
    grad.addColorStop(1, rgba(palette.depth, 0.72));
    ctxTarget.fillStyle = grad;
    ctxTarget.beginPath();
    ctxTarget.arc(0, 0, radius, 0, Math.PI * 2);
    ctxTarget.fill();

    ctxTarget.strokeStyle = rgba(palette.outline, 0.7);
    ctxTarget.lineWidth = Math.max(1.3, radius * 0.12);
    ctxTarget.setLineDash([4, 4]);
    ctxTarget.beginPath();
    ctxTarget.arc(0, 0, radius + 2, 0, Math.PI * 2);
    ctxTarget.stroke();
    ctxTarget.setLineDash([]);
  } else if (style === "comet") {
    const history = ball.history || [];
    for (let i = 0; i < history.length; i++) {
      const point = history[i];
      const t = 1 - i / Math.max(1, history.length);
      const alpha = 0.05 + t * 0.25;
      const size = radius * (0.45 + t * 0.3);
      ctxTarget.fillStyle = rgba(palette.rim, alpha);
      ctxTarget.beginPath();
      ctxTarget.ellipse(point.x - ball.x, point.y - ball.y, size * 1.3, size * 0.7, Math.atan2(ball.vy, ball.vx), 0, Math.PI * 2);
      ctxTarget.fill();
    }

    const tail = ctxTarget.createLinearGradient(-radius * 1.2, 0, radius * 1.2, 0);
    tail.addColorStop(0, rgba(palette.depth, 0));
    tail.addColorStop(1, rgba(palette.rim, 0.4));
    ctxTarget.fillStyle = tail;
    ctxTarget.beginPath();
    ctxTarget.ellipse(-ball.vx * 0.4, -ball.vy * 0.4, radius * 1.6, radius * 0.8, Math.atan2(ball.vy, ball.vx), 0, Math.PI * 2);
    ctxTarget.fill();

    const head = ctxTarget.createRadialGradient(-radius * 0.18, -radius * 0.18, radius * 0.12, 0, 0, radius);
    head.addColorStop(0, rgba(mixHex(baseColor, "#ffffff", palette.isLight ? 0.08 : 0.26), 1));
    head.addColorStop(1, rgba(palette.depth, 0.6));
    ctxTarget.fillStyle = head;
    ctxTarget.beginPath();
    ctxTarget.arc(0, 0, radius, 0, Math.PI * 2);
    ctxTarget.fill();

    ctxTarget.strokeStyle = rgba(palette.outline, 0.72);
    ctxTarget.lineWidth = Math.max(1.2, radius * 0.12);
    ctxTarget.beginPath();
    ctxTarget.arc(0, 0, radius * 0.82, 0, Math.PI * 2);
    ctxTarget.stroke();
  } else if (style === "spark") {
    const rays = 6;
    for (let i = 0; i < rays; i++) {
      const angle = (Math.PI * 2 * i) / rays;
      const len = radius * 1.1;
      ctxTarget.strokeStyle = rgba(palette.rim, 0.8);
      ctxTarget.lineWidth = Math.max(1.2, radius * 0.1);
      ctxTarget.beginPath();
      ctxTarget.moveTo(Math.cos(angle) * radius * 0.4, Math.sin(angle) * radius * 0.4);
      ctxTarget.lineTo(Math.cos(angle) * len, Math.sin(angle) * len);
      ctxTarget.stroke();
    }

    const core = ctxTarget.createRadialGradient(-radius * 0.12, -radius * 0.12, radius * 0.08, 0, 0, radius * 0.9);
    core.addColorStop(0, rgba(mixHex(baseColor, "#ffffff", 0.22), 1));
    core.addColorStop(1, rgba(palette.depth, 0.65));
    ctxTarget.fillStyle = core;
    ctxTarget.beginPath();
    ctxTarget.arc(0, 0, radius * 0.9, 0, Math.PI * 2);
    ctxTarget.fill();
    ctxTarget.strokeStyle = rgba(palette.outline, 0.8);
    ctxTarget.lineWidth = Math.max(1.1, radius * 0.1);
    ctxTarget.beginPath();
    ctxTarget.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
    ctxTarget.stroke();
  } else {
    const contrastColor = palette.isLight ? colors.night : "#ffffff";
    const glow = ctxTarget.createRadialGradient(0, 0, radius * 0.3, 0, 0, radius * 1.35);
    glow.addColorStop(0, rgba(palette.rim, 0.64));
    glow.addColorStop(0.5, rgba(palette.depth, 0.26));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctxTarget.fillStyle = glow;
    ctxTarget.beginPath();
    ctxTarget.arc(0, 0, radius * 1.32, 0, Math.PI * 2);
    ctxTarget.fill();

    ctxTarget.shadowColor = rgba(palette.rim, 0.7);
    ctxTarget.shadowBlur = 12;
    const ringGrad = ctxTarget.createLinearGradient(-radius, -radius, radius, radius);
    ringGrad.addColorStop(0, rgba(contrastColor, 0.9));
    ringGrad.addColorStop(1, rgba(palette.rim, 0.9));
    ctxTarget.lineWidth = Math.max(2.8, radius * 0.42);
    ctxTarget.strokeStyle = ringGrad;
    ctxTarget.beginPath();
    ctxTarget.arc(0, 0, radius * 0.85, 0, Math.PI * 2);
    ctxTarget.stroke();
    ctxTarget.shadowBlur = 0;

    ctxTarget.strokeStyle = rgba(palette.outline, 0.6);
    ctxTarget.lineWidth = Math.max(1.3, radius * 0.1);
    ctxTarget.beginPath();
    ctxTarget.arc(0, 0, radius * 0.68, 0, Math.PI * 2);
    ctxTarget.stroke();
  }
  ctxTarget.restore();
}
function drawBall(ball) {
  const baseColor = ball.owner === 0 ? colors.day : colors.night;
  const palette = buildBallPalette(baseColor, colors.accent);
  paintBall(ctx, ball, palette, normalizeBallStyle(settings.ballStyle), ballRadius);
}

function detectCollision(ball) {
  const left = ball.x - ballRadius;
  const right = ball.x + ballRadius;
  const top = ball.y - ballRadius;
  const bottom = ball.y + ballRadius;

  grid.forEach((tile, idx) => {
    const tileLeft = tile.x;
    const tileRight = tile.x + settings.tileSize;
    const tileTop = tile.y;
    const tileBottom = tile.y + settings.tileSize;
    if (right > tileLeft && left < tileRight && bottom > tileTop && top < tileBottom && ownership[idx] !== ball.owner) {
      ownership[idx] = ball.owner;
      const dx = ball.x - (tile.x + settings.tileSize / 2);
      const dy = ball.y - (tile.y + settings.tileSize / 2);
      if (Math.abs(dx) > Math.abs(dy)) {
        ball.vx = -ball.vx;
      } else {
        ball.vy = -ball.vy;
      }
    }
  });
}

function checkBoundaries(ball) {
  if (ball.x < ballRadius || ball.x > canvas.width - ballRadius) {
    ball.vx = -ball.vx;
    ball.x = clamp(ball.x, ballRadius, canvas.width - ballRadius);
  }
  if (ball.y < ballRadius || ball.y > canvas.height - ballRadius) {
    ball.vy = -ball.vy;
    ball.y = clamp(ball.y, ballRadius, canvas.height - ballRadius);
  }
}

function updateBall(ball) {
  ball.history = ball.history || [];
  ball.history.unshift({ x: ball.x, y: ball.y });
  const style = normalizeBallStyle(settings.ballStyle);
  const maxHistory = style === "comet" ? 18 : 14;
  if (ball.history.length > maxHistory) ball.history.pop();
  ball.vx += (Math.random() - 0.5) * settings.chaos;
  ball.vy += (Math.random() - 0.5) * settings.chaos;
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed > maxSpeed) {
    const scale = maxSpeed / speed;
    ball.vx *= scale;
    ball.vy *= scale;
  }
  if (speed < minSpeed) {
    const scale = minSpeed / speed;
    ball.vx *= scale;
    ball.vy *= scale;
  }
  ball.x += ball.vx;
  ball.y += ball.vy;
}

function updateScoreUI(dayScore, nightScore, topHalfRatio, centroid) {
  const total = dayScore + nightScore || 1;
  const dayRatio = dayScore / total;
  scoreDayLabel.textContent = `Light ${dayScore}`;
  scoreNightLabel.textContent = `Dark ${nightScore}`;
  scoreDayBar.style.width = `${dayRatio * 100}%`;
  scoreNightBar.style.width = `${(1 - dayRatio) * 100}%`;
  const overlayNeeded = frameWidth > window.innerWidth * 0.85 || frameHeight > window.innerHeight * 0.75;
  scoreNotch.classList.toggle("overlay", overlayNeeded);
  updateDynamicBackground(dayRatio, topHalfRatio, centroid);
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  let dayScore = 0;
  let nightScore = 0;
  let topDay = 0;
  let topTotal = 0;
  let dayMassX = 0;
  let dayMassY = 0;

  grid.forEach((tile, idx) => {
    const owner = ownership[idx];
    drawTile(tile, owner);
    if (owner === 0) {
      dayScore++;
      dayMassX += tile.x + settings.tileSize * 0.5;
      dayMassY += tile.y + settings.tileSize * 0.5;
    } else {
      nightScore++;
    }
    if (tile.y < canvas.height / 2) {
      topTotal++;
      if (owner === 0) topDay++;
    }
  });

  balls.forEach((ball) => {
    drawBall(ball);
    detectCollision(ball);
    checkBoundaries(ball);
    updateBall(ball);
  });

  const topHalfRatio = topTotal ? topDay / topTotal : 0.5;
  const centroid =
    dayScore > 0
      ? { x: (dayMassX / dayScore) / canvas.width, y: (dayMassY / dayScore) / canvas.height }
      : { x: 0.5, y: 0.5 };
  updateScoreUI(dayScore, nightScore, topHalfRatio, centroid);

  if (isPlaying) {
    animationFrameId = requestAnimationFrame(render);
  }
}

function scatterStart() {
  ownership = ownership.map(() => (Math.random() > 0.5 ? 1 : 0));
  refreshBackgroundSeed();
  renderIfPaused();
}

function swapSides() {
  ownership = ownership.map((owner) => (owner === 0 ? 1 : 0));
  const [first, second] = balls;
  balls = [
    {
      ...first,
      owner: 1,
      x: canvas.width * 0.75,
      y: canvas.height * 0.5,
      vx: -Math.abs(first.vx),
      vy: first.vy,
      history: []
    },
    {
      ...second,
      owner: 0,
      x: canvas.width * 0.25,
      y: canvas.height * 0.5,
      vx: Math.abs(second.vx),
      vy: second.vy,
      history: []
    }
  ];
}

function applyTheme(key, { skipSave } = {}) {
  settings.themeKey = key;
  const theme = key === "custom" ? { day: settings.dayColor, night: settings.nightColor, accent: settings.accentColor } : getThemeByKey(key);
  settings.dayColor = theme.day;
  settings.nightColor = theme.night;
  settings.accentColor = theme.accent;
  colors.day = settings.dayColor;
  colors.night = settings.nightColor;
  colors.accent = settings.accentColor;
  dayColorInput.value = colors.day;
  nightColorInput.value = colors.night;
  updateCssPalette();
  refreshBackgroundSeed();
  updateDynamicBackground();
  updateThemeUI();
  if (!skipSave) saveSettingsToStorage();
}

function updateThemeUI() {
  const theme = settings.themeKey === "custom" ? { label: "Custom picks" } : getThemeByKey(settings.themeKey);
  themeLabel.textContent = theme.label || "Palette";
  themeSwatches.innerHTML = "";
  ["day", "night", "accent"].forEach((slot) => {
    const sw = document.createElement("span");
    const val = slot === "day" ? colors.day : slot === "night" ? colors.night : colors.accent;
    sw.style.background = val;
    themeSwatches.appendChild(sw);
  });
  themePanel.querySelectorAll(".picker__option").forEach((opt) => {
    opt.classList.toggle("is-active", opt.dataset.key === settings.themeKey);
    if (opt.dataset.key === "custom") {
      const swatches = opt.querySelectorAll(".picker__swatch");
      [colors.day, colors.night, colors.accent].forEach((clr, idx) => {
        if (swatches[idx]) swatches[idx].style.background = clr;
      });
    }
  });
  updateBallPickerPreviews();
}

function updateBallUI() {
  const style = ballStyles.find((b) => b.key === normalizeBallStyle(settings.ballStyle)) || ballStyles[0];
  ballLabel.textContent = style.label;
  ensureBallCanvas(ballSwatch, style.key);
  ballPanel.querySelectorAll(".picker__option").forEach((opt) => {
    opt.classList.toggle("is-active", opt.dataset.key === style.key);
  });
}

function buildThemePicker() {
  themePanel.innerHTML = "";
  const options = [...themeList, { key: "custom", label: "Custom picks" }];
  options.forEach((theme) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "picker__option";
    option.dataset.key = theme.key;
    option.setAttribute("role", "option");
    const name = document.createElement("div");
    name.className = "picker__name";
    name.textContent = theme.label;
    const swatchRow = document.createElement("div");
    swatchRow.className = "picker__swatch-row";
    const colorsToUse =
      theme.key === "custom"
        ? [colors.day, colors.night, colors.accent]
        : [theme.day, theme.night, theme.accent];
    colorsToUse.forEach((clr) => {
      const sw = document.createElement("div");
      sw.className = "picker__swatch";
      sw.style.background = clr;
      swatchRow.appendChild(sw);
    });
    option.appendChild(name);
    option.appendChild(swatchRow);
    option.addEventListener("click", () => {
      applyTheme(theme.key);
      closePickers();
      renderIfPaused();
    });
    themePanel.appendChild(option);
  });
  updateThemeUI();
}

function buildBallPicker() {
  ballPanel.innerHTML = "";
  ballStyles.forEach((style) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "picker__option";
    option.dataset.key = style.key;
    option.setAttribute("role", "option");
    const previewWrap = document.createElement("div");
    previewWrap.className = "ball-preview";
    const canvas = document.createElement("canvas");
    canvas.className = "ball-preview__canvas";
    previewWrap.appendChild(canvas);
    const name = document.createElement("div");
    name.className = "picker__name";
    name.textContent = style.label;
    option.appendChild(previewWrap);
    option.appendChild(name);
    renderBallPreview(style.key, canvas);
    option.addEventListener("click", () => {
      setBallStyle(style.key);
      closePickers();
      renderIfPaused();
    });
    ballPanel.appendChild(option);
  });
  updateBallUI();
}

function closePickers(except) {
  if (themePicker !== except) {
    themePicker.classList.remove("open");
    themeSelected.setAttribute("aria-expanded", "false");
  }
  if (ballPicker !== except) {
    ballPicker.classList.remove("open");
    ballSelected.setAttribute("aria-expanded", "false");
  }
}

function togglePicker(pickerEl, buttonEl) {
  const isOpen = pickerEl.classList.contains("open");
  closePickers(isOpen ? null : pickerEl);
  pickerEl.classList.toggle("open", !isOpen);
  buttonEl.setAttribute("aria-expanded", String(!isOpen));
}

function setBallStyle(key, { skipSave } = {}) {
  settings.ballStyle = normalizeBallStyle(key);
  updateBallRadius();
  updateBallUI();
  if (!skipSave) saveSettingsToStorage();
}

function ensureBallCanvas(container, styleKey) {
  let canvas = container.querySelector("canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "ball-preview__canvas";
    container.innerHTML = "";
    container.appendChild(canvas);
  }
  renderBallPreview(styleKey, canvas);
}

function renderBallPreview(styleKey, canvas) {
  const ctxPrev = canvas.getContext("2d");
  const size = 60;
  canvas.width = size;
  canvas.height = size;
  ctxPrev.clearRect(0, 0, size, size);
  const tileBg = ctxPrev.createLinearGradient(0, 0, size, size);
  tileBg.addColorStop(0, rgba(colors.night, 0.82));
  tileBg.addColorStop(1, rgba(colors.night, 0.9));
  ctxPrev.fillStyle = tileBg;
  ctxPrev.fillRect(0, 0, size, size);
  ctxPrev.strokeStyle = rgba("#ffffff", 0.08);
  ctxPrev.lineWidth = 1;
  ctxPrev.strokeRect(0.5, 0.5, size - 1, size - 1);
  const radius = size * 0.22;
  const ball = {
    owner: 0,
    x: size * 0.52,
    y: size * 0.52,
    vx: 2.4,
    vy: -1.2,
    history: [
      { x: size * 0.52 - 6, y: size * 0.52 - 6 },
      { x: size * 0.52 - 12, y: size * 0.52 - 10 },
      { x: size * 0.52 - 18, y: size * 0.52 - 12 }
    ]
  };
  const palette = buildBallPalette(colors.day, colors.accent);
  paintBall(ctxPrev, ball, palette, styleKey, radius);
}

function updateBallPickerPreviews() {
  const currentStyle = normalizeBallStyle(settings.ballStyle);
  ballPanel.querySelectorAll(".picker__option").forEach((opt) => {
    const key = opt.dataset.key;
    const canvas = opt.querySelector("canvas");
    if (canvas) renderBallPreview(key, canvas);
    opt.classList.toggle("is-active", key === currentStyle);
  });
  ensureBallCanvas(ballSwatch, currentStyle);
}

function resetSettingsToDefault() {
  Object.assign(settings, { ...defaultSettings });
  const theme = getThemeByKey(settings.themeKey);
  settings.dayColor = theme.day;
  settings.nightColor = theme.night;
  settings.accentColor = theme.accent;
  settings.tileSize = nonLinearTileSize(settings.tileSizeRaw);
  settings.chaos = nonLinearChaos(settings.chaosRaw);
  colors.day = settings.dayColor;
  colors.night = settings.nightColor;
  colors.accent = settings.accentColor;
  dayColorInput.value = colors.day;
  nightColorInput.value = colors.night;
  tileSizeInput.value = settings.tileSizeRaw;
  tileSizeValue.textContent = `${settings.tileSize}px`;
  chaosInput.value = settings.chaosRaw;
  chaosValue.textContent = settings.chaos.toFixed(2);
  setSpeedMood(settings.speedMood);
  updateCssPalette();
  updateThemeUI();
  setBallStyle(settings.ballStyle, { skipSave: true });
  updateBallRadius();
  rebuildGrid(true);
  setScoreBarVisibility(settings.hideScoreBar);
  applyChromeAutoHideState(settings.autoHideChrome);
  saveSettingsToStorage();
  updateBallPickerPreviews();
  updateDynamicBackground();
  renderIfPaused();
}

function attachDragResize() {
  let activeCorner = null;
  let startPos = { x: 0, y: 0, w: 0, h: 0, dist: 1, centerX: 0, centerY: 0 };

  function onMove(e) {
    if (!activeCorner) return;
    e.preventDefault();
    const dx = e.clientX - startPos.x;
    const dy = e.clientY - startPos.y;
    const dist = Math.max(10, Math.hypot(e.clientX - startPos.centerX, e.clientY - startPos.centerY));
    const scale = clamp(dist / startPos.dist, 0.4, 3);
    const targetW = startPos.w * scale;
    const targetH = startPos.h * scale;
    pendingSize = { w: targetW, h: targetH };
    if (!resizeRaf) {
      resizeRaf = requestAnimationFrame(() => {
        if (pendingSize) {
          setFrameSize(pendingSize.w, pendingSize.h, true);
          pendingSize = null;
        }
        resizeRaf = null;
      });
    }
  }

  function onUp() {
    activeCorner = null;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  }

  dragHandles.forEach((handle) => {
    handle.addEventListener("mousedown", (e) => {
      activeCorner = handle.dataset.corner;
      const rect = canvasFrame.getBoundingClientRect();
      startPos = {
        x: e.clientX,
        y: e.clientY,
        w: frameWidth,
        h: frameHeight,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
        dist: Math.max(10, Math.hypot(e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2)))
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  });
}

function initControls() {
  buildThemePicker();
  buildBallPicker();
  attachSpeedDial();
  applyTheme(settings.themeKey, { skipSave: true });

  tileSizeInput.addEventListener("input", (e) => {
    settings.tileSizeRaw = Number(e.target.value);
    settings.tileSize = nonLinearTileSize(settings.tileSizeRaw);
    tileSizeValue.textContent = `${settings.tileSize}px`;
    updateBallRadius();
    rebuildGrid(true);
    saveSettingsToStorage();
  });

  chaosInput.addEventListener("input", (e) => {
    settings.chaosRaw = Number(e.target.value);
    settings.chaos = nonLinearChaos(settings.chaosRaw);
    chaosValue.textContent = settings.chaos.toFixed(2);
    saveSettingsToStorage();
  });

  dayColorInput.addEventListener("input", (e) => {
    colors.day = e.target.value;
    settings.dayColor = colors.day;
    settings.themeKey = "custom";
    updateCssPalette();
    updateThemeUI();
    updateDynamicBackground();
    saveSettingsToStorage();
    renderIfPaused();
  });

  nightColorInput.addEventListener("input", (e) => {
    colors.night = e.target.value;
    settings.nightColor = colors.night;
    settings.themeKey = "custom";
    updateCssPalette();
    updateThemeUI();
    updateDynamicBackground();
    saveSettingsToStorage();
    renderIfPaused();
  });

  themeSelected.addEventListener("click", () => togglePicker(themePicker, themeSelected));
  ballSelected.addEventListener("click", () => togglePicker(ballPicker, ballSelected));
  document.addEventListener("click", (e) => {
    if (!themePicker.contains(e.target) && !ballPicker.contains(e.target)) {
      closePickers();
    }
  });

  hideScoreToggle.addEventListener("change", (e) => {
    settings.hideScoreBar = e.target.checked;
    setScoreBarVisibility(settings.hideScoreBar);
    saveSettingsToStorage();
  });

  autoHideUiToggle.addEventListener("change", (e) => {
    applyChromeAutoHideState(e.target.checked);
    if (e.target.checked) {
      revealChrome(1600);
    } else {
      chromeControls.classList.add("is-revealed");
    }
    saveSettingsToStorage();
  });

  drawerResetSettings.addEventListener("click", resetSettingsToDefault);

  playPauseBtn.addEventListener("click", togglePlayPause);
  resetBtn.addEventListener("click", () => {
    resetGame();
    if (!isPlaying) togglePlayPause();
  });
  if (fullscreenHint) {
    fullscreenHint.addEventListener("click", () => toggleFullscreen(true));
  }
  drawerFullscreen.addEventListener("click", () => toggleFullscreen());

  drawerPlayPause.addEventListener("click", togglePlayPause);
  drawerReset.addEventListener("click", () => {
    resetGame();
    renderIfPaused();
  });

  configBtn.addEventListener("click", () => toggleSettings(true));
  closeConfigBtn.addEventListener("click", () => toggleSettings(false));
  drawerOverlay.addEventListener("click", () => toggleSettings(false));

  scatterBtn.addEventListener("click", scatterStart);
  swapSidesBtn.addEventListener("click", swapSides);

  document.addEventListener("keydown", (e) => {
    if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
    if (e.code === "Space") {
      e.preventDefault();
      togglePlayPause();
    }
    if (e.key.toLowerCase() === "s") toggleSettings();
  });

  window.addEventListener("resize", () => {
    if (isImmersive || isNativeFullscreen) {
      setFrameSize(window.innerWidth, window.innerHeight, true);
    } else {
      const maxW = Math.max(420, window.innerWidth - 48);
      const maxH = Math.max(420, window.innerHeight - 64);
      frameWidth = Math.min(frameWidth, maxW);
      frameHeight = Math.min(frameHeight, maxH);
      rebuildGrid(true);
      updateFullscreenHint();
    }
  });

  window.addEventListener("mousemove", handleChromePeek);
  chromeControls.addEventListener("mouseenter", () => {
    if (!settings.autoHideChrome) return;
    clearTimeout(chromeHideTimeout);
    chromeControls.classList.add("is-revealed");
  });
  chromeControls.addEventListener("mouseleave", () => hideChromeAfterDelay(650));

  attachDragResize();

  // Initialize displays from loaded settings
  tileSizeInput.value = settings.tileSizeRaw;
  tileSizeValue.textContent = `${settings.tileSize}px`;
  chaosInput.value = settings.chaosRaw;
  chaosValue.textContent = settings.chaos.toFixed(2);
  setSpeedMood(settings.speedMood);
  setBallStyle(settings.ballStyle, { skipSave: true });
  hideScoreToggle.checked = settings.hideScoreBar;
  autoHideUiToggle.checked = settings.autoHideChrome;
  setScoreBarVisibility(settings.hideScoreBar);
  applyChromeAutoHideState(settings.autoHideChrome);
  syncPlayPauseButtons();
  updateFullscreenHint();
  if (settings.autoHideChrome) {
    revealChrome(1600);
  } else {
    chromeControls.classList.add("is-revealed");
  }
}

function start() {
  ["fullscreenchange", "webkitfullscreenchange"].forEach((evt) => {
    document.addEventListener(evt, handleFullscreenChange);
  });
  hydrateSettings();
  initControls();
  refreshBackgroundSeed();
  isImmersive = true;
  document.body.classList.add("is-immersive");
  const initialW = window.innerWidth;
  const initialH = window.innerHeight;
  setFrameSize(initialW, initialH, false);
  resetGame();
  animationFrameId = requestAnimationFrame(render);
}

start();
