# Frontend

The frontend is a **vanilla-JavaScript single-page application** served as static files
from `frontend/`. No framework, no bundler, no build step. It polls room state every 1.5s
and re-renders. Node serves these files directly (see [../backend/http-api.md](../backend/http-api.md)).

## Files

| File | Responsibility |
|------|----------------|
| `index.html` | The DOM scaffold: the room-picker view (shown at `/`) and the app shell — tabs (Live Floor, Control Rooms, Analytics, Settings), the floor-map container, sidebar panels, simulation controls, search palette, audit trail, and demo controls. |
| `app.js` | The whole SPA controller (~2,000 lines). Parses `/rooms/:id` at boot, polls state, and renders every panel. Handles issue/responder selection, staffing actions, the map (pan/zoom/rotate, floor switching, 2D vs. 2.5D), control-room search, analytics, the audit trail, and the settings forms. |
| `render-lifecycle.js` | An idempotent HTML writer (`setHtml`) that preserves form state (select values, focus) across the 1.5s re-render so polling never clobbers an in-progress interaction. |
| `map-label-layout.js` | Screen-space label layout for the floor map: lane-based collision avoidance for equipment/responder bubbles, measured against projected geometry each frame. |
| `tokens.css` | Design tokens (colour, type, rules) for the "Engineering print" look; see `docs/design/engineering-print.md`. |
| `base.css`, `floor.css`, `panel.css`, `ops.css`, `analytics.css` | Per-area styles: shell/header/controls, the map and feeds, the context panel, Settings/Demo/Control Rooms, Analytics. |
| `layout.css` | Responsive and bounded-workstation layout. Linked last so it overrides the area files. |

## How it talks to the backend

Two explicit helpers, so every call site states its scope (see
[../backend/control-rooms.md](../backend/control-rooms.md)):

- `roomApi(path, options)` → `/api/control-rooms/:id` + `path` (room-scoped).
- `globalApi(path, options)` → `/api` + `path` (deployment-global: settings, logs).

`currentControlRoomId` is parsed once from `location.pathname` at boot. Room switching is
full-page navigation, not in-page teardown. Polling pauses while an action is in flight or
a pointer gesture is active, then resumes.

## The map

The manufacturing floor is split into **world geometry inside a CSS-3D scene** and
**readable text in a screen-space overlay layer** (`map-label-layout.js`). This split is
deliberate and is the foundation for a fuller 3D floor — keep it when extending the map.
Three floors, ~20–30 machines each; a 2D top view and an optional 2.5D isometric overview.

## Tabs

- **Live Floor** — the map plus the context panel (selected issue: staffing roster, offers,
  Compass recommendation, resolution) and the event feed.
- **Control Rooms** — lists rooms with health/mode/status; renames the current room.
- **Analytics** — KPI grid, issue/equipment/responder tables, Compass-vs-baseline
  disagreement, timeline charts, and a searchable equipment directory. See
  [../concepts/analytics-and-ethics.md](../concepts/analytics-and-ethics.md).
- **Settings** — an **API** sub-tab (provider / model / reasoning-effort with live model
  discovery) and a **Demo** sub-tab (workforce scenario, agent activity, deferred-demand
  ledger, handover log). The provider list is rendered dynamically from `/api/settings`,
  so a newly added provider appears with no client change. See
  [../backend/model-providers.md](../backend/model-providers.md).

## Diagnostics

Uncaught browser errors are POSTed to `/api/logs/client` so they land in the same
application log as the backend events.

The picker defaults to `e8-aura-p1` (`/rooms/plant-1`) and `e8-aura-p2`
(`/rooms/plant-2`). Audit and station-history views use the shared `responseAction`
issue field and recorded resolution actions.
