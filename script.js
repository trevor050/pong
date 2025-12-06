const canvasFrame = document.querySelector("#canvasFrame");
const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");

const playPauseBtn = document.querySelector("#playPauseBtn");
const resetBtn = document.querySelector("#resetBtn");
const configBtn = document.querySelector("#configBtn");
const closeConfigBtn = document.querySelector("#closeConfig");
const configPanel = document.querySelector("#configPanel");

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

const scoreNotch = document.querySelector("#scoreNotch");
const scoreDayLabel = document.querySelector("#dayScoreLabel");
const scoreNightLabel = document.querySelector("#nightScoreLabel");
const scoreDayBar = scoreNotch.querySelector(".score-notch__day");
const scoreNightBar = scoreNotch.querySelector(".score-notch__night");

const dragHandles = document.querySelectorAll(".drag-handle");

const themes = {
  creamSolar: { label: "Cream + Solar Blue", day: "#f7f2e9", night: "#0b3a67", accent: "#f08c42" },
  duskLilac: { label: "Dusked Lilac", day: "#f6e8ff", night: "#201430", accent: "#cfa3ff" },
  mossSea: { label: "Moss & Sea", day: "#e8f1e2", night: "#0f2b2e", accent: "#6ed0b6" },
  emberGlass: { label: "Ember Glass", day: "#f8ead8", night: "#261213", accent: "#ff7a66" },
  glacier: { label: "Glacier Fade", day: "#e9f4ff", night: "#0d203c", accent: "#7cc7ff" }
};

