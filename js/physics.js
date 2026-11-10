/*
 * Endless Pong simulation core.
 *
 * The collision and tile-takeover rules come from Pong Wars (Koen van Gilst)
 * by way of Dynamic Pong Wars (Marko Denic), with this project's tuning
 * (chaos jitter, axis rebalancing, stuck-pair breakout, cinematic assist).
 *
 * Everything here is deliberately framework- and DOM-free so it can run in a
 * browser, in Node tests, and inside the macOS screen saver wrapper.
 *
 * INVARIANT: `step()` must produce bit-identical results to
 * the pre-refactor render loop (tests/legacy/script.legacy.js) for the same
 * random sequence. tests/physics.test.js enforces this. If you touch anything
 * below, run `npm test` and do not regenerate the golden file to make it pass.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PongPhysics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
  }

  // Small, fast, seedable PRNG. Used by tests and by shareable seeded boards.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Slider value (0-100) to tile size in CSS px.
  function nonLinearTileSize(raw) {
    const min = 14;
    const max = 80;
    const t = Math.pow(raw / 100, 0.8);
    return Math.round(min + t * (max - min));
  }

  // Slider value (0-100) to chaos amount.
  function nonLinearChaos(raw) {
    const t = Math.pow(raw / 100, 1.6);
    const base = 0.06;
    return parseFloat((base + t * 0.9).toFixed(3));
  }

  // Ball radius as a fraction of tile size, per ball style. The radius is part
  // of the physics (it sets the collision box), so styles change behavior.
  const BALL_RADIUS_SCALE = {
    glow: 0.52,
    halo: 0.54,
    fill: 0.5,
    grid: 0.48,
    trail: 0.5,
    comet: 0.52,
    spark: 0.48,
    glitch: 0.5,
    pixel: 0.48,
    bubble: 0.52,
    emoji: 0.55
  };

  function ballRadiusFor(style, tileSize) {
    return tileSize * (BALL_RADIUS_SCALE[style] || 0.44);
  }

  // Original Pong Wars uses MIN_SPEED = 5, MAX_SPEED = 10. speedMood is a
  // 0.2x-20x multiplier, lightly boosted for small tiles so big grids stay lively.
  function deriveSpeeds(tileSize, speedMood) {
    const baseMin = 4;
    const baseMax = 9;
    const baselineTile = 55;
    const tileScale = clamp(Math.sqrt(baselineTile / tileSize), 1, 1.8);
    return {
      minSpeed: baseMin * speedMood * tileScale,
      maxSpeed: baseMax * speedMood * tileScale
    };
  }

  // Left half belongs to owner 0 (day), right half to owner 1 (night).
  function initialOwnership(gridWidth, gridHeight) {
    return Array.from({ length: gridWidth * gridHeight }, (_, idx) => (idx % gridWidth < gridWidth / 2 ? 0 : 1));
  }

  // Nearest-neighbour remap used when the board is resized.
  function remapOwnership(oldOwners, oldW, oldH, newW, newH) {
    if (!oldOwners || !oldOwners.length) return initialOwnership(newW, newH);
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

  // Like the original: simple diagonal velocities from the middle of each half.
  function startingBalls(world) {
    const speed = (world.minSpeed + world.maxSpeed) / 2;
    const d = speed * 0.707; // sqrt(2)/2 for a 45 degree start
    return [
      { owner: 0, x: world.width * 0.25, y: world.height * 0.5, vx: d, vy: -d, history: [] },
      { owner: 1, x: world.width * 0.75, y: world.height * 0.5, vx: -d, vy: d, history: [] }
    ];
  }

  function recount(world) {
    const counts = [0, 0];
    const owners = world.ownership;
    for (let i = 0; i < owners.length; i++) counts[owners[i]]++;
    world.counts = counts;
  }

  /**
   * Create a simulation world.
   * opts: { width, height, tileSize, speedMood, chaos, ballStyle,
   *         cinematicMode, rng, historyLength? }
   * width/height are the desired board size in CSS px; the board snaps up to a
   * whole number of tiles, exactly like the original.
   */
  function createWorld(opts) {
    const world = {
      rng: opts.rng || Math.random,
      tileSize: opts.tileSize,
      speedMood: opts.speedMood,
      chaos: opts.chaos,
      ballStyle: opts.ballStyle || "glow",
      cinematicMode: Boolean(opts.cinematicMode),
      historyLength: opts.historyLength ?? 14,
      gridWidth: 0,
      gridHeight: 0,
      width: 0,
      height: 0,
      ballRadius: 0,
      minSpeed: 0,
      maxSpeed: 0,
      ownership: [],
      counts: [],
      balls: [],
      claimed: [],
      steps: 0,
      cinematic: { owner: null, strength: 0, frames: 0, lastDominance: 0.5 },
      pair: { stuckFrames: 0, lastDistance: null }
    };
    world.ballRadius = ballRadiusFor(world.ballStyle, world.tileSize);
    Object.assign(world, deriveSpeeds(world.tileSize, world.speedMood));
    resizeWorld(world, opts.width, opts.height, { preserve: false });
    world.balls = startingBalls(world);
    clampBallsToFrame(world);
    return world;
  }

  /**
   * Resize the board (and optionally change the tile size), keeping territory
   * and ball positions proportional. Mirrors the original rebuildGrid().
   */
  function resizeWorld(world, width, height, { preserve = true, tileSize } = {}) {
    if (tileSize && tileSize !== world.tileSize) {
      world.tileSize = tileSize;
      world.ballRadius = ballRadiusFor(world.ballStyle, tileSize);
      Object.assign(world, deriveSpeeds(tileSize, world.speedMood));
    }
    const oldOwners = preserve ? world.ownership : null;
    const oldW = world.gridWidth || 1;
    const oldH = world.gridHeight || 1;
    const oldLogicalW = world.width || width;
    const oldLogicalH = world.height || height;

    world.gridWidth = Math.max(8, Math.ceil(width / world.tileSize));
    world.gridHeight = Math.max(8, Math.ceil(height / world.tileSize));
    world.width = world.gridWidth * world.tileSize;
    world.height = world.gridHeight * world.tileSize;
    world.ownership = remapOwnership(oldOwners, oldW, oldH, world.gridWidth, world.gridHeight);
    recount(world);

    const scaleX = world.width / oldLogicalW;
    const scaleY = world.height / oldLogicalH;
    for (const b of world.balls) {
      b.x *= scaleX;
      b.y *= scaleY;
      b.vx *= scaleX;
      b.vy *= scaleY;
      b.history = (b.history || []).map((p) => ({ x: p.x * scaleX, y: p.y * scaleY }));
    }
    clampBallsToFrame(world);
    world.claimed.length = 0;
  }

  function setSpeedMood(world, speedMood) {
    world.speedMood = speedMood;
    Object.assign(world, deriveSpeeds(world.tileSize, speedMood));
  }

  function setBallStyle(world, style) {
    world.ballStyle = style;
    world.ballRadius = ballRadiusFor(style, world.tileSize);
  }

  function setCinematicMode(world, enabled) {
    world.cinematicMode = Boolean(enabled);
    if (!enabled) world.cinematic = { owner: null, strength: 0, frames: 0, lastDominance: 0.5 };
  }

  // Put every tile and ball back at the starting layout.
  function resetWorld(world) {
    world.ownership = initialOwnership(world.gridWidth, world.gridHeight);
    recount(world);
    world.balls = startingBalls(world);
    clampBallsToFrame(world);
    world.claimed.length = 0;
  }

  // Random noise board ("scatter start").
  function scatterWorld(world, rng = world.rng) {
    world.ownership = world.ownership.map(() => (rng() > 0.5 ? 1 : 0));
    recount(world);
    world.claimed.length = 0;
  }

  // ---------------------------------------------------------------------------
  // Rules. Everything below runs once per simulation step, in this order.
  // ---------------------------------------------------------------------------

  function updateCinematic(world) {
    const c = world.cinematic;
    const totalTiles = world.counts[0] + world.counts[1] || 1;
    const dayRatio = world.counts[0] / totalTiles;
    const dominance = Math.max(dayRatio, 1 - dayRatio);
    const threshold = 0.7;

    if (!world.cinematicMode) {
      if (c.strength !== 0 || c.frames !== 0) {
        c.strength = 0;
        c.owner = null;
        c.frames = 0;
        c.lastDominance = 0.5;
      }
      return;
    }

    let targetStrength = 0;
    if (dominance > threshold) {
      targetStrength = clamp((dominance - threshold) / (1 - threshold), 0, 1);
    }
    const targetOwner = dayRatio > 0.5 ? 1 : 0;
    if (targetStrength > 0) {
      if (c.owner !== targetOwner) {
        c.owner = targetOwner;
        c.frames = 0;
        c.lastDominance = dominance;
      }
      if (dominance < c.lastDominance - 0.002) {
        c.frames = Math.max(0, c.frames - 4);
      } else {
        c.frames += 1;
      }
      c.lastDominance = dominance;
      const timeRamp = clamp(c.frames / (60 * 8), 0, 1);
      const boostedTarget = targetStrength + timeRamp * 0.9;
      c.strength = clamp(c.strength * 0.9 + boostedTarget * 0.1, 0, 1.6);
    } else {
      c.frames = 0;
      c.lastDominance = dominance;
      c.strength *= 0.9;
      if (c.strength < 0.001) {
        c.strength = 0;
        c.owner = null;
      }
    }
  }

  function detectCollision(world, ball) {
    const { tileSize, gridWidth, gridHeight, ballRadius, ownership, counts, rng } = world;
    const minCol = clamp(Math.floor((ball.x - ballRadius) / tileSize), 0, gridWidth - 1);
    const maxCol = clamp(Math.floor((ball.x + ballRadius) / tileSize), 0, gridWidth - 1);
    const minRow = clamp(Math.floor((ball.y - ballRadius) / tileSize), 0, gridHeight - 1);
    const maxRow = clamp(Math.floor((ball.y + ballRadius) / tileSize), 0, gridHeight - 1);

    // Like the original: bounce off each tile individually for erratic movement.
    for (let row = minRow; row <= maxRow; row++) {
      const rowOffset = row * gridWidth;
      for (let col = minCol; col <= maxCol; col++) {
        const idx = rowOffset + col;
        const previous = ownership[idx];
        if (previous === ball.owner) continue;

        // Claim the tile.
        ownership[idx] = ball.owner;
        counts[previous]--;
        counts[ball.owner]++;
        world.claimed.push(idx);

        // Bounce off the axis with the greater displacement from tile center,
        // with slight randomness to prevent infinite stable loops.
        const tileCenterX = (col + 0.5) * tileSize;
        const tileCenterY = (row + 0.5) * tileSize;
        const dx = ball.x - tileCenterX;
        const dy = ball.y - tileCenterY;
        const assistJitter =
          world.cinematicMode && world.cinematic.owner === ball.owner ? world.cinematic.strength * 1.1 : 0;
        const jitterStrength = 0.4 + world.chaos * 1.2 + assistJitter;
        const jitter = (rng() - 0.5) * jitterStrength;
        if (Math.abs(dx) > Math.abs(dy)) {
          ball.vx = -ball.vx;
          ball.vy += jitter;
        } else {
          ball.vy = -ball.vy;
          ball.vx += jitter;
        }
      }
    }
  }

  function rebalanceAxialBias(ball, strength, rng) {
    const absVx = Math.abs(ball.vx);
    const absVy = Math.abs(ball.vy);
    const total = absVx + absVy;
    if (total < 0.001) return;

    const horizRatio = absVx / total;
    const maxDominance = 0.85;
    const minDominance = 1 - maxDominance;

    if (horizRatio > maxDominance) {
      const excess = horizRatio - maxDominance;
      const signY = Math.sign(ball.vy) || (rng() < 0.5 ? -1 : 1);
      ball.vy += signY * (excess * strength * total);
    } else if (horizRatio < minDominance) {
      const excess = minDominance - horizRatio;
      const signX = Math.sign(ball.vx) || (rng() < 0.5 ? -1 : 1);
      ball.vx += signX * (excess * strength * total);
    }
  }

  function updateBall(world, ball) {
    const { rng, chaos, minSpeed, maxSpeed } = world;

    // Trail history is visual only.
    if (world.historyLength > 0) {
      ball.history.unshift({ x: ball.x, y: ball.y });
      if (ball.history.length > world.historyLength) ball.history.length = world.historyLength;
    }

    // Random drift like the original's ACCELERATION, scaled by chaos.
    const acceleration = 0.08 + chaos * 0.8;
    ball.vx += (rng() - 0.5) * acceleration;
    ball.vy += (rng() - 0.5) * acceleration;

    // Prevent boring vertical/horizontal loops with a minimum per-axis speed.
    const minAxisSpeed = 0.6;
    if (Math.abs(ball.vx) < minAxisSpeed) ball.vx = (ball.vx >= 0 ? 1 : -1) * minAxisSpeed;
    if (Math.abs(ball.vy) < minAxisSpeed) ball.vy = (ball.vy >= 0 ? 1 : -1) * minAxisSpeed;

    rebalanceAxialBias(ball, 0.22 + chaos * 0.35, rng);

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

    const c = world.cinematic;
    if (world.cinematicMode && c.strength > 0 && c.owner === ball.owner) {
      const strength = c.strength;
      const boost = 1 + strength * 0.08;
      ball.vx *= boost;
      ball.vy *= boost;

      const nudge = strength * (0.05 + chaos * 0.07);
      ball.vx += (rng() - 0.5) * nudge;
      ball.vy += (rng() - 0.5) * nudge;

      rebalanceAxialBias(ball, 0.55 + strength * 0.6, rng);

      const newSpeed = Math.hypot(ball.vx, ball.vy) || 0.001;
      const assistedMax = maxSpeed * (1 + strength * 0.18);
      const assistedMin = minSpeed * (1 + strength * 0.06);
      if (newSpeed > assistedMax) {
        const scale = assistedMax / newSpeed;
        ball.vx *= scale;
        ball.vy *= scale;
      } else if (newSpeed < assistedMin) {
        const scale = assistedMin / newSpeed;
        ball.vx *= scale;
        ball.vy *= scale;
      }
    }

    ball.x += ball.vx;
    ball.y += ball.vy;
  }

  function checkBoundaries(world, ball) {
    const r = world.ballRadius;
    if (ball.x < r || ball.x > world.width - r) {
      ball.vx = -ball.vx;
      ball.x = clamp(ball.x, r, world.width - r);
    }
    if (ball.y < r || ball.y > world.height - r) {
      ball.vy = -ball.vy;
      ball.y = clamp(ball.y, r, world.height - r);
    }
  }

  function clampBallsToFrame(world) {
    const r = world.ballRadius;
    for (const ball of world.balls) {
      ball.x = clamp(ball.x, r, world.width - r);
      ball.y = clamp(ball.y, r, world.height - r);
    }
  }

  // Two balls hugging each other can get stuck trading the same tiles; after
  // ~40 steps of that, push them apart.
  function resolveBallPairStuckness(world) {
    const [a, b] = world.balls;
    const state = world.pair;
    const { ballRadius, maxSpeed, chaos, rng } = world;
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dist = Math.hypot(dx, dy);
    const closeThreshold = ballRadius * 2.1;
    const relSpeed = Math.hypot(a.vx - b.vx, a.vy - b.vy);

    const distDelta = state.lastDistance === null ? 0 : Math.abs(dist - state.lastDistance);
    state.lastDistance = dist;

    const isClose = dist < closeThreshold;
    const barelySeparating = distDelta < ballRadius * 0.06;
    const lowRelativeSpeed = relSpeed < maxSpeed * 0.25;

    if (isClose && (lowRelativeSpeed || barelySeparating)) state.stuckFrames += 1;
    else state.stuckFrames = 0;

    if (state.stuckFrames > 40) {
      const angle = dist > 0.001 ? Math.atan2(dy, dx) : rng() * Math.PI * 2;
      const nx = Math.cos(angle);
      const ny = Math.sin(angle);
      const overlap = clamp((closeThreshold - dist) / closeThreshold, 0, 1);
      const baseNudge = 0.35 + chaos * 0.6;
      const nudge = baseNudge * (1 + overlap * 1.4);

      a.vx += nx * nudge;
      a.vy += ny * nudge;
      b.vx -= nx * nudge;
      b.vy -= ny * nudge;

      const sep = ballRadius * 0.25;
      const W = world.width;
      const H = world.height;
      a.x = clamp(a.x + nx * sep, ballRadius, W - ballRadius);
      a.y = clamp(a.y + ny * sep, ballRadius, H - ballRadius);
      b.x = clamp(b.x - nx * sep, ballRadius, W - ballRadius);
      b.y = clamp(b.y - ny * sep, ballRadius, H - ballRadius);

      state.stuckFrames = 0;
    }
  }

  /** Advance the simulation by one fixed step (1/60 s of the original). */
  function step(world) {
    updateCinematic(world);
    const balls = world.balls;
    for (let i = 0; i < balls.length; i++) {
      detectCollision(world, balls[i]);
      updateBall(world, balls[i]);
      checkBoundaries(world, balls[i]);
    }
    clampBallsToFrame(world);
    resolveBallPairStuckness(world);
    world.steps++;
  }

  return {
    BALL_RADIUS_SCALE,
    clamp,
    mulberry32,
    nonLinearTileSize,
    nonLinearChaos,
    ballRadiusFor,
    deriveSpeeds,
    initialOwnership,
    remapOwnership,
    createWorld,
    resizeWorld,
    resetWorld,
    scatterWorld,
    setSpeedMood,
    setBallStyle,
    setCinematicMode,
    step
  };
});
