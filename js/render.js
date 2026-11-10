/*
 * Drawing. Two stacked canvases:
 *  - tiles: opaque, repainted only where tiles changed hands, with tile edges
 *    snapped to device pixels so neighbouring tiles never show seams;
 *  - balls: transparent, cleared and redrawn each frame using dirty rects.
 * Ball looks (paintBall) are carried over from the original script.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PongRender = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EMOJI = ["☀️", "🌙"];

  const rgbCache = new Map();
  function hexToRgb(hex) {
    let rgb = rgbCache.get(hex);
    if (!rgb) {
      const bigint = parseInt(hex.replace("#", ""), 16);
      rgb = { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
      rgbCache.set(hex, rgb);
    }
    return rgb;
  }

  // rgba() and mixHex() run many times per frame; cache their string results.
  const rgbaCache = new Map();
  function rgba(hex, alpha) {
    const key = hex + alpha;
    let out = rgbaCache.get(key);
    if (out === undefined) {
      const { r, g, b } = hexToRgb(hex);
      out = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      if (rgbaCache.size > 4000) rgbaCache.clear();
      rgbaCache.set(key, out);
    }
    return out;
  }

  const mixCache = new Map();
  function mixHex(a, b, t) {
    const key = a + b + t;
    let out = mixCache.get(key);
    if (out === undefined) {
      const ca = hexToRgb(a);
      const cb = hexToRgb(b);
      const toHex = (v) => Math.round(v).toString(16).padStart(2, "0");
      out = `#${toHex(ca.r + (cb.r - ca.r) * t)}${toHex(ca.g + (cb.g - ca.g) * t)}${toHex(ca.b + (cb.b - ca.b) * t)}`;
      if (mixCache.size > 4000) mixCache.clear();
      mixCache.set(key, out);
    }
    return out;
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

  function paintBall(ctxTarget, ball, palette, style, radius, theme, noise) {
    const baseColor = theme.colors[ball.owner];
    const accent = theme.accent;
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
      // Orbital Ring: Multiple concentric rings with a strong core
      const contrast = palette.isLight ? theme.colors[1] : "#ffffff";

      // Outer glow
      const halo = ctxTarget.createRadialGradient(0, 0, radius * 0.6, 0, 0, radius * 1.8);
      halo.addColorStop(0, rgba(palette.rim, 0.45));
      halo.addColorStop(0.5, rgba(palette.depth, 0.15));
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctxTarget.fillStyle = halo;
      ctxTarget.beginPath();
      ctxTarget.arc(0, 0, radius * 1.8, 0, Math.PI * 2);
      ctxTarget.fill();

      // Core
      ctxTarget.fillStyle = rgba(palette.rim, 0.9);
      ctxTarget.beginPath();
      ctxTarget.arc(0, 0, radius * 0.35, 0, Math.PI * 2);
      ctxTarget.fill();

      // Orbital Rings
      ctxTarget.strokeStyle = rgba(contrast, 0.8);
      ctxTarget.lineWidth = radius * 0.12;
      ctxTarget.beginPath();
      ctxTarget.arc(0, 0, radius * 0.6, 0, Math.PI * 2);
      ctxTarget.stroke();

      ctxTarget.strokeStyle = rgba(palette.outline, 0.6);
      ctxTarget.lineWidth = radius * 0.08;
      ctxTarget.beginPath();
      ctxTarget.arc(0, 0, radius * 0.95, 0, Math.PI * 2);
      ctxTarget.stroke();

      ctxTarget.strokeStyle = rgba(palette.rim, 0.4);
      ctxTarget.lineWidth = radius * 0.06;
      ctxTarget.beginPath();
      ctxTarget.arc(0, 0, radius * 1.25, 0, Math.PI * 2);
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
      ctxTarget.stroke();
    } else if (style === "glitch") {
      const contrast = palette.isLight ? "#000" : "#fff";
      ctxTarget.fillStyle = rgba(palette.rim, 0.85);
      ctxTarget.beginPath();
      ctxTarget.arc(0, 0, radius * 0.9, 0, Math.PI * 2);
      ctxTarget.fill();

      // Glitch slices
      const slices = 4;
      for (let i = 0; i < slices; i++) {
        const h = (radius * 2) / slices;
        const y = -radius + i * h;
        const offset = (noise() - 0.5) * radius * 0.4;
        ctxTarget.fillStyle = i % 2 === 0 ? rgba(palette.depth, 0.8) : rgba(contrast, 0.8);
        ctxTarget.fillRect(-radius + offset, y, radius * 2, h * 0.8);
      }

      // Digital artifacts
      ctxTarget.fillStyle = rgba(theme.accent, 0.9);
      ctxTarget.fillRect(-radius * 0.5, -radius * 0.2, radius * 0.2, radius * 0.2);
      ctxTarget.fillRect(radius * 0.3, radius * 0.4, radius * 0.3, radius * 0.1);

    } else if (style === "pixel") {
      const pxSize = radius * 0.4;
      const steps = Math.ceil(radius * 2 / pxSize);
      for (let x = 0; x < steps; x++) {
        for (let y = 0; y < steps; y++) {
          const rx = -radius + x * pxSize;
          const ry = -radius + y * pxSize;
          const dist = Math.hypot(rx + pxSize / 2, ry + pxSize / 2);
          if (dist < radius) {
            // Checkboard pattern-ish
            const isRim = dist > radius * 0.6;
            ctxTarget.fillStyle = isRim ? rgba(palette.rim, 0.9) : rgba(palette.depth, 0.8);
            if (noise() > 0.9) ctxTarget.fillStyle = rgba(theme.accent, 1);
            ctxTarget.fillRect(rx, ry, pxSize - 1, pxSize - 1);
          }
        }
      }
    } else if (style === "bubble") {
      // Transparent body
      ctxTarget.fillStyle = rgba(palette.rim, 0.15);
      ctxTarget.beginPath();
      ctxTarget.arc(0, 0, radius, 0, Math.PI * 2);
      ctxTarget.fill();

      // Rim
      ctxTarget.strokeStyle = rgba(palette.rim, 0.6);
      ctxTarget.lineWidth = 1.5;
      ctxTarget.stroke();

      // Strong highlight
      ctxTarget.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctxTarget.beginPath();
      ctxTarget.ellipse(-radius * 0.4, -radius * 0.4, radius * 0.3, radius * 0.15, -Math.PI / 4, 0, Math.PI * 2);
      ctxTarget.fill();

      // Secondary highlight
      ctxTarget.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctxTarget.beginPath();
      ctxTarget.arc(radius * 0.5, radius * 0.5, radius * 0.1, 0, Math.PI * 2);
      ctxTarget.fill();

    } else if (style === "emoji") {
      ctxTarget.font = `${radius * 3}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
      ctxTarget.textAlign = "center";
      ctxTarget.textBaseline = "middle";
      // One emoji per faction.
      const e = EMOJI[ball.owner] || EMOJI[0];
      ctxTarget.fillText(e, 0, radius * 0.1);
    } else {
      const contrastColor = palette.isLight ? theme.colors[1] : "#ffffff";
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

  // How far past its radius each style can paint (trails handled separately).
  const STYLE_REACH = { halo: 1.9, comet: 1.9, glow: 1.5, trail: 1.4, spark: 1.2, glitch: 1.3, emoji: 1.7 };

  function createRenderer(tileCanvas, ballCanvas) {
    const tileCtx = tileCanvas.getContext("2d", { alpha: false });
    const ballCtx = ballCanvas.getContext("2d");
    let dpr = 1;
    let colEdges = [];
    let rowEdges = [];
    let theme = { colors: ["#ffffff", "#000000"], accent: "#ffffff" };
    let palettes = [];
    let dirty = [];
    let noise = Math.random;

    function setTheme(colors, accent) {
      theme = { colors, accent };
      palettes = colors.map((c) => buildBallPalette(c, accent));
    }

    function setNoise(fn) {
      noise = fn;
    }

    function resize(world, devicePixelRatio) {
      dpr = devicePixelRatio;
      const t = world.tileSize * dpr;
      colEdges = Array.from({ length: world.gridWidth + 1 }, (_, i) => Math.round(i * t));
      rowEdges = Array.from({ length: world.gridHeight + 1 }, (_, i) => Math.round(i * t));
      const pxW = colEdges[world.gridWidth];
      const pxH = rowEdges[world.gridHeight];
      for (const canvas of [tileCanvas, ballCanvas]) {
        canvas.width = pxW;
        canvas.height = pxH;
        canvas.style.width = `${pxW / dpr}px`;
        canvas.style.height = `${pxH / dpr}px`;
      }
      tileCtx.setTransform(1, 0, 0, 1, 0, 0);
      ballCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirty = [];
      paintAllTiles(world);
    }

    // Full repaint, grouping same-owner runs into one fillRect each.
    function paintAllTiles(world) {
      const { gridWidth, gridHeight, ownership } = world;
      let lastOwner = -1;
      for (let row = 0; row < gridHeight; row++) {
        const y = rowEdges[row];
        const h = rowEdges[row + 1] - y;
        const rowOffset = row * gridWidth;
        let col = 0;
        while (col < gridWidth) {
          const owner = ownership[rowOffset + col];
          let end = col + 1;
          while (end < gridWidth && ownership[rowOffset + end] === owner) end++;
          if (owner !== lastOwner) {
            tileCtx.fillStyle = theme.colors[owner];
            lastOwner = owner;
          }
          tileCtx.fillRect(colEdges[col], y, colEdges[end] - colEdges[col], h);
          col = end;
        }
      }
    }

    function paintTiles(world, indices) {
      const { gridWidth, ownership } = world;
      let lastOwner = -1;
      for (let i = 0; i < indices.length; i++) {
        const idx = indices[i];
        const owner = ownership[idx];
        const col = idx % gridWidth;
        const row = (idx - col) / gridWidth;
        if (owner !== lastOwner) {
          tileCtx.fillStyle = theme.colors[owner];
          lastOwner = owner;
        }
        tileCtx.fillRect(colEdges[col], rowEdges[row], colEdges[col + 1] - colEdges[col], rowEdges[row + 1] - rowEdges[row]);
      }
    }

    function drawBalls(world) {
      for (const r of dirty) ballCtx.clearRect(r.x, r.y, r.w, r.h);
      dirty = [];
      const style = world.ballStyle;
      const radius = world.ballRadius;
      const reach = radius * (STYLE_REACH[style] || 1.2) + 14;
      for (const ball of world.balls) {
        let minX = ball.x;
        let maxX = ball.x;
        let minY = ball.y;
        let maxY = ball.y;
        if (style === "trail" || style === "comet") {
          for (const p of ball.history) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
          }
          const vx = Math.abs(ball.vx) * 0.5;
          const vy = Math.abs(ball.vy) * 0.5;
          minX -= vx; maxX += vx; minY -= vy; maxY += vy;
        }
        paintBall(ballCtx, ball, palettes[ball.owner], style, radius, theme, noise);
        dirty.push({ x: minX - reach, y: minY - reach, w: maxX - minX + reach * 2, h: maxY - minY + reach * 2 });
      }
    }

    function clearBalls() {
      ballCtx.save();
      ballCtx.setTransform(1, 0, 0, 1, 0, 0);
      ballCtx.clearRect(0, 0, ballCanvas.width, ballCanvas.height);
      ballCtx.restore();
      dirty = [];
    }

    return { setTheme, setNoise, resize, paintAllTiles, paintTiles, drawBalls, clearBalls };
  }

  // Picker preview, identical to the original's 60px swatch but DPR-crisp.
  function renderBallPreview(canvas, styleKey, theme) {
    const size = 60;
    const scale = (typeof devicePixelRatio === "number" && devicePixelRatio) || 1;
    const ctx = canvas.getContext("2d");
    canvas.width = Math.round(size * scale);
    canvas.height = Math.round(size * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const night = theme.colors[1];
    const tileBg = ctx.createLinearGradient(0, 0, size, size);
    tileBg.addColorStop(0, rgba(night, 0.82));
    tileBg.addColorStop(1, rgba(night, 0.9));
    ctx.fillStyle = tileBg;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = rgba("#ffffff", 0.08);
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
    const c = size * 0.52;
    const ball = {
      owner: 0,
      x: c,
      y: c,
      vx: 2.4,
      vy: -1.2,
      history: [
        { x: c - 6, y: c - 6 },
        { x: c - 12, y: c - 10 },
        { x: c - 18, y: c - 12 }
      ]
    };
    paintBall(ctx, ball, buildBallPalette(theme.colors[0], theme.accent), styleKey, size * 0.22, theme, Math.random);
  }

  return { createRenderer, renderBallPreview, paintBall, buildBallPalette, mixHex, rgba, luminance, hexToRgb };
});
