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
const paceLabel = document.querySelector("#paceLabel");
const dayScoreLabel = document.querySelector("#dayScoreLabel");
const nightScoreLabel = document.querySelector("#nightScoreLabel");

const themes = {
  creamSolar: {
    label: "Cream + Solar Blue",
    day: "#f7f2e9",
    night: "#0b3a67",
    accent: "#f08c42"
  },
  duskLilac: {
    label: "Dusked Lilac",
    day: "#f6e8ff",
    night: "#201430",
    accent: "#cfa3ff"
  },
  mossSea: {
    label: "Moss & Sea",
    day: "#e8f1e2",
    night: "#0f2b2e",
    accent: "#6ed0b6"
  },
  emberGlass: {
    label: "Ember Glass",
    day: "#f8ead8",
    night: "#261213",
    accent: "#ff7a66"
  },
  glacier: {
    label: "Glacier Fade",
    day: "#e9f4ff",
    night: "#0d203c",
    accent: "#7cc7ff"
  }
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
let iteration = 0;

const colors = {
  day: themes[settings.themeKey].day,
  night: themes[settings.themeKey].night,
  accent: themes[settings.themeKey].accent
};

function hexToRgb(hex) {
  const parsed = hex.replace("#", "");
  const bigint = parseInt(parsed, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
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
  document.body.style.background = [
    `radial-gradient(120% 140% at 15% 10%, ${rgba(colors.day, 0.38)}, transparent 35%)`,
    `radial-gradient(110% 120% at 80% 10%, ${rgba(colors.accent, 0.2)}, transparent 35%)`,
    `linear-gradient(145deg, ${colors.night} 0%, #0a1b31 55%, #0a0f1e 100%)`
  ].join(",");
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

function updateSpeedTargets() {
  minSpeed = 4 * settings.speedMood;
  maxSpeed = 9.5 * settings.speedMood;
  paceLabel.textContent =
    settings.speedMood < 0.9
      ? "Pace: Lofi"
      : settings.speedMood < 1.2
      ? "Pace: Drift"
      : "Pace: Push";
}

function resizeCanvasForGrid() {
  const maxSize = 720;
  gridWidth = Math.floor(maxSize / settings.tileSize);
  gridHeight = gridWidth;
  canvas.width = gridWidth * settings.tileSize;
  canvas.height = gridHeight * settings.tileSize;
  ballRadius = settings.tileSize * 0.44;
}

function buildGrid() {
  resizeCanvasForGrid();
  ownership = new Array(gridWidth * gridHeight);
  grid = new Array(gridWidth * gridHeight);
  for (let idx = 0; idx < ownership.length; idx++) {
    const x = (idx % gridWidth) * settings.tileSize;
    const y = Math.floor(idx / gridWidth) * settings.tileSize;
    ownership[idx] = idx % gridWidth < gridWidth / 2 ? 0 : 1;
    grid[idx] = { x, y };
  }
}

function createBalls() {
  const base = 6 * settings.speedMood;
  balls = [
    { owner: 0, x: canvas.width * 0.25, y: canvas.height * 0.5, vx: base, vy: -base },
    { owner: 1, x: canvas.width * 0.75, y: canvas.height * 0.5, vx: -base, vy: base }
  ];
}

function resetGame() {
  iteration = 0;
  buildGrid();
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
  const glow = rgba(color, 0.4);
  ctx.shadowBlur = 18;
  ctx.shadowColor = glow;
  const gradient = ctx.createRadialGradient(ball.x, ball.y, ballRadius * 0.2, ball.x, ball.y, ballRadius);
  gradient.addColorStop(0, rgba(color, 1));
  gradient.addColorStop(1, rgba(color, 0.1));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ballRadius, 0, Math.PI * 2);
  ctx.fill();
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
    if (
      right > tileLeft &&
      left < tileRight &&
      bottom > tileTop &&
      top < tileBottom &&
      ownership[idx] !== ball.owner
    ) {
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
    ball.x = Math.max(ballRadius, Math.min(canvas.width - ballRadius, ball.x));
  }
  if (ball.y < ballRadius || ball.y > canvas.height - ballRadius) {
    ball.vy = -ball.vy;
    ball.y = Math.max(ballRadius, Math.min(canvas.height - ballRadius, ball.y));
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

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  let dayScore = 0;
  let nightScore = 0;

  grid.forEach((tile, idx) => {
    const owner = ownership[idx];
    drawTile(tile, owner);
    if (owner === 0) dayScore++;
    else nightScore++;
  });

  balls.forEach((ball) => {
    drawBall(ball);
    detectCollision(ball);
    checkBoundaries(ball);
    updateBall(ball);
  });

  dayScoreLabel.textContent = `Day ${dayScore}`;
  nightScoreLabel.textContent = `Night ${nightScore}`;

  iteration++;
  if (isPlaying) {
    animationFrameId = requestAnimationFrame(render);
  }
}

function scatterStart() {
  ownership = ownership.map(() => (Math.random() > 0.5 ? 1 : 0));
}

function swapSides() {
  ownership = ownership.map((owner) => (owner === 0 ? 1 : 0));
  const first = balls[0];
  const second = balls[1];
  balls[0] = { ...first, owner: 1, x: canvas.width * 0.75, y: canvas.height * 0.5, vx: Math.abs(first.vx) * -1, vy: first.vy };
  balls[1] = { ...second, owner: 0, x: canvas.width * 0.25, y: canvas.height * 0.5, vx: Math.abs(second.vx), vy: second.vy };
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

function initControls() {
  populateThemes();
  updateCssPalette();
  updateSpeedTargets();
  tileSizeValue.textContent = `${settings.tileSize}px`;
  speedValue.textContent = `${settings.speedMood.toFixed(2)}x`;
  chaosValue.textContent = settings.chaos.toFixed(2);
  tileSizeInput.value = settings.tileSize;
  speedInput.value = settings.speedMood;
  chaosInput.value = settings.chaos;

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

  tileSizeInput.addEventListener("input", (e) => {
    settings.tileSize = Number(e.target.value);
    tileSizeValue.textContent = `${settings.tileSize}px`;
    resetGame();
  });

  speedInput.addEventListener("input", (e) => {
    settings.speedMood = Number(e.target.value);
    speedValue.textContent = `${settings.speedMood.toFixed(2)}x`;
    updateSpeedTargets();
  });

  chaosInput.addEventListener("input", (e) => {
    settings.chaos = Number(e.target.value);
    chaosValue.textContent = settings.chaos.toFixed(2);
  });

  playPauseBtn.addEventListener("click", togglePlayPause);
  resetBtn.addEventListener("click", () => {
    resetGame();
    if (!isPlaying) togglePlayPause();
  });

  configBtn.addEventListener("click", () => toggleSettings());
  closeConfigBtn.addEventListener("click", () => toggleSettings(false));

  scatterBtn.addEventListener("click", scatterStart);
  swapSidesBtn.addEventListener("click", swapSides);

  document.addEventListener("keydown", (e) => {
    if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
    if (e.code === "Space") {
      e.preventDefault();
      togglePlayPause();
    }
  });
}

function start() {
  initControls();
  toggleSettings(true);
  buildGrid();
  createBalls();
  animationFrameId = requestAnimationFrame(render);
}

start();
