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

const themeSelect = document.querySelector("#themeSelect");
const dayColorInput = document.querySelector("#dayColorInput");
const nightColorInput = document.querySelector("#nightColorInput");
const tileSizeInput = document.querySelector("#tileSizeInput");
const tileSizeValue = document.querySelector("#tileSizeValue");
const speedInput = document.querySelector("#speedInput");
const speedValue = document.querySelector("#speedValue");
const chaosInput = document.querySelector("#chaosInput");
const chaosValue = document.querySelector("#chaosValue");
const scatterBtn = document.querySelector("#scatterBtn");
const swapSidesBtn = document.querySelector("#swapSidesBtn");
const ballStyleSelect = document.querySelector("#ballStyleSelect");

const scoreNotch = document.querySelector("#scoreNotch");
const scoreDayLabel = document.querySelector("#dayScoreLabel");
const scoreNightLabel = document.querySelector("#nightScoreLabel");
const scoreDayBar = scoreNotch.querySelector(".score-notch__day");
const scoreNightBar = scoreNotch.querySelector(".score-notch__night");

const dragHandles = document.querySelectorAll(".corner-handle");

const themes = {
  creamSolar: { label: "Cream + Solar Blue", day: "#f7f2e9", night: "#0b3a67", accent: "#f08c42" },
  duskLilac: { label: "Dusked Lilac", day: "#f6e8ff", night: "#201430", accent: "#cfa3ff" },
  mossSea: { label: "Moss & Sea", day: "#e8f1e2", night: "#0f2b2e", accent: "#6ed0b6" },
  emberGlass: { label: "Ember Glass", day: "#f8ead8", night: "#261213", accent: "#ff7a66" },
  glacier: { label: "Glacier Fade", day: "#e9f4ff", night: "#0d203c", accent: "#7cc7ff" },
  auroraMist: { label: "Aurora Mist", day: "#e4f4ff", night: "#0b1e33", accent: "#7de4ff" },
  canyonRose: { label: "Canyon Rose", day: "#fff1e6", night: "#2c1a1f", accent: "#ff9c73" },
  orchardDrift: { label: "Orchard Drift", day: "#f0f6e8", night: "#0f2416", accent: "#8ee067" }
};

const settings = {
  themeKey: "auroraMist",
  tileSize: 22,
  speedMood: 1,
  chaos: 0.14,
  ballStyle: "ring"
};

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
let lastSpeedRaw = Number(speedInput.value || 40);
let isImmersive = false;
let savedSize = null;

const colors = {
  day: themes[settings.themeKey].day,
  night: themes[settings.themeKey].night,
  accent: themes[settings.themeKey].accent
};

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

