# Compass — Control Rooms: Multi-Instance Simulation (SOW, Draft v2)

**Project:** Compass / ResponseCompass
**Feature:** Control Rooms — run multiple independent simulation instances in one deployment
**Document Status:** **IMPLEMENTED, hermetically verified, NOT DEPLOYED.** All six work packages (§5) are built and pass 204/204 unit tests plus 27/27 Chromium journeys (including a live two-simultaneous-browser-context proof of independence) against an isolated data root. The real production deployment has not been touched, has not been restarted, and CR-WP1's migration has not run against real accumulated data — that is a deliberate, separate, explicit-approval step. See `docs/handover-history.md`'s 2026-09-08 entry for the full implementation record and exactly what remains before deploying.
**Review history:** Reviewed by Sol (independent architecture critique, `Control_Rooms_SOW_Sol_Review.md`, disposition "very close to implementation-ready, not approved unchanged"). All four required changes (§4.1 scheduler, §2 recipe wording, §4.3 migration conflict, §4.4 room health) and all ten non-blocking refinements are incorporated below. Nothing in the review was rejected.
**Relationship to parent spec:** Extends `Compass_ResponseCompass_SOW_v4_FINAL.md` (§36 Live Control Room UI, §42 API Surface). Everything in the parent SOW not explicitly changed here is unchanged.
**Author:** Claude (Opus 5), grounded in direct code exploration + one dedicated architecture-design pass, revised per Sol's review.

---

## 1. Purpose

Today Compass models exactly one manufacturing plant: one process, one persisted state file, one scheduler, unscoped routes (`GET /api/state`, etc.). The product owner wants to run several fully independent instances side by side — e.g. "Plant #1" and "Plant #2" — as production infrastructure, and as the first concrete step toward an eventual multi-domain platform (a future recipe/blueprint layer that could make an instance a restaurant or a hospital instead of a plant). That layer is explicitly **not** part of this SOW; see §6.

This document defines the MVP: multiple **manufacturing** instances, selectable by URL, running independently in one process, with zero data leakage between them and zero loss of the real state already accumulated by the existing deployment.

## 2. Decisions Already Made

These were resolved with the product owner before this draft was written and should be treated as settled unless a concrete problem is found with one of them.

1. **Presentation-only scope, for this MVP — not a permanent commitment.** Internal field names (`equipmentId`, `issueClass`, `responderId`, …) do not change in this pass. Control Rooms generalize *instance ownership*, not *domain semantics*. A future recipe/domain abstraction may initially map onto this schema, but this SOW deliberately does not decide its final semantic contract — locking that down in prose here would create architecture debt for a document explicitly out of scope. This MVP needs exactly one recipe — Manufacturing — instantiated N times; it does not build the recipe abstraction, and does not pre-decide what it will look like.
2. **Room selection is per-browser, not server-global.** Within one room, state is shared across every viewer of that room, exactly like today. Different browsers must be able to view *different* rooms at once. No user accounts for this MVP, but the design must leave a seam for a later permission layer without a rewrite — concretely, every room-scoped request must resolve through exactly one manager boundary (§4.1), so a future `authorize(user, roomId, action)` check has one insertion point, not twenty-six.
3. **One process, N Control Rooms — never a process per instance.** Five days before this SOW was drafted, this exact codebase suffered a real production outage from two *processes* writing one state file, diagnosed and fixed in the same session. Multiple processes on shared or ambiguous file paths is a closed question for this codebase. This generalizes, not weakens, an adjacent existing invariant — see §4.1.
4. **This MVP is infrastructure only.** Prove independence with two Manufacturing instances. Do not build a second real domain (restaurant, hospital, …) in this pass.

## 3. Terminology

