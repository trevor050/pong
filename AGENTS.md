# AGENTS.md

Endless Pong: Pong Wars as a screensaver. Vanilla HTML/CSS/JS, no build step, no runtime deps. Classic `<script defer>` files (not ES modules) so `file://` and the macOS `.saver` work.

## Layout
- `js/physics.js` sim core (UMD: `window.PongPhysics` / `require`). Pure, RNG injected.
- `js/render.js` two canvases: `#tileCanvas` (opaque, incremental via `world.claimed`, device-pixel-snapped edges) + `#ballCanvas` (dirty-rect clears). `paintBall` is the original art.
- `js/settings.js` themes/ball styles/defaults, storage (key `daynite-drift-settings`, v1-compatible), URL hash (`toHash`/`fromHash`/`applyLink`).
- `js/app.js` UI + loop + screensaver mode + wake lock + drift + shuffle + clock. Debug handle `window.endlessPong` (used by e2e, capture, macOS smoke test).
- `sw.js` precache-all, cache-first, versioned by content hash. `manifest.webmanifest`, `icons/`.
- `macos/` ScreenSaverView + WKWebView wrapper, loads `Resources/web/index.html#saver`.
- `scripts/static-server.js` serves repo; `/legacy/*` serves commit ae9f8b8 (pre-overhaul) from git.

## Commands
- `npm test` unit (physics golden + live legacy compare, settings, pwa). `npm run check` = stamp check + unit.
- `npm run test:e2e` Playwright Chromium (dev dep; uses cached chromium-1254 locally).
- `npm run stamp` after editing ANY precached file, else CI fails (`sw.js` VERSION = content hash).
- `npm run profile`, `npm run capture` (needs ffmpeg).
- `./macos/build.sh [--install]`, `swift macos/smoke-test.swift [out.png]`.

## Invariants / hazards
- Physics must stay bit-identical to `tests/legacy/script.legacy.js` (frozen original). Do NOT regenerate `tests/golden/physics.json` to make a failing test pass. RNG call order matters (detectCollision jitter, updateBall drift, cinematic nudge, rebalance sign, stuck nudge).
- Ball style changes physics (radius = tileSize * BALL_RADIUS_SCALE[style]).
- Legacy drew glitch/pixel with Math.random sharing the physics stream; scenarios avoid those styles.
- Loop: fixed 60 steps/s with rounding accumulator (keeps 60 Hz at exactly 1 step/frame); >250 ms gaps are skipped (some Windows browsers report visible while minimized and send 1 Hz rAF). Balls are drawn interpolated half a step behind real time (`stepWorld`/`interpolatedBalls`, render-only; tiles still flip on steps); any non-step move of the balls disables it until the next step.
- Saver mode oversizes the board by 2*DRIFT and translates it; `.score-notch` is position:fixed inside the transformed frame, so it drifts too.
- Share links carry only non-defaults; `applyLink` resets omitted look keys to defaults, keeps local prefs (autoHide*).
- SW is cache-first: during dev, reload twice or unregister it. Playwright contexts for capture/profile use `serviceWorkers: "block"`.
- macOS: with display asleep/locked WKWebView reports `hidden` and rAF pauses; smoke test steps manually then. Saver exits on `com.apple.screensaver.willstop` (Sonoma+ legacyScreenSaver leak).
- Prod: Vercel project `pong-screensaver` (alias https://pong-screensaver.vercel.app), deployed by CLI, not git-connected.

- `.gitattributes` forces LF for text: CRLF checkouts change the byte-derived SW version and fail `npm run check`. Keep binary assets byte-exact.

- Render safety: per-tile RGB/luminance direction reversals >=200 ms; palette/CSS commits >=400 ms; visual noise holds400 ms and never consumes physics RNG. Resize paints are also gated. Ball effects clip to at most22% of the conservative341x256 CSS-px field including old/new supports. Do not bypass these guards in full repaints. Reduced motion starts paused and requires explicit play, except `#saver` kiosk (macOS saver has no keyboard; pausing it froze the saver and failed the macos-saver CI job).
