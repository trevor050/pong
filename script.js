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
const dayScoreLabel = document.querySelector("#dayScoreLabel");
const nightScoreLabel = document.querySelector("#nightScoreLabel");

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

const colors = {
  day: themes[settings.themeKey].day,
  night: themes[settings.themeKey].night,
  accent: themes[settings.themeKey].accent
};

function hexToRgb(hex) {
  const parsed = hex.replace("#", "");
  const bigint = parseInt(parsed, 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
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
  document.body.style.background = `linear-gradient(160deg, ${colors.night}, #091123 55%, #080d1a)`;
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

function fitCanvas() {
  const padding = 48;
  const target = Math.min(window.innerWidth - padding, window.innerHeight - padding);
  const clamped = Math.max(420, Math.min(target, 1100));
  const tiles = Math.floor(clamped / settings.tileSize);
  gridWidth = tiles;
  gridHeight = tiles;
  canvas.width = tiles * settings.tileSize;
  canvas.height = tiles * settings.tileSize;
  ballRadius = settings.tileSize * 0.44;
}

function buildGrid() {
  fitCanvas();
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
  const base = 5.5 * settings.speedMood;
  balls = [
    { owner: 0, x: canvas.width * 0.25, y: canvas.height * 0.5, vx: base, vy: -base },
    { owner: 1, x: canvas.width * 0.75, y: canvas.height * 0.5, vx: -base, vy: base }
  ];
}

function resetGame() {
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

function initControls() {
  populateThemes();
  updateCssPalette();
  updateDerived();

  tileSizeInput.addEventListener("input", (e) => {
    settings.tileSize = nonLinearTileSize(Number(e.target.value));
    tileSizeValue.textContent = `${settings.tileSize}px`;
    resetGame();
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
    resetGame();
  });

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
  updateDerived();
}

function start() {
  initControls();
  buildGrid();
  createBalls();
  animationFrameId = requestAnimationFrame(render);
}

start();
