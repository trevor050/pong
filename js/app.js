/*
 * Endless Pong app: UI, game loop and screensaver behavior.
 * Physics lives in physics.js, drawing in render.js, settings in settings.js.
 */
(function () {
  "use strict";

  const P = window.PongPhysics;
  const S = window.PongSettings;
  const R = window.PongRender;
  const clamp = P.clamp;

  const $ = (sel) => document.querySelector(sel);
  const canvasFrame = $("#canvasFrame");
  const tileCanvas = $("#tileCanvas");
  const ballCanvas = $("#ballCanvas");

  const playPauseBtn = $("#playPauseBtn");
  const resetBtn = $("#resetBtn");
  const saverBtn = $("#saverBtn");
  const configBtn = $("#configBtn");
  const closeConfigBtn = $("#closeConfig");
  const configPanel = $("#configPanel");
  const chromeControls = $("#chromeControls");
  const drawerOverlay = $("#drawerOverlay");
  const drawerSaver = $("#drawerSaver");
  const drawerFullscreen = $("#drawerFullscreen");
  const drawerShare = $("#drawerShare");
  const drawerResetSettings = $("#drawerResetSettings");
  const shell = $(".shell");

  const themePicker = $("#themePicker");
  const themeSelected = $("#themeSelected");
  const themePanel = $("#themePanel");
  const themeLabel = $("#themeLabel");
  const themeSwatches = $("#themeSwatches");
  const dayColorInput = $("#dayColorInput");
  const nightColorInput = $("#nightColorInput");
  const tileSizeInput = $("#tileSizeInput");
  const tileSizeValue = $("#tileSizeValue");
  const speedValue = $("#speedValue");
  const chaosInput = $("#chaosInput");
  const chaosValue = $("#chaosValue");
  const scatterBtn = $("#scatterBtn");
  const swapSidesBtn = $("#swapSidesBtn");
  const speedDial = $("#speedDial");
  const speedDialFill = $("#speedDialFill");
  const speedDialThumb = $("#speedDialThumb");
  const hideScoreToggle = $("#hideScoreToggle");
  const autoHideUiToggle = $("#autoHideUiToggle");
  const autoHideCursorToggle = $("#autoHideCursorToggle");
  const cinematicModeToggle = $("#cinematicModeToggle");
  const shuffleToggle = $("#shuffleToggle");
  const clockToggle = $("#clockToggle");
  const ballPicker = $("#ballPicker");
  const ballSelected = $("#ballSelected");
  const ballPanel = $("#ballPanel");
  const ballLabel = $("#ballLabel");
  const ballSwatch = $("#ballSwatch");

  const scoreNotch = $("#scoreNotch");
  const scoreDayLabel = $("#dayScoreLabel");
  const scoreNightLabel = $("#nightScoreLabel");
  const scoreDayBar = scoreNotch.querySelector(".score-notch__day");
  const scoreNightBar = scoreNotch.querySelector(".score-notch__night");
  const clockEl = $("#clock");
  const clockTime = $("#clockTime");
  const clockDate = $("#clockDate");
  const toastEl = $("#toast");
  const dragHandles = document.querySelectorAll(".corner-handle");

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const standaloneQuery = window.matchMedia("(display-mode: standalone), (display-mode: fullscreen)");

  // How far (CSS px) the board may wander in screensaver mode to spread wear on
  // OLED and plasma panels. The board is oversized by this much on each side.
  const DRIFT = 8;
  const STEP_MS = 1000 / 60; // the original ran one physics step per 60 Hz frame
  const SHUFFLE_EVERY_MS = 3 * 60 * 1000;
  const CROSSFADE_MS = 1600;

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  const hashState = S.fromHash(location.hash);
  const kiosk = hashState.flags.saver; // #saver: chrome-less (macOS screen saver, kiosks)
  const settings = loadSettings();
  const colors = { day: settings.dayColor, night: settings.nightColor, accent: settings.accentColor };
  let visualColors = { ...colors };

  function loadSettings() {
    let stored = null;
    try {
      stored = localStorage.getItem(S.STORAGE_KEY);
    } catch (e) {
      // storage blocked (private mode, sandboxed webview): run on defaults
    }
    const base = S.fromStorage(stored);
    // A shared link (or this tab's own synced URL) defines the whole look.
    return Object.keys(hashState.settings).length ? S.applyLink(base, hashState.settings) : base;
  }

  let saveTimer = null;
  function saveSettings() {
    settings.dayColor = colors.day;
    settings.nightColor = colors.night;
    settings.accentColor = colors.accent;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(S.STORAGE_KEY, S.toStorage(settings));
      } catch (e) {
        // ignore
      }
      syncUrl();
    }, 150);
  }

  function shareHash() {
    return S.toHash(settings);
  }

  function syncUrl() {
    let hash = shareHash();
    if (kiosk) hash = hash ? `saver&${hash}` : "saver";
    const url = location.pathname + location.search + (hash ? `#${hash}` : "");
    if (url !== location.pathname + location.search + location.hash) {
      history.replaceState(null, "", url);
    }
  }

  // ---------------------------------------------------------------------------
  // World + renderer
  // ---------------------------------------------------------------------------

  const renderer = R.createRenderer(tileCanvas, ballCanvas);
  let world = null;
  let isPlaying = !reducedMotion.matches;
  let animationFrameId = null;
  let requestedSize = { w: window.innerWidth, h: window.innerHeight };
  let deviceScale = window.devicePixelRatio || 1;
  let isNativeFullscreen = false;
  let savedSize = null;
  let saverMode = false;

  function historyLengthFor(style) {
    return style === "comet" ? 18 : 14;
  }

  function overscan() {
    return saverMode ? DRIFT * 2 : 0;
  }

  function createWorld() {
    const tileSize = P.nonLinearTileSize(settings.tileSizeRaw);
    world = P.createWorld({
      width: requestedSize.w + overscan(),
      height: requestedSize.h + overscan(),
      tileSize,
      speedMood: settings.speedMood,
      chaos: P.nonLinearChaos(settings.chaosRaw),
      ballStyle: settings.ballStyle,
      cinematicMode: settings.cinematicMode,
      historyLength: historyLengthFor(settings.ballStyle)
    });
    applyBoardSize();
  }

  function applyBoardSize() {
    deviceScale = window.devicePixelRatio || 1;
    renderer.resize(world, deviceScale);
    canvasFrame.style.width = `${world.width}px`;
    canvasFrame.style.height = `${world.height}px`;
    applyDrift();
    renderer.drawBalls(world);
    if (!isPlaying) {
      clearTimeout(deferredPaint);
      deferredPaint = setTimeout(() => renderer.drawBalls(world), 210);
    }
    updateScoreUI(true);
  }

  // Resize to a requested CSS size. The board snaps up to whole tiles.
  function setFrameSize(width, height) {
    const minFrame = 240;
    requestedSize = {
      w: clamp(width, minFrame, Math.max(420, window.innerWidth)),
      h: clamp(height, minFrame, Math.max(420, window.innerHeight))
    };
    P.resizeWorld(world, requestedSize.w + overscan(), requestedSize.h + overscan(), {
      tileSize: P.nonLinearTileSize(settings.tileSizeRaw)
    });
    applyBoardSize();
    updateFullscreenLabel();
  }

  function fillWindow() {
    setFrameSize(window.innerWidth, window.innerHeight);
  }

  let deferredPaint = null;
  function repaintAll() {
    clearTimeout(deferredPaint);
    if (!isPlaying) deferredPaint = setTimeout(() => { renderer.drawBalls(world); }, 210);
    renderer.paintAllTiles(world);
    renderer.drawBalls(world);
    updateScoreUI(true);
  }

  function renderIfPaused() {
    if (!isPlaying) repaintAll();
  }

  // ---------------------------------------------------------------------------
  // Game loop: fixed 60 Hz physics steps, decoupled from the display rate, so
  // 120/144 Hz screens run at the same pace the original did on 60 Hz ones.
  // ---------------------------------------------------------------------------

  let lastFrameTime = null;
  let stepDebt = 0;
  let playTime = 0;

  function frame(now) {
    animationFrameId = null;
    if (!isPlaying) return;
    if (lastFrameTime === null) lastFrameTime = now - STEP_MS;
    let elapsed = now - lastFrameTime;
    lastFrameTime = now;
    // Some minimized browsers throttle rAF to 1 Hz without reporting hidden.
    // Ignore those callbacks instead of running one physics step per second.
    if (elapsed > 250) {
      stepDebt = 0;
      animationFrameId = requestAnimationFrame(frame);
      return;
    }
    playTime += elapsed;

    // Rounding (rather than flooring) keeps 60 Hz displays at exactly one step
    // per frame despite timestamp jitter; the remainder carries over.
    stepDebt += elapsed / STEP_MS;
    let steps = Math.round(stepDebt);
    if (steps > 4) {
      steps = 4;
      stepDebt = 0;
    } else {
      stepDebt -= steps;
    }
    for (let i = 0; i < steps; i++) P.step(world);

    if (crossfade) advanceCrossfade(now);
    if (world.claimed.length) {
      renderer.paintTiles(world, world.claimed);
      world.claimed.length = 0;
    }
    renderer.drawBalls(world);
    updateScoreUI(false);
    tickShuffle();

    animationFrameId = requestAnimationFrame(frame);
  }

  function startLoop() {
    if (animationFrameId === null && isPlaying && !document.hidden) {
      lastFrameTime = null;
      stepDebt = 0;
      animationFrameId = requestAnimationFrame(frame);
    }
  }

  function stopLoop() {
    if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  // ---------------------------------------------------------------------------
  // Score notch + backdrop
  // ---------------------------------------------------------------------------

  let lastScoreUpdate = -Infinity;
  let lastScore = { day: -1, overlay: null };

  function updateScoreUI(force) {
    const now = performance.now();
    if (!force && now - lastScoreUpdate < 200) return;
    lastScoreUpdate = now;
    const [dayScore, nightScore] = world.counts;
    const total = dayScore + nightScore || 1;
    const dayRatio = dayScore / total;
    const overlayNeeded = world.width > window.innerWidth * 0.85 || world.height > window.innerHeight * 0.75;
    if (dayScore !== lastScore.day || overlayNeeded !== lastScore.overlay || force) {
      scoreDayLabel.textContent = `Light ${dayScore}`;
      scoreNightLabel.textContent = `Dark ${nightScore}`;
      scoreDayBar.style.width = `${dayRatio * 100}%`;
      scoreNightBar.style.width = `${(1 - dayRatio) * 100}%`;
      scoreNotch.classList.toggle("overlay", overlayNeeded);
      lastScore = { day: dayScore, overlay: overlayNeeded };
      updateBackdrop(dayRatio);
    }
  }

  // The page backdrop only shows when the board is dragged smaller than the
  // window, so it is only recomputed then (it used to repaint every 90 ms).
  let lastBackdropKey = "";
  function updateBackdrop(dayRatio) {
    const covered = world.width >= window.innerWidth && world.height >= window.innerHeight;
    if (covered || isNativeFullscreen) return;
    const bucket = Math.round(dayRatio * 50) / 50;
    const key = `${colors.day}${colors.night}${colors.accent}${bucket}`;
    if (key === lastBackdropKey) return;
    lastBackdropKey = key;
    const dayPower = Math.pow(bucket, 0.8) * 0.7;
    const nightPower = Math.pow(1 - bucket, 0.8) * 0.7;
    document.body.style.background = `
      radial-gradient(circle at 0% 50%, ${R.rgba(colors.day, dayPower.toFixed(3))}, transparent 45%),
      radial-gradient(circle at 100% 50%, ${R.rgba(colors.night, nightPower.toFixed(3))}, transparent 45%),
      radial-gradient(ellipse at 30% 30%, ${R.rgba(colors.accent, (bucket * 0.4).toFixed(3))}, transparent 35%),
      linear-gradient(135deg, ${R.rgba(colors.night, 0.3)} 0%, ${R.rgba(colors.day, 0.15)} 100%), #050911`;
  }

  function setScoreBarVisibility(hidden) {
    scoreNotch.classList.toggle("is-hidden", hidden);
  }

  // ---------------------------------------------------------------------------
  // Palette + ball style
  // ---------------------------------------------------------------------------

  function updateCssPalette() {
    const root = document.documentElement;
    root.style.setProperty("--day", colors.day);
    root.style.setProperty("--night", colors.night);
    root.style.setProperty("--accent", colors.accent);
    for (const [name, hex] of Object.entries(colors)) {
      const { r, g, b } = R.hexToRgb(hex);
      root.style.setProperty(`--${name}-rgb`, `${r}, ${g}, ${b}`);
    }
  }

  function applyColorsToRenderer() {
    visualColors = { ...colors };
    renderer.setTheme([colors.day, colors.night], colors.accent);
  }

  let crossfade = null;
  let lastPaletteChange = -Infinity;
  let paletteTimer = null;

  function applyTheme(key, { skipSave, animate } = {}) {
    const normalizedKey = S.normalizeThemeKey(key);
    settings.themeKey = normalizedKey;
    const theme =
      normalizedKey === "custom"
        ? { day: settings.dayColor, night: settings.nightColor, accent: settings.accentColor }
        : S.getTheme(normalizedKey);
    colors.day = theme.day;
    colors.night = theme.night;
    colors.accent = theme.accent;
    dayColorInput.value = colors.day;
    nightColorInput.value = colors.night;
    clearTimeout(paletteTimer);
    function paintTheme() {
      const now = performance.now();
      // Include the CSS backdrop and previews, not only the two canvases.
      if (!skipSave && now - lastPaletteChange < 400) {
        paletteTimer = setTimeout(paintTheme, 400 - (now - lastPaletteChange));
        return;
      }
      lastPaletteChange = now;
      updateCssPalette();
      lastBackdropKey = "";
      if (animate && isPlaying && !reducedMotion.matches) {
        crossfade = { from: { ...visualColors }, to: { ...colors }, start: null };
      } else {
        crossfade = null;
        applyColorsToRenderer();
        if (world) repaintAll();
      }
      updateBallPickerPreviews();
    }
    paintTheme();
    updateThemeUI({ previews: false });
    if (!skipSave) saveSettings();
  }

  function advanceCrossfade(now) {
    if (crossfade.start === null) crossfade.start = now;
    const t = clamp((now - crossfade.start) / CROSSFADE_MS, 0, 1);
    const ease = t * t * (3 - 2 * t);
    const { from, to } = crossfade;
    visualColors = { day: R.mixHex(from.day, to.day, ease), night: R.mixHex(from.night, to.night, ease), accent: R.mixHex(from.accent, to.accent, ease) };
    renderer.setTheme([visualColors.day, visualColors.night], visualColors.accent);
    renderer.paintAllTiles(world);
    if (t >= 1) crossfade = null;
  }

  function updateThemeUI({ previews = true } = {}) {
    const theme = settings.themeKey === "custom" ? { label: "Custom picks" } : S.getTheme(settings.themeKey);
    themeLabel.textContent = theme.label || "Palette";
    themeSwatches.innerHTML = "";
    [colors.day, colors.night, colors.accent].forEach((val) => {
      const sw = document.createElement("span");
      sw.style.background = val;
      themeSwatches.appendChild(sw);
    });
    themePanel.querySelectorAll(".picker__option").forEach((opt) => {
      const active = opt.dataset.key === settings.themeKey;
      opt.classList.toggle("is-active", active);
      opt.setAttribute("aria-selected", String(active));
      if (opt.dataset.key === "custom") {
        const swatches = opt.querySelectorAll(".picker__swatch");
        [colors.day, colors.night, colors.accent].forEach((clr, idx) => {
          if (swatches[idx]) swatches[idx].style.background = clr;
        });
      }
    });
    if (previews) updateBallPickerPreviews();
  }

  function previewTheme() {
    return { colors: [colors.day, colors.night], accent: colors.accent };
  }

  function updateBallUI() {
    const style = S.BALL_STYLES.find((b) => b.key === settings.ballStyle) || S.BALL_STYLES[0];
    ballLabel.textContent = style.label;
    ensureBallCanvas(ballSwatch, style.key);
    ballPanel.querySelectorAll(".picker__option").forEach((opt) => {
      const active = opt.dataset.key === style.key;
      opt.classList.toggle("is-active", active);
      opt.setAttribute("aria-selected", String(active));
    });
  }

  function buildThemePicker() {
    themePanel.innerHTML = "";
    const options = [...S.THEMES, { key: "custom", label: "Custom picks" }];
    options.forEach((theme) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "picker__option";
      option.dataset.key = theme.key;
      option.setAttribute("role", "option");
      const name = document.createElement("div");
      name.className = "picker__name";
      const nameText = document.createElement("span");
      nameText.textContent = theme.label;
      name.appendChild(nameText);
      const swatchRow = document.createElement("div");
      swatchRow.className = "picker__swatch-row";
      const swatchColors =
        theme.key === "custom" ? [colors.day, colors.night, colors.accent] : [theme.day, theme.night, theme.accent];
      swatchColors.forEach((clr) => {
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
        themeSelected.focus();
      });
      themePanel.appendChild(option);
    });
    updateThemeUI();
  }

  function buildBallPicker() {
    ballPanel.innerHTML = "";
    S.BALL_STYLES.forEach((style) => {
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
      R.renderBallPreview(canvas, style.key, previewTheme());
      option.addEventListener("click", () => {
        setBallStyle(style.key);
        closePickers();
        ballSelected.focus();
      });
      ballPanel.appendChild(option);
    });
    updateBallUI();
  }

  function closePickers(except) {
    for (const [picker, button] of [[themePicker, themeSelected], [ballPicker, ballSelected]]) {
      if (picker !== except) {
        picker.classList.remove("open");
        button.setAttribute("aria-expanded", "false");
      }
    }
  }

  function togglePicker(pickerEl, buttonEl) {
    const isOpen = pickerEl.classList.contains("open");
    closePickers(isOpen ? null : pickerEl);
    pickerEl.classList.toggle("open", !isOpen);
    buttonEl.setAttribute("aria-expanded", String(!isOpen));
    if (!isOpen) {
      const active = pickerEl.querySelector(".picker__option.is-active") || pickerEl.querySelector(".picker__option");
      if (active) active.focus();
    }
  }

  // Arrow-key navigation inside an open picker panel.
  function attachPickerKeys(panel, pickerEl, buttonEl) {
    panel.addEventListener("keydown", (e) => {
      const options = [...panel.querySelectorAll(".picker__option")];
      const idx = options.indexOf(document.activeElement);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const next = e.key === "ArrowDown" ? idx + 1 : idx - 1;
        options[(next + options.length) % options.length].focus();
      } else if (e.key === "Escape") {
        e.stopPropagation();
        closePickers();
        buttonEl.focus();
      } else if (e.key === "Tab") {
        closePickers();
      }
    });
  }

  function setBallStyle(key, { skipSave } = {}) {
    settings.ballStyle = S.normalizeBallStyle(key);
    if (world) {
      P.setBallStyle(world, settings.ballStyle);
      world.historyLength = historyLengthFor(settings.ballStyle);
      renderer.clearBalls();
      renderer.drawBalls(world);
    }
    updateBallUI();
    if (!skipSave) saveSettings();
  }

  function ensureBallCanvas(container, styleKey) {
    let canvas = container.querySelector("canvas");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.className = "ball-preview__canvas";
      container.innerHTML = "";
      container.appendChild(canvas);
    }
    R.renderBallPreview(canvas, styleKey, previewTheme());
  }

  function updateBallPickerPreviews() {
    ballPanel.querySelectorAll(".picker__option").forEach((opt) => {
      const canvas = opt.querySelector("canvas");
      if (canvas) R.renderBallPreview(canvas, opt.dataset.key, previewTheme());
    });
    ensureBallCanvas(ballSwatch, settings.ballStyle);
  }

  // ---------------------------------------------------------------------------
  // Speed dial (drag for big jumps, arrow keys for fine steps)
  // ---------------------------------------------------------------------------

  function setSpeedMood(value, { skipSave } = {}) {
    settings.speedMood = clamp(value, S.SPEED_MIN, S.SPEED_MAX);
    speedValue.textContent = `${settings.speedMood.toFixed(2)}x`;
    const pct = ((settings.speedMood - S.SPEED_MIN) / (S.SPEED_MAX - S.SPEED_MIN)) * 100;
    speedDialFill.style.width = `${pct}%`;
    speedDialThumb.style.left = `${pct}%`;
    speedDial.setAttribute("aria-valuenow", settings.speedMood.toFixed(2));
    speedDial.setAttribute("aria-valuetext", `${settings.speedMood.toFixed(2)} times speed`);
    if (world) P.setSpeedMood(world, settings.speedMood);
    if (!skipSave) saveSettings();
  }

  function attachSpeedDial() {
    let startX = 0;
    let startValue = settings.speedMood;
    let dialWidth = 200;
    let activePointerId = null;

    speedDial.addEventListener("pointerdown", (e) => {
      activePointerId = e.pointerId;
      startX = e.clientX;
      startValue = settings.speedMood;
      dialWidth = speedDial.getBoundingClientRect().width || 200;
      speedDial.setPointerCapture(activePointerId);
    });

    speedDial.addEventListener("pointermove", (e) => {
      if (activePointerId === null) return;
      const dx = e.clientX - startX;
      const span = Math.max(140, dialWidth);
      const norm = clamp(Math.abs(dx) / span, 0, 1);
      const fineDelta = (dx / span) * 3.2;
      const sprint = Math.pow(norm, 1.35) * (S.SPEED_MAX - S.SPEED_MIN) * 0.55;
      setSpeedMood(startValue + fineDelta + Math.sign(dx) * sprint);
    });

    function releasePointer(e) {
      if (activePointerId === null) return;
      if (e.pointerId === activePointerId && speedDial.hasPointerCapture(activePointerId)) {
        speedDial.releasePointerCapture(activePointerId);
      }
      activePointerId = null;
    }

    speedDial.addEventListener("pointerup", releasePointer);
    speedDial.addEventListener("pointercancel", releasePointer);

    speedDial.addEventListener("keydown", (e) => {
      const big = e.shiftKey ? 5 : 1;
      if (["ArrowRight", "ArrowUp"].includes(e.key)) setSpeedMood(settings.speedMood + 0.2 * big);
      else if (["ArrowLeft", "ArrowDown"].includes(e.key)) setSpeedMood(settings.speedMood - 0.2 * big);
      else if (e.key === "PageUp") setSpeedMood(settings.speedMood + 2);
      else if (e.key === "PageDown") setSpeedMood(settings.speedMood - 2);
      else if (e.key === "Home") setSpeedMood(S.SPEED_MIN);
      else if (e.key === "End") setSpeedMood(S.SPEED_MAX);
      else return;
      e.preventDefault();
    });
  }

  // ---------------------------------------------------------------------------
  // Play / pause / board actions
  // ---------------------------------------------------------------------------

  function syncPlayPauseButtons() {
    playPauseBtn.setAttribute("data-state", isPlaying ? "playing" : "paused");
    playPauseBtn.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
    playPauseBtn.setAttribute("title", isPlaying ? "Pause (Space)" : "Play (Space)");
  }

  function togglePlayPause() {
    isPlaying = !isPlaying;
    syncPlayPauseButtons();
    if (isPlaying) startLoop();
    else stopLoop();
    updateWakeLock();
  }

  function resetGame() {
    P.resetWorld(world);
    repaintAll();
  }

  function scatterStart() {
    P.scatterWorld(world, Math.random);
    repaintAll();
  }

  function swapSides() {
    world.ownership = world.ownership.map((owner) => (owner === 0 ? 1 : 0));
    world.counts = [world.counts[1], world.counts[0]];
    const [first, second] = world.balls;
    world.balls = [
      { ...first, owner: 1, x: world.width * 0.75, y: world.height * 0.5, vx: -Math.abs(first.vx), vy: first.vy, history: [] },
      { ...second, owner: 0, x: world.width * 0.25, y: world.height * 0.5, vx: Math.abs(second.vx), vy: second.vy, history: [] }
    ];
    renderer.clearBalls();
    repaintAll();
  }

  function resetSettingsToDefault() {
    const keepLocal = { autoHideChrome: settings.autoHideChrome, autoHideCursor: settings.autoHideCursor };
    Object.assign(settings, S.sanitize(keepLocal));
    applySettingsToUI();
    applyTheme(settings.themeKey);
    fillWindow();
    toast("Settings reset");
  }

  // ---------------------------------------------------------------------------
  // Drawer
  // ---------------------------------------------------------------------------

  let lastFocusBeforeDrawer = null;

  function toggleSettings(open) {
    const shouldOpen = open ?? !configPanel.classList.contains("open");
    if (shouldOpen === configPanel.classList.contains("open")) return;
    configPanel.classList.toggle("open", shouldOpen);
    configPanel.inert = !shouldOpen;
    configPanel.setAttribute("aria-hidden", String(!shouldOpen));
    configBtn.classList.toggle("is-active", shouldOpen);
    chromeControls.classList.toggle("hidden", shouldOpen);
    drawerOverlay.classList.toggle("visible", shouldOpen);
    document.body.classList.toggle("drawer-open", shouldOpen);
    configBtn.setAttribute("aria-expanded", String(shouldOpen));
    chromeControls.inert = shouldOpen;
    if (shouldOpen) {
      lastFocusBeforeDrawer = document.activeElement;
      chromeControls.classList.remove("is-revealed");
      document.body.classList.remove("cursor-hidden");
      requestAnimationFrame(() => closeConfigBtn.focus());
    } else {
      closePickers();
      if (!settings.autoHideChrome) chromeControls.classList.add("is-revealed");
      else hideChromeAfterDelay(600);
      if (lastFocusBeforeDrawer && lastFocusBeforeDrawer.focus) lastFocusBeforeDrawer.focus();
      else configBtn.focus();
    }
  }

  // ---------------------------------------------------------------------------
  // Chrome + cursor auto-hide (normal mode)
  // ---------------------------------------------------------------------------

  let chromeHideTimeout = null;
  let cursorHideTimeout = null;

  function drawerOpen() {
    return configPanel.classList.contains("open");
  }

  function revealChrome(linger = 1400) {
    chromeControls.classList.add("is-revealed");
    if ((settings.autoHideChrome || saverMode) && !drawerOpen()) {
      clearTimeout(chromeHideTimeout);
      chromeHideTimeout = setTimeout(() => {
        if (!chromeControls.contains(document.activeElement)) chromeControls.classList.remove("is-revealed");
      }, linger);
    }
  }

  function hideChromeAfterDelay(delay = 900) {
    if (!(settings.autoHideChrome || saverMode) || drawerOpen()) return;
    clearTimeout(chromeHideTimeout);
    chromeHideTimeout = setTimeout(() => chromeControls.classList.remove("is-revealed"), delay);
  }

  function applyChromeAutoHideState(enabled) {
    settings.autoHideChrome = enabled;
    chromeControls.classList.toggle("auto-hide", enabled || saverMode);
    autoHideUiToggle.checked = enabled;
    if (!enabled && !saverMode) {
      chromeControls.classList.add("is-revealed");
      clearTimeout(chromeHideTimeout);
    } else if (!drawerOpen()) {
      hideChromeAfterDelay(500);
    }
  }

  function hideCursorAfterDelay(delay = 1200) {
    if (!(settings.autoHideCursor || saverMode) || drawerOpen()) return;
    clearTimeout(cursorHideTimeout);
    cursorHideTimeout = setTimeout(() => {
      if ((settings.autoHideCursor || saverMode) && !drawerOpen()) document.body.classList.add("cursor-hidden");
    }, delay);
  }

  function applyCursorAutoHideState(enabled) {
    settings.autoHideCursor = enabled;
    autoHideCursorToggle.checked = enabled;
    document.body.classList.remove("cursor-hidden");
    clearTimeout(cursorHideTimeout);
    if (enabled) hideCursorAfterDelay(1200);
  }

  function applyCinematicModeState(enabled) {
    settings.cinematicMode = enabled;
    cinematicModeToggle.checked = enabled;
    if (world) P.setCinematicMode(world, enabled);
  }

  function isInRevealZone(x, y) {
    return x > window.innerWidth - 220 && y < 130;
  }

  function handlePointerActivity(e) {
    if (kiosk) return;
    if (settings.autoHideCursor || saverMode) {
      document.body.classList.remove("cursor-hidden");
      hideCursorAfterDelay(saverMode ? 1800 : 1200);
    }
    if (drawerOpen()) return;
    if (saverMode) {
      revealChrome(2200);
    } else if (settings.autoHideChrome) {
      if (e.pointerType === "touch" || isInRevealZone(e.clientX, e.clientY)) revealChrome(1800);
      else hideChromeAfterDelay(800);
    }
  }

  // ---------------------------------------------------------------------------
  // Fullscreen + screensaver mode
  // ---------------------------------------------------------------------------

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

  function updateFullscreenLabel() {
    drawerFullscreen.textContent = isNativeFullscreen ? "Exit fullscreen" : "Fullscreen";
  }

  function handleFullscreenChange() {
    const was = isNativeFullscreen;
    isNativeFullscreen = Boolean(getNativeFullscreenElement());
    if (isNativeFullscreen) {
      savedSize = savedSize || { ...requestedSize };
      fillWindow();
    } else {
      if (was && saverMode && !kiosk) setSaverMode(false);
      if (savedSize) setFrameSize(savedSize.w, savedSize.h);
      else fillWindow();
      savedSize = null;
    }
    updateFullscreenLabel();
    updateWakeLock();
  }

  function toggleFullscreen(force) {
    const shouldEnter = force !== undefined ? force : !isNativeFullscreen;
    if (shouldEnter && !isNativeFullscreen) {
      savedSize = { ...requestedSize };
      requestNativeFullscreen().catch(() => fillWindow());
    } else if (!shouldEnter && isNativeFullscreen) {
      exitNativeFullscreen().catch(() => {});
    }
  }

  /**
   * Screensaver mode: fullscreen where available, chrome and cursor hidden
   * until the pointer moves, screen kept awake, and the board slowly drifts a
   * few pixels to spread wear on burn-in-prone displays.
   */
  function setSaverMode(on) {
    if (on === saverMode) return;
    saverMode = on;
    document.body.classList.toggle("saver", on);
    saverBtn.setAttribute("aria-pressed", String(on));
    saverBtn.setAttribute("aria-label", on ? "Exit screensaver" : "Start screensaver");
    saverBtn.title = on ? "Exit screensaver (F or Esc)" : "Screensaver (F)";
    drawerSaver.textContent = on ? "Exit screensaver" : "Screensaver";
    if (on) {
      toggleSettings(false);
      chromeControls.classList.add("auto-hide");
      chromeControls.classList.remove("is-revealed");
      document.body.classList.add("cursor-hidden");
      if (!kiosk) toggleFullscreen(true);
      driftClock = 0;
    } else {
      applyChromeAutoHideState(settings.autoHideChrome);
      applyCursorAutoHideState(settings.autoHideCursor);
      if (isNativeFullscreen) toggleFullscreen(false);
      if (!settings.autoHideChrome) chromeControls.classList.add("is-revealed");
    }
    fillWindow();
    updateWakeLock();
  }

  // Burn-in drift: step the board along a slow Lissajous path, one device
  // pixel at a time so tiles stay crisp, roughly once every 15 seconds.
  let driftClock = 0;
  let driftTimer = null;

  function applyDrift() {
    if (!saverMode) {
      canvasFrame.style.transform = "";
      return;
    }
    const t = driftClock;
    const dx = Math.sin(t * 0.37) * DRIFT;
    const dy = Math.sin(t * 0.23 + 1.3) * DRIFT;
    const snap = (v) => Math.round(v * deviceScale) / deviceScale;
    canvasFrame.style.transform = `translate(${snap(-DRIFT + dx)}px, ${snap(-DRIFT + dy)}px)`;
  }

  function startDriftTimer() {
    clearInterval(driftTimer);
    driftTimer = setInterval(() => {
      if (!saverMode || !isPlaying) return;
      driftClock += 1;
      applyDrift();
    }, 15000);
  }

  // ---------------------------------------------------------------------------
  // Wake lock: keep the display on while it is actually being a screensaver
  // (screensaver mode, fullscreen, or launched as an installed app).
  // ---------------------------------------------------------------------------

  let wakeLock = null;

  function wantsWakeLock() {
    return isPlaying && !document.hidden && (saverMode || isNativeFullscreen || standaloneQuery.matches);
  }

  async function updateWakeLock() {
    if (!("wakeLock" in navigator)) return;
    if (wantsWakeLock()) {
      if (wakeLock) return;
      try {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => {
          wakeLock = null;
        });
      } catch (e) {
        wakeLock = null; // denied (battery saver, unfocused iframe, ...)
      }
    } else if (wakeLock) {
      const lock = wakeLock;
      wakeLock = null;
      lock.release().catch(() => {});
    }
  }

  // ---------------------------------------------------------------------------
  // Shuffle looks (opt-in): a new palette and ball style every few minutes.
  // ---------------------------------------------------------------------------

  let nextShuffleAt = SHUFFLE_EVERY_MS;

  function nextLook() {
    const themes = S.THEMES;
    const idx = themes.findIndex((t) => t.key === settings.themeKey);
    const nextTheme = themes[(idx + 1) % themes.length];
    const styles = S.BALL_STYLES.filter((b) => b.key !== settings.ballStyle);
    const nextStyle = styles[Math.floor(Math.random() * styles.length)];
    applyTheme(nextTheme.key, { animate: true });
    setBallStyle(nextStyle.key);
  }

  function tickShuffle() {
    if (!settings.shuffle) return;
    if (playTime >= nextShuffleAt) {
      nextShuffleAt = playTime + SHUFFLE_EVERY_MS;
      nextLook();
    }
  }

  function applyShuffleState(enabled) {
    settings.shuffle = enabled;
    shuffleToggle.checked = enabled;
    nextShuffleAt = playTime + SHUFFLE_EVERY_MS;
  }

  // ---------------------------------------------------------------------------
  // Clock overlay (opt-in)
  // ---------------------------------------------------------------------------

  let clockTimer = null;
  const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

  function renderClock() {
    const now = new Date();
    const time = timeFormat.format(now);
    if (clockTime.textContent !== time) {
      clockTime.textContent = time;
      clockTime.dateTime = now.toISOString();
      clockDate.textContent = dateFormat.format(now);
    }
  }

  function applyClockState(enabled) {
    settings.clock = enabled;
    clockToggle.checked = enabled;
    clockEl.hidden = !enabled;
    clearInterval(clockTimer);
    if (enabled) {
      renderClock();
      clockTimer = setInterval(renderClock, 1000);
    }
  }

  // ---------------------------------------------------------------------------
  // Share link
  // ---------------------------------------------------------------------------

  let toastTimer = null;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("visible"), 1800);
  }

  async function shareLink() {
    const hash = shareHash();
    const url = `${location.origin}${location.pathname}${hash ? `#${hash}` : ""}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch (e) {
      window.prompt("Copy this link", url);
    }
  }

  // ---------------------------------------------------------------------------
  // Drag-to-resize corners
  // ---------------------------------------------------------------------------

  function attachDragResize() {
    let active = false;
    let start = null;
    let pending = null;
    let raf = null;

    function onMove(e) {
      if (!active) return;
      e.preventDefault();
      const dist = Math.max(10, Math.hypot(e.clientX - start.centerX, e.clientY - start.centerY));
      const scale = clamp(dist / start.dist, 0.4, 3);
      pending = { w: start.w * scale, h: start.h * scale };
      if (!raf) {
        raf = requestAnimationFrame(() => {
          if (pending) setFrameSize(pending.w, pending.h);
          pending = null;
          raf = null;
        });
      }
    }

    function onUp() {
      active = false;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    }

    dragHandles.forEach((handle) => {
      handle.addEventListener("pointerdown", (e) => {
        active = true;
        const rect = canvasFrame.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        start = {
          w: requestedSize.w,
          h: requestedSize.h,
          centerX,
          centerY,
          dist: Math.max(10, Math.hypot(e.clientX - centerX, e.clientY - centerY))
        };
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------

  function applySettingsToUI() {
    tileSizeInput.value = settings.tileSizeRaw;
    tileSizeValue.textContent = `${P.nonLinearTileSize(settings.tileSizeRaw)}px`;
    chaosInput.value = settings.chaosRaw;
    chaosValue.textContent = P.nonLinearChaos(settings.chaosRaw).toFixed(2);
    setSpeedMood(settings.speedMood, { skipSave: true });
    setBallStyle(settings.ballStyle, { skipSave: true });
    if (world) world.chaos = P.nonLinearChaos(settings.chaosRaw);
    hideScoreToggle.checked = settings.hideScoreBar;
    setScoreBarVisibility(settings.hideScoreBar);
    applyChromeAutoHideState(settings.autoHideChrome);
    applyCursorAutoHideState(settings.autoHideCursor);
    applyCinematicModeState(settings.cinematicMode);
    applyShuffleState(settings.shuffle);
    applyClockState(settings.clock);
  }

  function isTypingTarget(el) {
    return el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !["range", "checkbox", "color"].includes(el.type)));
  }

  function initControls() {
    buildThemePicker();
    buildBallPicker();
    attachSpeedDial();
    attachPickerKeys(themePanel, themePicker, themeSelected);
    attachPickerKeys(ballPanel, ballPicker, ballSelected);

    tileSizeInput.addEventListener("input", (e) => {
      settings.tileSizeRaw = Number(e.target.value);
      tileSizeValue.textContent = `${P.nonLinearTileSize(settings.tileSizeRaw)}px`;
      setFrameSize(requestedSize.w, requestedSize.h);
      saveSettings();
    });

    chaosInput.addEventListener("input", (e) => {
      settings.chaosRaw = Number(e.target.value);
      world.chaos = P.nonLinearChaos(settings.chaosRaw);
      chaosValue.textContent = world.chaos.toFixed(2);
      saveSettings();
    });

    const onColorInput = (slot) => (e) => {
      settings[slot === "day" ? "dayColor" : "nightColor"] = e.target.value;
      applyTheme("custom");
    };
    dayColorInput.addEventListener("input", onColorInput("day"));
    nightColorInput.addEventListener("input", onColorInput("night"));

    themeSelected.addEventListener("click", () => togglePicker(themePicker, themeSelected));
    ballSelected.addEventListener("click", () => togglePicker(ballPicker, ballSelected));
    document.addEventListener("click", (e) => {
      if (!themePicker.contains(e.target) && !ballPicker.contains(e.target)) closePickers();
    });

    hideScoreToggle.addEventListener("change", (e) => {
      settings.hideScoreBar = e.target.checked;
      setScoreBarVisibility(settings.hideScoreBar);
      saveSettings();
    });
    autoHideUiToggle.addEventListener("change", (e) => {
      applyChromeAutoHideState(e.target.checked);
      saveSettings();
    });
    autoHideCursorToggle.addEventListener("change", (e) => {
      applyCursorAutoHideState(e.target.checked);
      saveSettings();
    });
    cinematicModeToggle.addEventListener("change", (e) => {
      applyCinematicModeState(e.target.checked);
      saveSettings();
    });
    shuffleToggle.addEventListener("change", (e) => {
      applyShuffleState(e.target.checked);
      saveSettings();
    });
    clockToggle.addEventListener("change", (e) => {
      applyClockState(e.target.checked);
      saveSettings();
    });

    drawerResetSettings.addEventListener("click", resetSettingsToDefault);
    drawerFullscreen.addEventListener("click", () => toggleFullscreen());
    drawerSaver.addEventListener("click", () => setSaverMode(!saverMode));
    drawerShare.addEventListener("click", shareLink);
    playPauseBtn.addEventListener("click", togglePlayPause);
    resetBtn.addEventListener("click", resetGame);
    saverBtn.addEventListener("click", () => setSaverMode(!saverMode));
    configBtn.addEventListener("click", () => toggleSettings(true));
    closeConfigBtn.addEventListener("click", () => toggleSettings(false));
    drawerOverlay.addEventListener("click", () => toggleSettings(false));
    scatterBtn.addEventListener("click", scatterStart);
    swapSidesBtn.addEventListener("click", swapSides);

    document.addEventListener("keydown", (e) => {
      if (kiosk || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === "Escape") {
        if (drawerOpen()) toggleSettings(false);
        else if (saverMode) setSaverMode(false);
        return;
      }
      if (e.code === "Space") {
        // Let focused buttons and switches handle Space themselves.
        if (e.target.closest && e.target.closest("button, input, [role='slider']")) return;
        e.preventDefault();
        togglePlayPause();
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "s") toggleSettings();
      else if (key === "f") setSaverMode(!saverMode);
      else if (key === "n") nextLook();
      else if (key === "r") resetGame();
      else return;
      if (saverMode && key !== "f") revealChrome(1500);
    });

    // Keep focus inside the drawer while it is open.
    configPanel.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const focusables = [...configPanel.querySelectorAll("button, input, [tabindex='0']")].filter(
        (el) => !el.disabled && el.offsetParent !== null
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    // Pasting a share link into an open tab only changes the hash.
    window.addEventListener("hashchange", () => {
      const { settings: incoming } = S.fromHash(location.hash);
      if (!Object.keys(incoming).length) return;
      Object.assign(settings, S.applyLink(settings, incoming));
      applySettingsToUI();
      applyTheme(settings.themeKey);
      setFrameSize(requestedSize.w, requestedSize.h);
    });

    let resizeRaf = null;
    window.addEventListener("resize", () => {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = null;
        fillWindow();
      });
    });
    watchDevicePixelRatio();

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopLoop();
      } else {
        startLoop();
        renderIfPaused();
      }
      updateWakeLock();
    });

    window.addEventListener("pointermove", handlePointerActivity, { passive: true });
    window.addEventListener("pointerdown", handlePointerActivity, { passive: true });
    chromeControls.addEventListener("pointerenter", () => {
      clearTimeout(chromeHideTimeout);
      chromeControls.classList.add("is-revealed");
    });
    chromeControls.addEventListener("pointerleave", () => hideChromeAfterDelay(650));
    chromeControls.addEventListener("focusin", () => {
      clearTimeout(chromeHideTimeout);
      chromeControls.classList.add("is-revealed");
    });
    chromeControls.addEventListener("focusout", () => hideChromeAfterDelay(900));

    ["fullscreenchange", "webkitfullscreenchange"].forEach((evt) => {
      document.addEventListener(evt, handleFullscreenChange);
    });
    standaloneQuery.addEventListener("change", updateWakeLock);
    reducedMotion.addEventListener("change", applyMotionPreference);

    attachDragResize();
  }

  // Re-render crisply when the window moves to a screen with another DPR.
  function watchDevicePixelRatio() {
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    mq.addEventListener(
      "change",
      () => {
        applyBoardSize();
        watchDevicePixelRatio();
      },
      { once: true }
    );
  }

  // Reduced motion starts paused and pauses when the preference is enabled.
  // Space remains an explicit opt-in to movement; random patterns stay fixed.
  function applyMotionPreference() {
    renderer.setNoise(reducedMotion.matches ? () => 0.5 : Math.random);
    if (reducedMotion.matches) {
      isPlaying = false;
      stopLoop();
      syncPlayPauseButtons();
    }
    document.documentElement.classList.toggle("reduce-motion", reducedMotion.matches);
  }

  function start() {
    if (kiosk) document.body.classList.add("kiosk");
    applyMotionPreference();
    applyColorsToRenderer();
    updateCssPalette();
    createWorld();
    initControls();
    applySettingsToUI();
    applyTheme(settings.themeKey, { skipSave: true });
    syncPlayPauseButtons();
    updateFullscreenLabel();
    configPanel.inert = true;
    if (!settings.autoHideChrome) chromeControls.classList.add("is-revealed");
    else revealChrome(1600);
    startDriftTimer();
    if (kiosk) setSaverMode(true);
    syncUrl();
    startLoop();
    updateWakeLock();

    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }

    // Small debugging/testing handle.
    window.endlessPong = {
      get world() {
        return world;
      },
      settings,
      nextLook,
      setSaverMode,
      repaint: repaintAll
    };
  }

  start();
})();
