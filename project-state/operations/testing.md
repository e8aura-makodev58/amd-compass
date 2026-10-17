# Testing

Two suites gate every change. **Both must pass before a handoff.**

## Unit / integration — `npm test`

```sh
npm test
```

Runs `node --test backend/tests/*.test.mjs`. This suite is **hermetic**: no network calls,
no API spend, and no writes to real `backend/data/` (test state goes to isolated temp
paths via `COMPASS_LIVE_STATE_PATH` / `COMPASS_CONTROL_ROOMS_DATA_ROOT` with `NODE_ENV=test`).
Never add a live provider call to `npm test`.

Coverage spans contracts and persistence, the clock/scheduler idempotency, planner
generation and fallback, multi-issue races, the resolution/attempt engines, live
recommendations and assignments, analytics, Offline reset, the model-provider abstraction
and provider settings, Control Rooms (migration, manager, health, metadata), workforce
continuity, the map/label layout, render lifecycle, store-failure recovery, and a
100-opportunity deterministic reliability soak. Tests are named by work package
(`wpNN-*.test.mjs`) plus a few feature-named files.

`design-tokens-contrast.test.mjs` parses the CSS tokens and checks every paper-facing
text colour at 4.5:1 against all five light surfaces (including selection/alert washes), including tokens used by the linked
area stylesheets. It also checks white primary-button text against both accent backgrounds. It uses
local file reads and WCAG sRGB luminance calculations only.

`tiling-layout.test.mjs` validates persisted layouts without a DOM or network: accepted
panels, schema/version/size limits, injected parameters/constraints, duplicate/missing
regions and forbidden floating/pop-out layouts. The contrast test resolves Dockview's
text-variable aliases to the shared inks, retaining the 4.5:1 gate for vendor text.

`provider-settings.test.mjs` uses fake catalogs to cover nonblocking boot discovery,
missing/valid saved models, runtime default fallback with byte-for-byte preservation of
the saved file, failed/malformed discovery, recovery, fallback during pending refresh,
and stale credential responses.
Services do not implicitly discover at initialization; boot tests explicitly enable
`checkModelsOnBoot` with fake fetch. The server disables boot discovery in `NODE_ENV=test`.

## End-to-end — Playwright

```sh
LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e
```

Runs `playwright test` (Chromium). The E2E suite **forces provider failure** so it proves
the deterministic fallback still dispatches — it makes no real provider call and spends
nothing. It runs against an isolated `/tmp` data root, not real `backend/data/`. The
`LD_LIBRARY_PATH` prefix supplies Chromium's system libraries in this environment; plain
`npm run test:e2e` works where those libraries are already present.

**Port.** The server binds `COMPASS_E2E_PORT` (default `3012`), and its data root is
`/tmp/compass-playwright-control-rooms-<port>`, so several worktrees can run the suite at
the same time. Worker agents use their own port from the **Ports** table in `handover.md`.
Playwright stops the server when the run ends; any manual preview server must be stopped
right after use. Never bind 3000 or 3200 on this host (other running apps).

E2E journeys cover the audit trail, the building/floor view and camera, the control-room
search palette, the live floor and staffing actions, the room picker and multi-room state
isolation, the override dropdown, and the provider-settings form.

`e2e/header-layout.spec.mjs` measures the header at 920, 1024, 1280 and 1440px in Live
and Offline (with Reset Offline visible). Bounding rectangles and scroll widths assert
that all four view tabs and the activity indicator/dot are fully contained, the topbar
stays within the viewport without horizontal overflow, and no tab-bar scrolling is needed.

`e2e/tiling.spec.mjs` covers desktop frame coverage, pointer and keyboard resizing,
minimum sizes, reload and view-switch persistence, reset, edge moves, maximise/restore,
invalid/unavailable storage, zero outbound requests, and desktop/mobile transitions
that preserve the original DOM nodes and handlers. The shared control-room journey delays
the room-scoped force-event route so its transient activity-indicator assertion is stable.

## Discipline

- Adapt a test's *setup* when an interface changes; do not weaken or delete its assertions
  to make a change pass.
- When you add a provider, route, entity, env var, or engine behavior, add matching
  coverage and update the relevant page under `project-state/` (see
  [../README.md](../README.md#maintenance-workflow)).
- `git diff --check` should be clean (no whitespace errors) before a handoff.

Cleanup regression coverage checks generic room names, restored room paths and
conflict handling, saved metadata/suggestion compatibility, and aggregate-only
recommendation packets even when detailed historical actions exist. The AMD Token
Factory provider and settings tests stub every fetch, so `npm test` never contacts AMD.

**Live measurement is separate.** `npm run measure:amd` (see
[../backend/model-providers.md](../backend/model-providers.md)) is the only script that
calls AMD. Run it by hand, with a key, when model quality needs checking.
