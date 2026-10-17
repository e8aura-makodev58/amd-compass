# HTTP API reference

All routing lives in `backend/src/server.mjs` (`createRequestHandler`). There are three
kinds of routes: **deployment-global**, **room-scoped**, and **static**.

The server binds `COMPASS_HOST` (default `0.0.0.0`) on `COMPASS_PORT` (default `3000`).
All request/response bodies are JSON unless noted. A `409` with a `conflict` body is
returned for optimistic-concurrency clashes; a `4xx`/`5xx` with `{ error }` otherwise.

## Deployment-global routes

These are shared across every room (settings and diagnostics are process-wide, not
per-room).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/control-rooms` | List every room with health (`READY`/`FAILED`), mode, and clock state. |
| PATCH | `/api/control-rooms/:id/display-name` | Rename a room; optimistic concurrency returns `409 ROOM_METADATA_CONFLICT` on a revision mismatch. |
| GET | `/api/settings` | Current provider, both `roles` model/effort selections and validation status, credential status, and provider list. Top-level model fields alias Compass ranking. |
| GET | `/api/settings/models` | Discover the selectable models for a provider. Accepts `?provider=` to preview a provider without switching to it. |
| POST | `/api/settings` | Save `{provider, role, modelId, reasoningEffort}` for `compass` or `event-planner` (validated against the discovered catalog). Omitted role defaults to Compass; unknown roles return 400. |
| GET | `/api/logs` | Recent structured application events. Accepts `?limit=`. |
| POST | `/api/logs/client` | Accept a client-side (browser) error report. |

## Room-scoped routes

Every path below is addressed as `/api/control-rooms/:id/<path>`. The manager resolves
`:id`, then strips the prefix before matching the tail path shown here. An unknown `:id`
returns `404`; a non-`READY` room returns `503` before any handler body runs.

| Method | Tail path | Purpose |
|--------|-----------|---------|
| GET | `/state` | Bounded public snapshot: open work, recent closed issues/events, responders, equipment and active assignments. |
| POST | `/reset` | Reset the active mode to its seed. |
| GET | `/issues` | LIVE history page, including archived issue summaries; `limit=1..100` (default 100), `before=<previous next>` cursor; returns `issues`, `total`, `next`. Offline retains its scripted list. |
| GET | `/equipment/:equipmentId/issues` | LIVE station history with the same pagination. |
| GET | `/responders`, `/events` | Individual resource lists; events are the recent public feed. |
| GET | `/analytics` | Fixed-snapshot analytics. |
| POST | `/mode` | Switch the room between `LIVE` and `OFFLINE`. |
| POST | `/simulation/start`, `/pause`, `/resume` | Clock run-state. |
| POST | `/simulation/speed` | Set 1× / 5× / 10× / 60×. The UI offers only 1× and 5× (recommended maximum for live AMD rankings). |
| POST | `/simulation/reset` | Reset the clock. |
| POST | `/simulation/force-event` | Immediately run the validated scheduler path (respects the active-issue ceiling). |
| PATCH | `/demo/scenario` | Update the workforce-continuity scenario. |
| GET | `/issues/:issueId/audit` | Full redacted audit trail for a hot or archived issue (Compass analysis, offers, overrides, resolution). |
| POST | `/issues/:issueId/force-resolve` | Consume the selected issue's one-shot resolution token now. |
| POST | `/issues/:issueId/assistance` | Request a second responder for an assigned issue. |
| POST | `/issues/:issueId/responders/:responderId/release` | Release one member of a roster. |
| POST | `/assignments/transfer` | Move a responder from another two-person issue. |
| POST | `/compass/recommend` | Produce a Compass recommendation for an issue. |
| POST | `/assignments/confirm`, `/assignments/override` | Accept the recommendation or override it. |

### Legacy Offline-mode routes

The Offline runtime keeps an older route shape for its scripted flow, also under the room
prefix: `POST /issues/:issueId/raise`, `POST /recommend`, `POST /confirm`,
`POST /override/:responderId`, and `GET /audit/:eventId`.

## Static & SPA

- `GET /` serves `frontend/index.html` (the room picker).
- `GET /rooms/:id` also serves `index.html` — it is a client-side route the frontend
  parses from `location.pathname` at boot, so a direct link or reload does not 404
  (`ROOM_PAGE_PATTERN` in `server.mjs`).
- Any other `GET` serves a matching file from `frontend/`, constrained to that directory.

See [control-rooms.md](control-rooms.md) for why settings/logs stay global while
everything operational is room-scoped, and [frontend/overview.md](../frontend/overview.md)
for the `roomApi()` / `globalApi()` split on the client.

The generic room paths use `plant-1` and `plant-2`; the directory presents
`e8-aura-p1` and `e8-aura-p2` by default. `plant1` remains a compatibility alias
for the first room, resolving to the same runtime and metadata.

Live `/state` includes all open issues, the latest 100 closed issues and references from
the latest 100 events; active assignments/attempts, recent 30 recommendations/offers plus
pending/current-work references. Retention metadata and canonical observation rows stay
private. History pages return at most 100 summaries; archived detail is fetched only by
issue audit. Invalid page sizes or unknown cursors return 400. Analytics uses retained
compact facts and exact observations, never archive I/O on requests.