function hexToRgb(hex) {
  const parsed = hex.replace("#", "");
  const bigint = parseInt(parsed, 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

function mixColors(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const r = Math.round(ca.r + (cb.r - ca.r) * t);
  const g = Math.round(ca.g + (cb.g - ca.g) * t);
  const bVal = Math.round(ca.b + (cb.b - ca.b) * t);
  return `rgb(${r}, ${g}, ${bVal})`;
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
  if (!backgroundSeed) refreshBackgroundSeed();
  const horizon = mixColors(colors.night, colors.day, clamp(0.24 + dayRatio * 0.46, 0, 1));
  const mid = mixColors(colors.day, colors.night, clamp(0.32 + topHalfRatio * 0.25, 0, 1));
  const depth = mixColors(colors.night, colors.day, clamp(0.1 + (1 - dayRatio) * 0.32, 0, 1));
  const accentGlow = rgba(colors.accent, 0.22);
  const haze = rgba(colors.day, 0.16);
  const shadow = rgba(colors.night, 0.25);

  const centerBiasX = 0.2 * (centroid.x - 0.5);
  const centerBiasY = 0.18 * (centroid.y - 0.5);
  const accentX = clamp(backgroundSeed.accentX + centerBiasX, 0.06, 0.92);
  const accentY = clamp(backgroundSeed.accentY + centerBiasY, 0.04, 0.9);
  const ambientX = clamp(backgroundSeed.ambientX - centerBiasX * 0.6, 0.06, 0.92);
  const ambientY = clamp(backgroundSeed.ambientY + centerBiasY * 0.4, 0.04, 0.9);
  const depthX = clamp(backgroundSeed.depthX + centerBiasX * 0.8, 0.02, 0.98);

  document.body.style.background = `radial-gradient(78% 70% at ${accentX * 100}% ${
    accentY * 100
  }%, ${accentGlow}, transparent 45%), radial-gradient(90% 80% at ${ambientX * 100}% ${ambientY * 100}%, ${haze}, transparent 58%), radial-gradient(120% 120% at ${
    depthX * 100
  }% 86%, ${shadow}, transparent 72%), linear-gradient(${
    backgroundSeed.angle
  }deg, ${horizon} 0%, ${mid} 44%, ${depth} 100%)`;
}

function populateThemes() {
  Object.entries(themes).forEach(([key, value]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = value.label;
    themeSelect.appendChild(option);
  });
  const customOption = document.createElement("option");
  customOption.value = "custom";
  customOption.textContent = "Custom (pickers)";
  themeSelect.appendChild(customOption);
  themeSelect.value = settings.themeKey;
}

function nonLinearTileSize(raw) {
  const min = 14;
  const max = 52;
  const t = Math.pow(raw / 100, 1.7);
  return Math.round(min + t * (max - min));
}

function nonLinearSpeed(raw) {
  const t = clamp(raw / 100, 0, 1);
  const soft = Math.pow(t, 1.45) * 2.2;
  const punch = Math.pow(t, 3.1) * 4.4;
  const fine = t * 0.4;
  return 0.55 + soft + punch + fine;
}

function nonLinearChaos(raw) {
  const t = Math.pow(raw / 100, 2.4);
  return parseFloat((t * 1.1).toFixed(3));
}

function updateBallRadius() {
  const scale = settings.ballStyle === "ring" ? 0.46 : settings.ballStyle === "halo" ? 0.48 : 0.42;
  ballRadius = settings.tileSize * scale;
}

function updateDerived() {
  const baseMin = 2.8;
  const baseMax = 7.6;
  minSpeed = baseMin + settings.speedMood * 0.9;
  maxSpeed = baseMax + settings.speedMood * 2.8;
}

function applySpeedResponse(raw) {
  const target = nonLinearSpeed(raw);
  const delta = Math.abs(raw - lastSpeedRaw) / 100;
  const resistance = clamp(0.25 + delta * 0.55, 0.25, 0.8);
  const jumpAssist = clamp(Math.pow(delta, 1.2) * 0.9, 0, 1.1);
  const boostedTarget = target + jumpAssist * target * 0.18;
  settings.speedMood = settings.speedMood + (boostedTarget - settings.speedMood) * (1 - resistance);
  speedValue.textContent = `${settings.speedMood.toFixed(2)}x`;
  updateDerived();
  lastSpeedRaw = raw;
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
  const nearFull = frameWidth >= window.innerWidth * 0.8 || frameHeight >= window.innerHeight * 0.8;
  const show = nearFull && !isImmersive && !configPanel.classList.contains("open");
  fullscreenHint.classList.toggle("visible", show);
  drawerFullscreen.textContent = isImmersive ? "Exit fullscreen" : "Fullscreen";
  fullscreenHint.title = isImmersive ? "Exit fullscreen" : "Enter fullscreen";
}

function enterFullscreen() {
  if (isImmersive) return;
  savedSize = { w: frameWidth, h: frameHeight };
  isImmersive = true;
  document.body.classList.add("is-immersive");
  const targetW = window.innerWidth - 32;
  const targetH = window.innerHeight - 140;
  setFrameSize(targetW, targetH, true);
  updateFullscreenHint();
}

function exitFullscreen() {
  if (!isImmersive) return;
  isImmersive = false;
  document.body.classList.remove("is-immersive");
  const target = savedSize || { w: clamp(Math.min(window.innerWidth - 120, 900), 420, window.innerWidth - 48), h: clamp(Math.min(window.innerHeight - 160, 900), 420, window.innerHeight - 64) };
  setFrameSize(target.w, target.h, true);
  updateFullscreenHint();
}

function toggleFullscreen(force) {
  const shouldEnter = force !== undefined ? force : !isImmersive;
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
  const marginW = isImmersive ? 20 : 48;
  const marginH = isImmersive ? 40 : 64;
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

  gridWidth = Math.max(8, Math.floor(frameWidth / settings.tileSize));
  gridHeight = Math.max(8, Math.floor(frameHeight / settings.tileSize));
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
      vy: b.vy * scaleY
    }));
  }
}

