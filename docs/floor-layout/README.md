# Multi-floor layout workstream — COMPLETE

> **To the agent working on personnel assignment logic (GPT 5.6 Sol): the build is finished and ready for you to merge. See _Integration instructions_ below.** Until you have merged, please still avoid editing the files under _Owned files_ — after the merge they are ordinary shared files again.

- **Status:** COMPLETE — merged into the two-responder integration and verified with both suites
- **Owner:** Claude (Opus 5)
- **Branch:** `feat/multi-floor-layout`
- **Started:** 2026-09-05
- **Completion is signalled by:** this file's Status changing to COMPLETE on `master`, and the branch being merged.

---

## Integration instructions for `agent/two-responder-build`

**This has been tested, not just described.** A trial merge of `feat/multi-floor-layout` into `agent/two-responder-build` at `9e300ac` was run in a scratch worktree: it merged **cleanly with no conflicts**, and the merged result passed `npm test` **142/142** and the Chromium suite **9/9**. The scratch worktree was deleted; your worktree at `/tmp/compass-two-responder` was never touched.

### Why a merge is safe here

Your branch forked at `c6bead7` and, since then, has changed only `frontend/app.js` and `frontend/styles.css`. Those edits sit in `renderIssueAuditTrail`, `renderLiveDecision`, the helper block near `formatPercent`, and one appended `.staffing-panel` rule. This workstream rewrote `renderFloor`, the floor constants, and the floor/map CSS block. The two sets of changes do not overlap, and your staffing code references none of `equipment`, `distance`, `travelTime`, or `floor` — so the overlap is positional at worst, and git resolves it.

### Steps

```bash
cd /tmp/compass-two-responder            # your worktree
git status --short                       # commit or stash anything uncommitted first

git merge feat/multi-floor-layout

npm test                                 # expect 142/142
LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e   # expect 9/9
```

Merging this branch also brings your branch up to date with `master` — it carries `be45e94` (mode contracts), `2c88749`, `4905aa8` (freeze policy removed), and `03007d2`. Your branch is currently missing all four, so you do not need a separate `git merge master`.

If your branch has moved on since `9e300ac` and a conflict does appear, it will almost certainly be in `frontend/app.js` from line drift. Resolve by keeping **both** sides: your staffing/audit/decision changes and this workstream's `renderFloor`, `focusBuildingOn`, `focusedFloor`, `nodeMarkup`, and the `BUILDING_FLOORS` / `BUILDING_PITCH` / `DEFAULT_YAW` / `buildingYaw` / `focusedNodeId` declarations. Nothing in either set replaces the other.

### What changes underneath you

| Change | What it means for assignment logic |
|---|---|
| `Position` gains `floor` (1–3) | Equipment and responders both carry it. Seed responders are on floors 1, 1, 2, 2, 3, 3. |
| Equipment count 6 → **72** (24 per floor) | Anything that assumed six machines will be wrong. The schema now asserts 60–90 total and 20–30 per floor. |
| `distanceToIssue` | Unchanged in meaning: still a planar same-floor walk in metres. |
| `floorsToIssue` (new candidate field) | Number of floors between responder and equipment. |
| `travelTimeMinutes` | Now the whole journey: planar walk **plus** `FLOOR_TRANSIT_MINUTES` (1.5) per floor changed. |
| Nearest-available baseline | Now ranks on `travelTimeMinutes`, not planar distance. A responder directly above an issue is no longer "nearest". |
| `fixtures/candidate-packet-scenario-a.json` | Regenerated for the new field and the upstairs responders' higher travel times. |
| Pre-building persisted state | Auto-migrates via `live-migration.mjs`. A state file without `floor` no longer stops the server from starting. |

Scenario A is deliberately unaffected: the six original ground-floor machines keep their exact coordinates, and `R-ENGR028` remains the expected Compass winner.

### Worth a look once merged, though nothing is known to be broken

- Any staffing or roster view that lists or counts equipment now sees 72 rather than 6 — check for anything that renders an unbounded equipment list.
- If assignment logic ever sorts or filters on `distanceToIssue`, consider whether it should use `travelTimeMinutes` instead, for the same reason the nearest baseline switched.
- `buildEventPlannerPacket` now carries all 72 machines to the model. That is a real prompt-size increase and may deserve bounding, but `event-planner.mjs` is yours, so it was left alone rather than changed unilaterally.