- **Control Room** — one independent, fully self-contained running instance (e.g. "Plant #1"). This is the top-level entity a browser selects.
- **Recipe / Blueprint** — (future, not built here) the bundle that would let a Control Room be a restaurant or hospital instead of a plant, mapped onto a domain hierarchy roughly like `Blueprint → { Control Room, Control Room, … }` (e.g. a Manufacturing blueprint owning Plant #1 and Plant #2; a Restaurant blueprint owning a dining room; a Kitchen blueprint owning a kitchen). Mentioned only where this SOW's design must not foreclose it later.

**Resolved: renaming "Live Control Room" → "Live Floor."** The existing UI already has a tab literally labeled "Live Control Room." Once "Control Room" also names the top-level thing a browser picks before entering the app, the phrase means two different things depending on where you read it. Both the product owner's original framing and Sol's review independently landed on the same fix: rename the existing tab to **"Live Floor"** (consistent with the "Manufacturing floor" heading already used on that same tab) and keep "Control Room" for the top-level instance. One-line label change plus a few ARIA-label strings; included in this pass rather than deferred, since it's cheap and the two meanings should never coexist in a shipped build.

## 4. Architecture

### 4.1 Registry, Manager, and the Process-Level Scheduler

Three new backend modules:

- **`backend/src/control-room-registry.mjs`** — a frozen, hardcoded list of room descriptors, `{ id, label }`. MVP-seeded with exactly `plant1` ("Plant #1") and `plant-2` ("Plant #2"). Hardcoded is not a shortcut here — §6 explicitly rules out an admin UI for creating rooms in this MVP, so a hardcoded list is what "infrastructure only" means. Consumers (the route handler, the frontend picker) only ever call `listRooms()` / `getRoom(id)`, never the literal array — swapping the hardcoded list for a small JSON file later is a one-module change with zero consumer changes. **Keep it hardcoded for v1**: a writable registry immediately opens validation, atomic-update, deletion, rename, ID-stability, and duplicate-ID questions that are administrator functionality, not required infrastructure.

- **`backend/src/control-room-manager.mjs`** — at boot, iterates the registry and, per room, constructs a `liveRuntime` (`createLiveRuntime`) and an `offlineRuntime` (`createDemoRuntime`), composed via `createApplicationRuntime`, with correctly-scoped store paths (§4.2). Stores `{ id, label, runtime, health }` in a `Map` for O(1) lookup by id. **This manager is the sole boundary**: no route or frontend code may reach a room's runtime except through it. That single choke point is what makes the future authorization seam in decision #2 real rather than aspirational — `authorize(user, roomId, action)` has exactly one place to insert itself later, in front of `manager.getRuntime(roomId)`, without touching any of the ~26 route bodies.

**The scheduler is process-level, not per-room — corrected from an earlier draft of this SOW.** The original design gave each room its own `setInterval`, reasoning that "one writer per file" was satisfied as long as no two rooms wrote the same file. That's true but insufficient: this codebase's actual invariant is stronger — *exactly one timer source drives the simulation process* — established specifically to keep the process's concurrency surface small and predictable, not merely to prevent file collisions. N independent intervals would technically satisfy "one writer per file" while quietly discarding the reason that invariant existed in the first place.

The corrected design: **one process-level scheduler interval**, owned by the manager, ticks every 1 second. Each tick, it dispatches a tick to every registered room **concurrently** — never sequentially awaiting Plant #1 to completion before starting Plant #2 — exactly matching how, within a single room today, a model call is fired *outside* the state lock so a slow response can't stall the clock. A slow Compass call in Plant #1 must never delay Plant #2's simulation clock. Each room keeps its own re-entry guard (the existing `tickRunning`-style flag, one per room) so a still-in-flight tick for one room is simply skipped that cycle rather than piling up, exactly as today — this per-room guard is what makes concurrent dispatch safe. A per-room tick that throws is caught and logged without aborting the other rooms' ticks that cycle, extending today's single `try { … } catch (error) { logger?.log(...) } ` pattern from one room to N.

Per-room state that survives this correction unchanged: the `store` (its own file), the in-memory `agentActivity` tracker, and the re-entry guard. What moves to the manager: the interval handle itself and the iteration/dispatch logic. Everything else the runtime is built from — `clock`, `planner`, `resolution`, `recommendations`, `assignments`, per-room `scheduler` object (still owns per-room token/RNG-stream state, just no longer owns its own `setInterval`) — is unchanged, a stateless service closed over whatever store it's given.

This borrows the *keying* discipline already established this week in `backend/src/provider-settings.mjs` (a catalog table + a key list + per-key state) for the registry — not its *persistence* model. Providers share one small, rarely-written settings file; each Control Room needs its own large file, written every second by its own tick. Copying the "one shared file" part of that precedent would be exactly the bug class fixed this week, just relocated.

### 4.2 Where Each Store Lives

| Store | Scope | Path | Rationale |
|---|---|---|---|
| `live-simulation.json` | **Per room** | `backend/data/control-rooms/<id>/live-simulation.json` | This is the simulation itself — the entire reason rooms are independent. |
| `recommendation-events.json` (audit) | **Per room** | `backend/data/control-rooms/<id>/recommendation-events.json` | The strongest reason is **provenance**, not reset-safety: a recommendation generated in Plant #1 must never appear in Plant #2's audit namespace, independent of whether resets are even involved. Audit history belongs to the Control Room that generated it. (Reset-safety is a real secondary consequence — this store belongs to the Offline runtime only, confirmed directly against `createDemoRuntime`'s default second parameter, and decision #2 implies each room needs its own independently resettable Offline mode — but provenance is the reason that would hold even if resets didn't exist.) |
| `application-events.json` (ops log) | **Shared, unchanged** | `backend/data/application-events.json` (today's path) | An operational/debug log, not simulation state — one cross-room stream lets an operator grep across every room at once. Every log line gets an explicit `controlRoomId` field (`"plant1"`, or `null` for deployment-global actions like settings changes) rather than relying on parsing the room id back out of the HTTP path later — cheap to add now, and the path-parsing approach is exactly the kind of implicit convention that quietly breaks the first time a route shape changes. |
| `provider-settings.json` (API keys/model) | **Shared, unchanged** | `backend/data/provider-settings.json` (today's path) | Provider/credential/model selection is an operator-level, deployment-wide decision, not simulation content. Duplicating credential storage per room is out of scope and would need its own secrets-management design. |

**The hard rule, stated explicitly because it's exactly the failure class fixed this week**: `createAuditStore`, `createApplicationLogStore`, and `createProviderSettingsService` all silently default their file path to their *own module's location* if a caller doesn't pass one explicitly. The manager must **always** pass an explicit, room-id-derived path to every per-room store constructor, and must assert at construction time — not just in a test — that no two rooms resolve to the same path.

**What "zero data leakage" precisely means**, since the term alone is ambiguous once some stores are intentionally shared: no canonical simulation state, recommendation/audit state, offers, assignments, history, RNG state, hidden truth, or room-scoped API response may cross a Control Room boundary. Deployment-level provider configuration and operational logging are intentionally, explicitly shared — not an exception to the rule, but outside its scope.

**Do not add a `controlRoomId` field to domain records** (`Equipment`, `Responder`, `Issue`, `Assignment`, `Attempt`, …) to enforce this. The store/runtime boundary the manager already owns *is* the namespace — `plant1`'s `R-ENGR104` and `plant-2`'s `R-ENGR104` coexisting is correct and expected (both rooms share the same Manufacturing seed), not a collision to be resolved by tagging every record. Control Room identity belongs at the routing/manager/runtime/store boundary, not inside the canonical schema.

### 4.3 Migrating the Existing Live Deployment

The running deployment has real, accumulated data at `backend/data/live-simulation.json` (currently ~1.4MB), its `.pre-v2.bak` sibling, and `backend/data/recommendation-events.json`. This becomes room **`plant1`** — not a fresh reset.

**Decision: move the files once, physically, at boot** — not a permanent path-compatibility shim. A shim that special-cases "the old top-level path" forever means every future room-aware code path carries two coexisting rules indefinitely. A one-time, idempotent move collapses back to one uniform rule (`backend/data/control-rooms/<id>/...`) after the first boot.

New module `backend/src/control-room-migration.mjs`, run once at the top of the boot sequence, strictly before the manager constructs any store. Per file (`live-simulation.json`, `.pre-v2.bak`, `recommendation-events.json`), the migration state is one of exactly four — **guessing is not one of the options**:

| Legacy source | `plant1` destination | Outcome |
|---|---|---|
| absent | absent | Fresh install. Do nothing. |
| present | absent | Migrate: `rename()` — the same atomic primitive `writeAtomically` already relies on. |
| absent | present | Already migrated. Do nothing. |
| **present** | **present** | **`MIGRATION_CONFLICT`.** Overwrite neither file. `plant1` boots into the `FAILED` health state (§4.4) with an explicit reason, rather than silently trusting either file as authoritative. |

The fourth row is the case an earlier draft of this SOW left unhandled: if both a legacy file and a `plant1` file exist — e.g. a stale backup restored to the old path after a successful migration — silently keeping the destination risks discarding real accumulated deployment state without anyone noticing, and silently preferring the source risks discarding whatever `plant1` has accumulated *since* migrating. This matches Compass's existing design principle that ambiguous provenance must not be silently repaired (the same principle behind, e.g., rejecting a malformed model result rather than trying to fix it up). An operator resolving a `MIGRATION_CONFLICT` by hand — inspecting both files and deciding which one is real — is the correct outcome; a silent guess is not.

Checking file-by-file (not directory-wide) means a crash mid-move is safe: the next boot resumes exactly where it left off, never re-attempting an already-moved file, and never re-flagging a file that already migrated cleanly as a conflict.

This needs no interaction with the existing schema-version migration (`backend/src/live-migration.mjs`) beyond ordering — that migration runs *inside* `createLiveStore`'s own load path, keyed off the document's schema version, entirely independent of which directory the file lives in.

`COMPASS_LIVE_STATE_PATH` (today's single env-var override) is retired as a *production* configuration mechanism once the registry exists — the manager always computes each room's path from its id. `createLiveStore()`'s own internal env-var fallback is left completely untouched, since it remains a useful default for anything constructing a store directly (e.g. a hermetic unit test unrelated to the registry).

### 4.4 Room Health and Failure Isolation

**Promoted from a work-package acceptance criterion to an architecture invariant**: one room's failure must never become a deployment-wide outage. A corrupted state file, a failed migration (§4.3), or any other per-room startup failure leaves that room unavailable while every other room continues serving normally.

Two states, kept explicitly separate because they answer different questions:

- **Manager/runtime health** — `READY` or `FAILED`. Whether the room's runtime exists and can serve requests at all.
- **Simulation clock state** — `RUNNING` or `PAUSED`. Whether a `READY` room's clock is currently advancing. Unchanged from today's existing single-instance concept, just now scoped per room.

A room is therefore always in one of: `READY + RUNNING`, `READY + PAUSED`, or `FAILED`. These must never be conflated — a `FAILED` room has no meaningful clock state to report at all.

`GET /api/control-rooms` (§4.5) surfaces manager-level health per room, so the picker can show "Plant #2 — unavailable" rather than silently omitting it or presenting a broken link. Any room-scoped route hit against a `FAILED` room's id returns a clear error rather than attempting to construct or use a runtime that doesn't exist.

### 4.5 API Routing

New shape: `GET /api/control-rooms` (the list, including health per §4.4) and `/api/control-rooms/:id/...` in front of every one of the ~26 route branches that live directly under `/api/*` today (state, issues/responders/events, analytics, mode, simulation controls, issue audit/force-resolve/assistance/release, assignment transfer/recommend/confirm/override, the Offline-only raise/recommend/confirm/override routes, and audit-by-request-id).

`createRequestHandler` gains the manager in place of the single `runtime` it takes today. At the top of the handler, before any existing branching: match `^/api/control-rooms/([^/]+)(/.*)?$`. No match → fall through to the existing unscoped branches (below). A match against a room id the registry doesn't know → **404 immediately**, before any route body runs. A match against a room in the `FAILED` health state → a distinct error (not a 404 — the room exists, it's just unavailable), so a client can tell "this room was never real" apart from "this room exists but something is wrong with it." A match against a known, `READY` room → the remainder of the path is matched against exactly today's route table, with that room's runtime substituted for the module-level one. Every route body's actual logic is untouched — only the outer prefix-stripping and runtime binding are new, and both always go through the manager (§4.1), never around it.

**Settings and logs stay unscoped** (`/api/settings`, `/api/settings/models`, `/api/logs`, `/api/logs/client`) — matching §4.2's confirmed-shared stores. Nesting them under a room id would imply per-room data that doesn't exist.

**Collision guard**: confirmed today via the full route enumeration that no existing path begins with `control-rooms`. As a durable (not one-time) guard, the manager asserts at construction that no registry room id ever equals an existing top-level route segment (`settings`, `logs`, `mode`, `simulation`, `issues`, …).

### 4.6 Frontend

**URL shape: `/rooms/:id`** for a specific room, bare `/` for the picker. Chosen over a query string because it mirrors the backend's own `/api/control-rooms/:id/...` shape, and a room deserves to be glanceable in the address bar under decision #2. Cost: one narrow addition to `serveStatic`'s existing fallback — pathnames matching `^/rooms/[^/]+/?$` serve `index.html` instead of 404ing.

`location.pathname` is read exactly once, at the very top of `app.js`'s module-level execution, before any of today's module-level state is initialized.

**Picker screen**: a new top-level section following the existing `.demo-view`/`.analytics-view`/`.settings-view` visual shell for consistency, but unlike those three — which only ever toggle *after* `/api/state` has already loaded — this one gates the entire app shell and runs *before* anything else; there's no existing precedent for this kind of pre-boot gate. It fetches `GET /api/control-rooms` once, shows each room's label plus health and live/paused status (§4.4), and on click does a **full page navigation** (`location.href = "/rooms/" + id`).

**Explicit `roomApi()` / `globalApi()` split, rather than a default-prefix-with-escape-hatch.** An earlier draft proposed a single `api()` helper that auto-prefixes every URL with the current room id, plus an exemption list for the four global settings/log calls. That works, but it's a silent footgun: a future global route added later has to be remembered as an exception rather than being obviously correct by construction. Instead: `roomApi(path)` and `globalApi(path)`, both delegating to one internal fetch helper, so there's no real duplication — but every call site now states its own intent (`roomApi("/state")`, `globalApi("/settings")`) rather than relying on someone remembering an opt-out. Applies to the three real network choke points in the frontend (`api()`/`perform()`/the raw `fetch` in `reportClientError`) plus every one of the ~16 call sites built on top of them.

**Room switching is a full page reload, not in-page — settled, not a placeholder.** A room switch is a strong context boundary, and reloading gets a fresh `currentState`, fresh selection state, fresh poll loop, fresh camera state, fresh DOM, and fresh event handlers for free — with zero risk of a stale timer surviving the switch. The existing frontend already has careful polling/render invariants (the dirty-check discipline in `render-lifecycle.js`); avoiding in-page runtime-context swapping keeps that surface from having to grow a second, harder invariant ("also survive a room change without reload") on top of the first. Keep full-page navigation unless real usage later demonstrates an actual need for faster in-page switching — building SPA-style switching now, on spec, would be solving a problem that doesn't exist yet.

## 5. Work Packages

| WP | Scope | Acceptance |
|---|---|---|
| **CR-WP1** | Existing-deployment migration (§4.3) | All four migration states (fresh install, migrate, already-migrated, `MIGRATION_CONFLICT`) are exercised. Running it twice is a no-op the second time. A simulated partial move (one file relocated, one not) completes correctly on retry. A conflict leaves both files untouched and the room `FAILED`. |
| **CR-WP2** | Registry + manager + process-level scheduler (§4.1) | Two rooms' state files never cross-contaminate under concurrent ticks in a hermetic test. A slow/hung model call in one room's tick does not delay another room's clock advancing. A thrown error in one room's tick does not prevent other rooms from ticking that cycle. |
| **CR-WP3** | Route scoping (§4.5) | The **existing** single-room backend test suite's assertions pass **unmodified** when the runtime under test is constructed through the manager for `plant1` instead of the old direct calls. |
| **CR-WP4** | Room health (§4.4) | A corrupted/unreadable state file for room B leaves room B `FAILED` and does not prevent room A from booting and serving. `GET /api/control-rooms` reports both rooms' health correctly. |
| **CR-WP5** | Frontend picker + URL scoping (§4.6) | Two browser tabs at `/rooms/plant1` and `/rooms/plant-2` show independently evolving state. Bare `/` never calls any room's state endpoint before a room is chosen. A `FAILED` room renders as unavailable in the picker rather than a dead link. |
| **CR-WP6** | Verification / soak | See §8. |

## 6. Explicit Non-Goals

- The recipe/domain abstraction itself, and its final semantic contract — no vocabulary layer, no second domain, no multi-recipe catalog, and (per §2 decision 1) no permanent prose commitment about what it will look like. This MVP is one recipe, instantiated twice.
- Real authentication or operator/viewer roles — only the manager-boundary seam (§4.1) exists; no tokens, sessions, or user model.
- Cross-room resource sharing — explicitly out of scope from the start.
- An admin UI for creating or editing rooms, or a writable registry — the registry is a hardcoded in-code list (§4.1); a third room is a code change.
- Any change to the hidden-truth (`ResponderSkill`) boundary or its non-leakage guarantee — unchanged in mechanism, but must be *re-verified* per room in tests (§8), not assumed to still hold globally because it held for one instance.
- Any change to the deterministic/agent boundary (`AGENTS.md` rule 3).
- In-page (no-reload) room switching (§4.6).
- Adding a `controlRoomId` field to any domain record (§4.2) — the store/runtime boundary is the namespace.
- Any change to manufacturing-specific copy, vocabulary, or the floor/building model — every room is Manufacturing this MVP, so today's copy is already correct for all of them.
- A configurable multi-room data root env var — deferred; the MVP hardcodes `backend/data/control-rooms/`.

## 7. Risks and Checks

| Risk | Check |
|---|---|
| A per-room store is constructed without an explicit path and silently defaults to its module's own location, so two rooms share one file and clobber each other on write. | Boot-time assertion that every resolved store path across the registry is unique; a unit test enumerating the registry and asserting distinct paths pairwise. |
| A future code path accidentally constructs two managers against the same data root within one process. | Manager construction stays a single, pure call in the boot sequence; each store's existing atomic pid+uuid temp-file rename remains the second line of defense regardless. |
| `/rooms/:id` or `/api/control-rooms` collides with an existing static asset or route segment. | Confirmed clear today via direct enumeration; a durable boot-time assertion (§4.5), not a one-time check. |
| A `MIGRATION_CONFLICT` (§4.3) is silently resolved by guessing which file is authoritative, risking real accumulated deployment state. | Both files are always left untouched on conflict; the room boots `FAILED` with an explicit reason (§4.4), never a silent pick. |
| `ResponderSkill` non-leakage is assumed to still hold globally because it held for one instance. | The existing non-leakage assertion runs parametrized against **both** rooms' public snapshots independently in CR-WP6, not once. |
| N concurrently-running Live-mode rooms each independently trigger event-planner/Compass calls on the shared scheduler tick, multiplying real API call volume against one shared provider credential. | New rooms default to `LIVE + PAUSED` (§9), so adding a room is never itself the trigger for new spend — an operator must explicitly start it. CR-WP6's soak additionally runs both rooms simultaneously and checks the combined error/backoff rate against the existing single-room soak's tolerance. |
| `GET /api/control-rooms` is unauthenticated and exposes every room's existence and health/status to any caller. | Accepted as a documented MVP tradeoff — precisely the seam decision #2 asks for; not an oversight. |

## 8. Verification Plan

**Hermetic (`npm test` — no network, no writes to `backend/data/`):**
- Two-room concurrent-tick test against a temp directory: both rooms' schedulers driven concurrently across many ticks via the single process-level scheduler, asserting no cross-contamination and no stray temp file. **Isolation is asserted by behavior, not by entity-ID uniqueness** — an earlier draft of this plan proposed checking that each room "contains only its own entity IDs," which is invalid once both rooms share the same Manufacturing seed (both legitimately contain e.g. `R-ENGR104`; the Control Room itself is the namespace, not the ID — §4.2). The correct test: reset both rooms and confirm their public states are equivalent; mutate room 1 only and confirm room 2 is unchanged; advance room 1's clock and confirm room 2's clock does not move; raise an issue in room 1 and confirm room 2's issue count is unaffected.
- A slow/hung fetch stub in one room's Live call does not delay another room's scheduled tick (direct test of the concurrent-dispatch requirement in §4.1).
- All four migration states (§4.3), including conflict handling and partial-failure recovery.
- Unknown room id → clean 404; known-but-`FAILED` room id → a distinct, non-404 error (§4.5).
- The existing single-room test suite, unmodified, passing against a `plant1` runtime constructed through the manager.
- `ResponderSkill` non-leakage, parametrized over both rooms.
- A positive test proving the *intended* sharing is real: changing provider settings while acting against room 2 measurably affects room 1's next Live recommendation request — proving shared config isn't accidentally scoped, not just that room state isn't leaking.

**Browser suite (Chromium, forced provider failures, no API spend):**
- Picker journey: load `/`, confirm the picker (not a control room) renders, and that no room's state endpoint is polled yet.
- Enter-a-room journey: click a room, confirm full navigation to `/rooms/plant1`, confirm the existing Control Room UI renders scoped to it.
- Poll survives across 2+ intervals from the room-scoped endpoint.
- **Two simultaneous browser contexts**, one per room: force an event in `plant1`'s context, confirm `plant-2`'s context is unaffected on its next poll — the direct exercise of decision #2.
- Switching `plant1` → `/` → `plant-2` shows only `plant-2`'s data, with only `plant-2`'s endpoint subsequently polled.
- A `FAILED` room (simulated) renders as unavailable in the picker, not a dead link.

## 9. Questions Resolved by Review

Four questions this SOW originally left open were resolved during Sol's review rather than left for implementation to decide by default:

1. **New-room default mode → resolved as `LIVE` + `PAUSED`**, not "Offline as a cost-suppression default." These are orthogonal dimensions — `LIVE`/`OFFLINE` is a runtime/provider mode, `RUNNING`/`PAUSED` is simulation clock state — and conflating them would mean a new real plant defaults into a demo/fixture code path just to avoid spend, which is the wrong tool for that problem. A migrated `plant1` keeps its existing state exactly as-is; only newly-registered rooms get this default, and an operator explicitly starts them.
2. **Hardcoded vs. file-backed registry → resolved as hardcoded**, confirmed rather than second-guessed. A writable registry opens real lifecycle questions (validation, atomic updates, deletion, renames, ID stability, duplicate IDs, what happens to a running room after an edit) that are genuine administrator functionality, not MVP infrastructure. The `listRooms()`/`getRoom(id)` seam keeps the later swap to file-backed configuration a one-module change regardless.
3. **The "Live Floor" rename → resolved as in-scope for this pass** (§3) — cheap, and avoids two meanings of "Control Room" ever coexisting in a shipped build.
4. **Full-page vs. in-page room switching → resolved as full-page, and not merely as a placeholder** (§4.6) — a room switch is a strong context boundary, and reload gets every reset-on-switch guarantee for free rather than requiring new teardown/restart code to earn it.

---

### Critical files

`backend/src/server.mjs`, `backend/src/live-runtime.mjs`, `backend/src/live-store.mjs`, `backend/src/audit-store.mjs`, `backend/src/provider-settings.mjs`, `frontend/app.js`, `frontend/index.html`, plus three new backend modules (`control-room-registry.mjs`, `control-room-manager.mjs`, `control-room-migration.mjs`).