function createBalls() {
  const base = minSpeed + (maxSpeed - minSpeed) * 0.32;
  balls = [
    { owner: 0, x: canvas.width * 0.25, y: canvas.height * 0.5, vx: base, vy: -base },
    { owner: 1, x: canvas.width * 0.75, y: canvas.height * 0.5, vx: -base, vy: base }
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
  updateFullscreenHint();
}

function drawTile(tile, owner) {
  ctx.fillStyle = owner === 0 ? colors.day : colors.night;
  ctx.fillRect(tile.x, tile.y, settings.tileSize, settings.tileSize);
}

function drawBall(ball) {
  ctx.save();
  ctx.translate(ball.x, ball.y);
  const baseColor = ball.owner === 0 ? colors.day : colors.night;
  const accent = colors.accent;

  if (settings.ballStyle === "solid") {
    const grad = ctx.createRadialGradient(-ballRadius * 0.35, -ballRadius * 0.35, ballRadius * 0.2, 0, 0, ballRadius);
    grad.addColorStop(0, rgba(baseColor, 0.95));
    grad.addColorStop(0.6, mixColors(baseColor, accent, 0.22));
    grad.addColorStop(1, mixColors(baseColor, accent, 0.45));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, ballRadius * 0.95, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.55);
    ctx.lineWidth = Math.max(1.4, ballRadius * 0.18);
    ctx.stroke();
  } else if (settings.ballStyle === "halo") {
    const halo = ctx.createRadialGradient(0, 0, ballRadius * 0.35, 0, 0, ballRadius * 1.4);
    const contrast = ball.owner === 0 ? colors.night : "#ffffff";
    halo.addColorStop(0, rgba(accent, 0.45));
    halo.addColorStop(0.45, rgba(baseColor, 0.16));
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, ballRadius * 1.2, 0, Math.PI * 2);
    ctx.fill();

    const ring = ctx.createLinearGradient(-ballRadius, 0, ballRadius, 0);
    ring.addColorStop(0, rgba(baseColor, 0.8));
    ring.addColorStop(1, rgba(accent, 0.8));
    ctx.lineWidth = Math.max(2, ballRadius * 0.32);
    ctx.strokeStyle = ring;
    ctx.beginPath();
    ctx.arc(0, 0, ballRadius * 0.92, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = rgba(contrast, 0.6);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, ballRadius * 0.82, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.shadowColor = rgba(accent, 0.45);
    ctx.shadowBlur = 12;
    const ringGrad = ctx.createLinearGradient(-ballRadius, -ballRadius, ballRadius, ballRadius);
    ringGrad.addColorStop(0, rgba(baseColor, 0.85));
    ringGrad.addColorStop(1, rgba(accent, 0.85));
    ctx.lineWidth = Math.max(2.4, ballRadius * 0.38);
    ctx.strokeStyle = ringGrad;
    ctx.beginPath();
    ctx.arc(0, 0, ballRadius * 0.9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = rgba(baseColor, 0.12);
    ctx.beginPath();
    ctx.arc(0, 0, ballRadius * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(baseColor, 0.42);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, ballRadius * 0.6, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
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
  scoreDayLabel.textContent = `Day ${dayScore}`;
  scoreNightLabel.textContent = `Night ${nightScore}`;
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
    { ...first, owner: 1, x: canvas.width * 0.75, y: canvas.height * 0.5, vx: -Math.abs(first.vx), vy: first.vy },
    { ...second, owner: 0, x: canvas.width * 0.25, y: canvas.height * 0.5, vx: Math.abs(second.vx), vy: second.vy }
  ];
}

function applyTheme(key) {
  if (key === "custom") return;
  settings.themeKey = key;
  const theme = themes[key];
  colors.day = theme.day;
  colors.night = theme.night;
  colors.accent = theme.accent;
  dayColorInput.value = theme.day;
  nightColorInput.value = theme.night;
  updateCssPalette();
  refreshBackgroundSeed();
  updateDynamicBackground();
}

function initControls() {
  populateThemes();
  themeSelect.value = settings.themeKey;
  applyTheme(settings.themeKey);
  updateDerived();

  tileSizeInput.addEventListener("input", (e) => {
    settings.tileSize = nonLinearTileSize(Number(e.target.value));
    tileSizeValue.textContent = `${settings.tileSize}px`;
    updateBallRadius();
    rebuildGrid(true);
  });

  speedInput.addEventListener("input", (e) => {
    applySpeedResponse(Number(e.target.value));
  });

  chaosInput.addEventListener("input", (e) => {
    settings.chaos = nonLinearChaos(Number(e.target.value));
    chaosValue.textContent = settings.chaos.toFixed(2);
  });

  themeSelect.addEventListener("change", (e) => {
    applyTheme(e.target.value);
    renderIfPaused();
  });

  dayColorInput.addEventListener("input", (e) => {
    colors.day = e.target.value;
    themeSelect.value = "custom";
    updateCssPalette();
    updateDynamicBackground();
    renderIfPaused();
  });

  nightColorInput.addEventListener("input", (e) => {
    colors.night = e.target.value;
    themeSelect.value = "custom";
    updateCssPalette();
    updateDynamicBackground();
    renderIfPaused();
  });

  ballStyleSelect.addEventListener("change", (e) => {
    settings.ballStyle = e.target.value;
    updateBallRadius();
    renderIfPaused();
  });

  playPauseBtn.addEventListener("click", togglePlayPause);
  resetBtn.addEventListener("click", () => {
    resetGame();
    if (!isPlaying) togglePlayPause();
  });

  fullscreenHint.addEventListener("click", () => toggleFullscreen(true));
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
    if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
    if (e.code === "Space") {
      e.preventDefault();
      togglePlayPause();
    }
    if (e.key.toLowerCase() === "s") toggleSettings();
  });

  window.addEventListener("resize", () => {
    if (isImmersive) {
      setFrameSize(window.innerWidth - 32, window.innerHeight - 140, true);
    } else {
      const maxW = Math.max(420, window.innerWidth - 48);
      const maxH = Math.max(420, window.innerHeight - 64);
      frameWidth = Math.min(frameWidth, maxW);
      frameHeight = Math.min(frameHeight, maxH);
      rebuildGrid(true);
      updateFullscreenHint();
    }
  });

  // Initialize slider displays from defaults
  tileSizeInput.value = 45;
  speedInput.value = 40;
  chaosInput.value = 40;
  lastSpeedRaw = Number(speedInput.value);
  settings.tileSize = nonLinearTileSize(Number(tileSizeInput.value));
  settings.speedMood = nonLinearSpeed(lastSpeedRaw);
  settings.chaos = nonLinearChaos(Number(chaosInput.value));
  tileSizeValue.textContent = `${settings.tileSize}px`;
  speedValue.textContent = `${settings.speedMood.toFixed(2)}x`;
  chaosValue.textContent = settings.chaos.toFixed(2);
  updateBallRadius();
  updateDerived();
  ballStyleSelect.value = settings.ballStyle;
  syncPlayPauseButtons();
  updateFullscreenHint();
}

function start() {
  initControls();
  refreshBackgroundSeed();
  const initialW = clamp(Math.min(window.innerWidth - 120, 900), 420, window.innerWidth - 48);
  const initialH = clamp(Math.min(window.innerHeight - 160, 900), 420, window.innerHeight - 64);
  setFrameSize(initialW, initialH, false);
  resetGame();
  animationFrameId = requestAnimationFrame(render);
}

start();
