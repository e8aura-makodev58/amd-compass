# Offline runtime

Offline is an **API-free path through the same server, UI, and dispatch math** as Live.
It exists so the product can be demonstrated, developed, and tested with zero external
dependency and fully deterministic output. It lives in `backend/src/offline-runtime.mjs`
(`createDemoRuntime`), re-exported from `server.mjs` for backwards-compatible imports.

## What makes it Offline

- **No network calls, ever.** The Compass agent and event planner run in `fixture` mode:
  they load committed JSON from `fixtures/` (e.g. `agent-result-scenario-a.json`,
  `event-planner-output.json`) instead of calling a provider. This is hard-pinned and is
  not affected by the Live provider settings.
- **Deterministic state.** The seed comes from `demo-state.mjs` (`createInitialDemoState`).
  Resetting returns to exactly that seed.
- **Same interaction model.** It uses the shared two-responder attempt math, scripted
  asynchronous offer acceptance, and the real support / release / transfer / reset
  behavior — so what an operator sees and does matches Live.
- **Its own audit store.** Offline recommendations are recorded via `audit-store.mjs`,
  separate from Live's operational events.

## Why it is a shared-mode path, not a separate app

Offline and Live are two runtimes behind one `createApplicationRuntime` wrapper and one
set of HTTP routes. This is a deliberate invariant: the Offline experience must exercise
the same code as Live, or it stops being a faithful preview. Do not fork Offline into a
parallel implementation — extend the shared math and feed it fixtures.

## Relationship to tests

The `fixture` and `force-failure` inference modes are what let `npm test` and the
Playwright suite run hermetically (no credentials, no spend). The E2E suite forces provider
failure to prove the deterministic fallback still dispatches. See
[../operations/testing.md](../operations/testing.md).