const settings = {
  themeKey: "creamSolar",
  tileSize: 22,
  speedMood: 1,
  chaos: 0.14
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

function updateCssPalette() {
  const root = document.documentElement;
  root.style.setProperty("--day", colors.day);
  root.style.setProperty("--night", colors.night);
  root.style.setProperty("--accent", colors.accent);
}

function updateDynamicBackground(dayRatio = 0.5, topHalfRatio = dayRatio) {
  const top = mixColors(colors.night, colors.day, clamp(topHalfRatio + 0.2, 0, 1));
  const mid = mixColors(colors.day, colors.night, 0.5);
  const bottom = mixColors(colors.day, colors.night, clamp(1 - dayRatio + 0.1, 0, 1));
  const accentGlow = rgba(colors.accent, 0.2);
  document.body.style.background = `radial-gradient(80% 70% at 18% 12%, ${rgba(
    colors.day,
    0.16
  )}, transparent 40%), radial-gradient(65% 70% at 80% 12%, ${accentGlow}, transparent 40%), linear-gradient(180deg, ${top} 0%, ${mid} 48%, ${bottom} 100%)`;
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
  const base = 0.35;
  const t = Math.pow(raw / 100, 2.2);
  return base + t * 2.1;
}

function nonLinearChaos(raw) {
  const t = Math.pow(raw / 100, 2.4);
  return parseFloat((t * 1.1).toFixed(3));
}

function updateDerived() {
  minSpeed = 3.5 * settings.speedMood;
  maxSpeed = 11 * settings.speedMood;
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
  const maxW = Math.max(420, window.innerWidth - 48);
  const maxH = Math.max(420, window.innerHeight - 64);
  frameWidth = clamp(width, 420, maxW);
  frameHeight = clamp(height, 420, maxH);
  rebuildGrid(preserveOwnership);
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
  const base = 5.5 * settings.speedMood;
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
  playPauseBtn.textContent = isPlaying ? "Pause" : "Play";
  if (isPlaying) {
    animationFrameId = requestAnimationFrame(render);
  } else {
    cancelAnimationFrame(animationFrameId);
  }
}

function toggleSettings(open) {
  const shouldOpen = open ?? !configPanel.classList.contains("open");
  configPanel.classList.toggle("open", shouldOpen);
}

function drawTile(tile, owner) {
  ctx.fillStyle = owner === 0 ? colors.day : colors.night;
  ctx.fillRect(tile.x, tile.y, settings.tileSize, settings.tileSize);
}

function drawBall(ball) {
  ctx.save();
  const color = ball.owner === 0 ? colors.day : colors.night;
  ctx.fillStyle = color;
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ballRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
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

function updateScoreUI(dayScore, nightScore, topHalfRatio) {
  const total = dayScore + nightScore || 1;
  const dayRatio = dayScore / total;
  scoreDayLabel.textContent = `Day ${dayScore}`;
  scoreNightLabel.textContent = `Night ${nightScore}`;
  scoreDayBar.style.width = `${dayRatio * 100}%`;
  scoreNightBar.style.width = `${(1 - dayRatio) * 100}%`;
  scoreNotch.classList.toggle("overlay", frameWidth > window.innerWidth * 0.88 || frameHeight > window.innerHeight * 0.8);
  updateDynamicBackground(dayRatio, topHalfRatio);
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  let dayScore = 0;
  let nightScore = 0;
  let topDay = 0;
  let topTotal = 0;

  grid.forEach((tile, idx) => {
    const owner = ownership[idx];
    drawTile(tile, owner);
    if (owner === 0) dayScore++;
    else nightScore++;
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
  updateScoreUI(dayScore, nightScore, topHalfRatio);

  if (isPlaying) {
    animationFrameId = requestAnimationFrame(render);
  }
}

function scatterStart() {
  ownership = ownership.map(() => (Math.random() > 0.5 ? 1 : 0));
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
}

function attachDragResize() {
  let activeEdge = null;
  let startPos = { x: 0, y: 0, w: 0, h: 0 };

  function onMove(e) {
    if (!activeEdge) return;
    e.preventDefault();
    const dx = e.clientX - startPos.x;
    const dy = e.clientY - startPos.y;
    let targetW = startPos.w;
    let targetH = startPos.h;
    if (activeEdge === "left" || activeEdge === "right") {
      const delta = activeEdge === "left" ? -dx : dx;
      targetW = startPos.w + delta * 2;
    } else if (activeEdge === "top" || activeEdge === "bottom") {
      const delta = activeEdge === "top" ? -dy : dy;
      targetH = startPos.h + delta * 2;
    }
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
    activeEdge = null;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  }

  dragHandles.forEach((handle) => {
    handle.addEventListener("mousedown", (e) => {
      activeEdge = handle.dataset.edge;
      startPos = { x: e.clientX, y: e.clientY, w: frameWidth, h: frameHeight };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  });
}

function initControls() {
  populateThemes();
  updateCssPalette();
  updateDerived();

  tileSizeInput.addEventListener("input", (e) => {
    settings.tileSize = nonLinearTileSize(Number(e.target.value));
    tileSizeValue.textContent = `${settings.tileSize}px`;
    ballRadius = settings.tileSize * 0.44;
    rebuildGrid(true);
  });

  speedInput.addEventListener("input", (e) => {
    settings.speedMood = nonLinearSpeed(Number(e.target.value));
    speedValue.textContent = `${settings.speedMood.toFixed(2)}x`;
    updateDerived();
  });

  chaosInput.addEventListener("input", (e) => {
    settings.chaos = nonLinearChaos(Number(e.target.value));
    chaosValue.textContent = settings.chaos.toFixed(2);
  });

  themeSelect.addEventListener("change", (e) => {
    applyTheme(e.target.value);
  });

  dayColorInput.addEventListener("input", (e) => {
    colors.day = e.target.value;
    themeSelect.value = "custom";
    updateCssPalette();
  });

  nightColorInput.addEventListener("input", (e) => {
    colors.night = e.target.value;
    themeSelect.value = "custom";
    updateCssPalette();
  });

  playPauseBtn.addEventListener("click", togglePlayPause);
  resetBtn.addEventListener("click", () => {
    resetGame();
    if (!isPlaying) togglePlayPause();
  });

  configBtn.addEventListener("click", () => toggleSettings(true));
  closeConfigBtn.addEventListener("click", () => toggleSettings(false));

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
    const maxW = Math.max(420, window.innerWidth - 48);
    const maxH = Math.max(420, window.innerHeight - 64);
    frameWidth = Math.min(frameWidth, maxW);
    frameHeight = Math.min(frameHeight, maxH);
    rebuildGrid(true);
  });

  attachDragResize();

  // Initialize slider displays from defaults
  tileSizeInput.value = 45;
  speedInput.value = 40;
  chaosInput.value = 40;
  settings.tileSize = nonLinearTileSize(Number(tileSizeInput.value));
  settings.speedMood = nonLinearSpeed(Number(speedInput.value));
  settings.chaos = nonLinearChaos(Number(chaosInput.value));
  tileSizeValue.textContent = `${settings.tileSize}px`;
  speedValue.textContent = `${settings.speedMood.toFixed(2)}x`;
  chaosValue.textContent = settings.chaos.toFixed(2);
  ballRadius = settings.tileSize * 0.44;
  updateDerived();
}

function start() {
  initControls();
  const initialW = clamp(Math.min(window.innerWidth - 120, 900), 420, window.innerWidth - 48);
  const initialH = clamp(Math.min(window.innerHeight - 160, 900), 420, window.innerHeight - 64);
  setFrameSize(initialW, initialH, false);
  resetGame();
  animationFrameId = requestAnimationFrame(render);
}

start();