### After you merge

Set this file's Status to COMPLETE and drop rule 9 from `AGENTS.md`; the ownership boundary exists only to prevent concurrent edits and should not outlive them.

## Goal

Replace the single 150×100 floor holding six equipment items with a **three-floor building holding 20–30 equipment items per floor** (60–90 total), and render the floor map as **simple wireframes** rather than the current icon-and-label nodes, so the map stays legible at roughly ten times the current object count.

## Owned files — avoid editing until you have merged this branch

| File | Why it is in scope |
|---|---|
| `frontend/app.js` — `renderFloor`, `positionStyle`, `FLOOR_WIDTH`/`FLOOR_HEIGHT`, `responderDisplayOffsets` | The renderer becomes wireframe and floor-aware |
| `frontend/styles.css` — `.floor`, `.floor-grid`, `.map-node`, `.node-*` rules | Wireframe presentation |
| `backend/seed/scenario-a-state.json` | Equipment and coordinate seed data |
| `backend/seed/live-simulation.mjs` | Live seed built on the same base |
| `backend/src/demo-state.mjs` | Initial demo state / equipment list |
| `backend/src/context-engine.mjs` — `calculateDistance`, `calculateTravelTimeMinutes` | Distance must account for inter-floor travel |
| `backend/src/live-schema.mjs` — the equipment-count assertion at the seed validation | Currently hard-asserts exactly six equipment items |
| `backend/src/domain.ts` — `Position`, `Equipment` | The coordinate contract gains a floor |
| `backend/tests/wp2-context-engine.test.mjs`, `wp1-live-store.test.mjs` (seed/geometry assertions) | Directly assert the current geometry |

## Not owned — still yours

Personnel and assignment logic is explicitly **out** of this workstream: `live-assignment-service.mjs`, `assignment-service.mjs`, `resolution-engine.mjs`, `agent.mjs`, `event-planner.mjs`, `scheduler.mjs`, `provider-settings.mjs`, `analytics-service.mjs`, and their tests. Responder *skill*, availability, ranking, offers, acceptance, and resolution behaviour are untouched here.

## The one interface between us

This workstream adds a **floor coordinate to the shared `Position` contract**, which both equipment and responders use:

```ts
export interface Position {
  x: number;
  y: number;
  floor?: 1 | 2 | 3; // added by this workstream
}
```

`floor` is optional in the type only so that states persisted before the building
still type-check ahead of migration. Every seeded and migrated record carries it.

Consequences you should know about, because they touch your area at exactly one point:

- **Responder records gain `floor`.** Seed responders will be distributed across the three floors. This workstream sets those values; it does not change how responders are selected, ranked, or assigned.
- **`calculateDistance` stays planar; `calculateTravelTimeMinutes` became floor-aware.** As built, `distanceToIssue` is still a real same-floor walk in metres and its value is unchanged for a same-floor pair. The floor cost lands in `travelTimeMinutes`, and a new `floorsToIssue` field reports the number of floors between responder and equipment. (An earlier draft of this note said `calculateDistance` itself would change; it does not.)
- **Because travel time changes, evidence changes, and so do the nearest-available baseline and possibly Compass's ranking.** Fixtures and tests that assert a specific winner (for example Scenario A expecting `R-ENGR028`) may need their expected values updated. This workstream will update the geometry-derived expectations it breaks; if it breaks an assertion that is really about assignment semantics rather than geometry, it will be raised rather than silently rewritten.

Nothing else about the candidate packet, the deterministic/agent boundary, or hidden `ResponderSkill` changes. Hidden skill still never reaches a model, the UI, or analytics.

## Constraints this workstream keeps

From `AGENTS.md`: per-issue scope only, the deterministic/agent boundary, hidden `ResponderSkill`, Live and Offline as shared-mode paths with Offline API-free, synthetic domain-neutral data, and a `docs/decisions.md` entry plus a `handover.md` update on completion.

Verification before merge: `npm test` and the Chromium suite (`LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e`), both green.

## Progress log

- 2026-09-05 — Branch created, ownership boundary published to `master`, scope agreed.
- 2026-09-05 — Implementation complete and verified. 72 machines across three floors (24 each), isometric rotatable renderer, floor-aware travel time, and a migration for pre-building state. `npm test` 142/142, Chromium 9/9.
