# Control Rooms SOW — Sol Architecture Review

**Document reviewed:** `Compass — Control Rooms: Multi-Instance Simulation (SOW, Draft v1)`  
**Review purpose:** Independent architecture critique before implementation  
**Reviewer:** Sol  
**Disposition:** **Very close to implementation-ready, but not approved unchanged**

---

## Overall Assessment

This is a strong, code-grounded SOW. The proposed direction is correct:

- one deployment;
- multiple independent Control Rooms;
- each Control Room owns its own simulation state;
- room selection is per browser;
- Plant #1 and Plant #2 prove the multi-instance architecture before any multi-domain abstraction is attempted;
- cross-room resource sharing remains explicitly out of scope.

The draft is notably disciplined about avoiding premature work on the future "recipe" abstraction.

However, I would not approve it unchanged yet.

There is **one P0 architectural issue**, several statements that should be tightened before they become accidental long-term commitments, and a few verification details that should be corrected.

The four required changes are summarized in §15.

---

# 1. P0: Preserve the Existing "One Timer" Runtime Invariant

The draft correctly chooses:

> **One process, N Control Rooms.**

However, it currently proposes one `createLiveRuntime` per room, with each runtime retaining its own `setInterval` scheduler loop.

That conflicts with one of the strongest current Compass invariants:

> **Exactly one interval drives the simulation process.**

The current architecture deliberately uses one timer source and one writer discipline to reduce concurrency hazards.

Multi-instance support should generalize this invariant rather than discard it.

## Recommended Architecture

Use **one process-level scheduler interval** that drives every room:

```text
Node Process
    │
    └── ONE 1-second scheduler interval
            │
            ├── tick Plant #1
            ├── tick Plant #2
            ├── tick Plant #3
            └── ...
```

Each Control Room should still independently own:

```text
simulation clock
state store
RNG streams
scheduler tokens
re-entry guard
agent activity
issues
offers
assignments
attempts
history
```

The only shared element is the source of ticks.

## Important Concurrency Detail

Do not serially await one room before ticking the next.

A slow Plant #1 model call must not delay Plant #2's simulation clock.

The process-level scheduler should dispatch room ticks independently, while each room keeps its own re-entry guard.

Model calls must continue to execute outside that room's state lock exactly as they do today.

## Suggested SOW Change

Revise §4.1 so the Control Room manager owns the single process scheduler and each room exposes a tickable runtime rather than owning a separate interval.

---

# 2. Do Not Permanently Define Future Recipes as Presentation-Only

Decision 1 currently says:

> A future "recipe" would only ever supply labels/vocabulary/seed data/prompt text on top of the unchanged schema.

The MVP portion is correct:

> **For this Control Rooms MVP, internal manufacturing field names and domain contracts remain unchanged.**

The phrase **"only ever"** should be removed.

It prematurely defines a future architecture that this SOW explicitly says is out of scope.

The current manufacturing model includes much more than vocabulary:

```text
Equipment
Issue
Responder
Issue classes
ResolutionAttempt
work/rate execution
assistance
reopen behavior
hidden ResponderSkill
contribution-weighted learning
```

Some of those concepts may prove generic later. Others may not.

For example, a restaurant kitchen might eventually need work that fans out across stations, while a hospital environment may require different lifecycle semantics.

This MVP does not need to solve any of that.

But it also should not forbid it in advance.

## Recommended Wording

Replace the future-facing sentence with:

> **For this MVP, the existing manufacturing schema remains unchanged. Control Rooms generalize instance ownership, not domain semantics. A future recipe/domain abstraction may initially map onto this schema, but its final semantic contract is intentionally left undecided by this SOW.**

That preserves scope discipline without creating architecture debt in prose.

---

# 3. Terminology Is Correct: Control Room = Instance

The SOW's terminology is good:

> **Control Room** — one independent running instance.

This should remain.

The likely future hierarchy is:

```text
Compass
    │
    ├── Blueprint / Recipe
    │       └── Manufacturing
    │
    └── Control Rooms
            ├── Plant #1
            ├── Plant #2
            └── Plant #3
```

Later:

```text
Manufacturing Blueprint → Plant #1
Manufacturing Blueprint → Plant #2

Restaurant Blueprint → Main Dining Room
Kitchen Blueprint → Main Kitchen
```

This SOW correctly avoids implementing that second dimension.

## "Live Control Room" Rename

I support renaming the existing **Live Control Room** tab to:

> **Live Floor**

Once Control Room becomes the top-level instance name, retaining a Control Room tab underneath a Control Room creates needless conceptual ambiguity.

This is a tiny terminology cleanup and is worth including in the same feature pass.

---

# 4. Existing-State Migration Needs an Explicit Conflict State

The one-time migration strategy is correct:

```text
backend/data/live-simulation.json
    ↓
backend/data/control-rooms/plant1/live-simulation.json
```

Per-file idempotent moves are a good design.

However, the SOW must define what happens when:

```text
legacy source exists
AND
plant1 destination exists
```

This must not silently resolve in favor of either file.

Example:

```text
backend/data/live-simulation.json
    = accumulated real deployment state

backend/data/control-rooms/plant1/live-simulation.json
    = accidentally initialized fresh seed
```

Silently leaving the destination would risk losing the accumulated deployment state.

## Required Migration State Machine

```text
source absent, destination absent
→ fresh install; do nothing

source present, destination absent
→ migrate

source absent, destination present
→ already migrated; do nothing

source present, destination present
→ MIGRATION_CONFLICT
→ overwrite neither file
→ fail Plant #1 startup loudly / mark Plant #1 unavailable
```

Do not guess which file is authoritative.

This matches Compass's broader design principle: ambiguous provenance must not be silently repaired.

---

# 5. Room Failure Isolation Should Be a First-Class Invariant

CR-WP4 says:

> one room's startup failure must not block another room from serving.

That is important enough to move into the architecture section rather than leaving it only as a work-package acceptance criterion.

The manager should support something conceptually like:

```text
Plant #1   READY
Plant #2   FAILED
Plant #3   READY
```

while the process remains healthy.

`GET /api/control-rooms` should expose enough manager-level health state for the picker to show that Plant #2 is unavailable.

## Keep These States Separate

Manager/runtime health:

```text
READY
FAILED
```

Simulation clock state:

```text
RUNNING
PAUSED
```

These are different concepts and must not be conflated.

A room can therefore be:

```text
READY + RUNNING
READY + PAUSED
FAILED
```

A corrupted state file in one room should never become a deployment-wide outage.

---

# 6. Define "Zero Leakage" More Precisely

The SOW says rooms must have:

> zero data leakage between them

but intentionally keeps shared operational logs and shared provider settings.

That is reasonable, but the invariant should be stated precisely.

## Recommended Definition

> **No canonical simulation state, recommendation/audit state, offers, assignments, history, RNG state, hidden truth, or room-scoped API response may cross Control Room boundaries. Deployment-level provider configuration and operational logging are intentionally shared.**

This removes ambiguity.

## Operational Logs

I also recommend adding explicit metadata:

```text
controlRoomId: "plant1"
```

for room-scoped operational log entries, and:

```text
controlRoomId: null
```

for deployment-global actions such as settings.

Do not rely only on parsing the room ID from the HTTP path later.

---

# 7. Per-Room Audit Storage Is Correct, but Tighten the Rationale

The conclusion is correct:

> `recommendation-events.json` should be per Control Room.

The strongest reason is not reset behavior.

The core reason is provenance:

> **A recommendation made in Plant #1 must never appear in Plant #2's audit namespace.**

Therefore:

```text
backend/data/control-rooms/plant1/recommendation-events.json
backend/data/control-rooms/plant-2/recommendation-events.json
```

is the correct design.

Audit history belongs to the Control Room that generated it.

---

# 8. Prefer Explicit `roomApi()` and `globalApi()` Frontend Boundaries

The draft proposes adding room-prefix behavior to the existing API helper plus an escape hatch for global settings/log routes.

That will work, but I recommend making the distinction explicit:

```text
roomApi(...)
globalApi(...)
```

Example:

```text
roomApi("/state")
roomApi("/simulation/force-event")
roomApi("/issues/...")

globalApi("/settings")
globalApi("/logs")
globalApi("/control-rooms")
```

Both can delegate to one internal fetch helper.

The advantage is semantic safety.

A future developer should have to make a conscious choice between:

```text
room-scoped operation
```

and:

```text
deployment-global operation
```

rather than remembering whether to disable prefixing for one specific call.

---

# 9. Full-Page Room Navigation Is a Good MVP Design

I strongly support:

```text
/
→ Control Room picker

/rooms/plant1
→ Plant #1

/rooms/plant-2
→ Plant #2
```

I also support full-page navigation between rooms.

This should not necessarily be treated as an embarrassing temporary workaround.

A room switch is a strong context boundary.

Reloading automatically provides:

```text
fresh currentState
fresh selected issue
fresh poll loop
fresh camera state
fresh DOM
fresh event handlers
zero stale room timers
```

The current frontend already has careful polling/render invariants.

Avoiding in-page runtime-context swapping reduces risk substantially.

## Recommendation on Open Question 4

Keep full-page navigation unless actual usage later demonstrates a need for rapid in-page switching.

Do not build SPA-style room switching merely because it appears more sophisticated.

---

# 10. Isolation Tests Must Not Depend on Unique Entity IDs

The verification plan currently says each room should contain only its own entity IDs.

That is not a valid isolation criterion if both rooms use the same Manufacturing seed.

Plant #1 and Plant #2 may both legitimately contain:

```text
R1
EQ-001
ISS-...
```

because the Control Room itself is the namespace.

The true identity is effectively:

```text
(controlRoomId, entityId)
```

## Better Isolation Test

```text
Reset both rooms
→ public states are equivalent

Mutate Plant #1 only
→ Plant #1 changes
→ Plant #2 remains unchanged

Advance Plant #1
→ Plant #2 clock does not move

Raise an issue in Plant #1
→ Plant #2 issue count does not change
```

This is stronger than checking IDs anyway.

---

# 11. Do Not Add `controlRoomId` to Every Domain Record

Related to §10:

Do not solve namespace concerns by adding `controlRoomId` to:

```text
Equipment
Responder
Issue
Assignment
Attempt
```

The Control Room store/runtime already provides the namespace.

This remains perfectly valid:

```text
plant1 / R1
plant-2 / R1
```

Control Room identity belongs at the:

```text
routing
manager
runtime
store
```

boundary, not inside every manufacturing entity.

This preserves the current canonical schema as intended.

---

# 12. New Rooms Should Default to LIVE + PAUSED

The cost multiplication risk is real:

```text
2 running rooms ≈ potentially 2× planner/recommendation activity
10 running rooms ≈ potentially 10×
```

The architecture should support many rooms, but newly registered rooms should not immediately begin generating model traffic.

## Recommended Default

Migrated Plant #1:

> Preserve its existing simulation state.

New Plant #2 and later rooms:

```text
mode   = LIVE
clock  = PAUSED
```

Then an operator explicitly starts them.

Do **not** use Offline as the default merely to suppress cost.

These are different dimensions:

```text
LIVE / OFFLINE
    = runtime/provider mode

RUNNING / PAUSED
    = simulation clock state
```

The clean safe default is therefore:

> **LIVE + PAUSED**

---

# 13. Keep the Registry Hardcoded for Control Rooms v1

I agree with the draft's current position.

Use a hardcoded registry module for this MVP:

```text
plant1
plant-2
```

with consumer-facing functions such as:

```text
listRooms()
getRoom(id)
```

Do not introduce editable JSON registry persistence yet.

A writable registry immediately creates additional lifecycle questions:

```text
validation
atomic updates
room deletion
renames
directory migration
ID stability
duplicate IDs
what happens to a running room after edit
```

That is administrator functionality, not required infrastructure.

If the registry abstraction is clean, switching to file-backed configuration later remains straightforward.

---

# 14. Make the Future Authorization Seam Explicit

Per-browser room selection creates a good UX seam, but authorization should be protected structurally too.

Every room-scoped request should resolve through exactly one manager boundary:

```text
request
→ controlRoomManager.getRuntime(roomId)
→ route action
```

Later:

```text
request
→ authenticate
→ authorize(user, roomId, action)
→ controlRoomManager.getRuntime(roomId)
→ route action
```

No route should directly reach a room runtime by bypassing the manager.

That gives future RBAC a clean insertion point without redesigning every endpoint.

---

# 15. Required Changes Before Approval

I would return the SOW with these **four required changes**:

## Required 1 — Single Process-Level Scheduler

Replace:

> N room-owned `setInterval` loops

with:

> **one process-level timer driving N independently guarded room ticks**

This preserves an existing core Compass runtime invariant.

## Required 2 — Remove "Only Ever" Recipe Restriction

Keep the existing manufacturing schema unchanged **for this MVP**, but do not permanently define all future recipes as presentation-only overlays.

The future semantic contract remains intentionally undecided.

## Required 3 — Define Migration Conflict Handling

Explicitly handle:

```text
legacy source exists
+
plant1 destination exists
```

as a migration conflict.

Overwrite neither.

## Required 4 — Promote Room Failure Isolation to an Architecture Invariant

One failed room must not prevent healthy rooms from booting and serving.

Expose room manager health independently from RUNNING/PAUSED simulation state.

---

# 16. Recommended but Non-Blocking Refinements

These should also be incorporated if practical:

1. Rename **Live Control Room** → **Live Floor**.
2. Explicitly define the room-isolation boundary rather than saying generic "zero leakage."
3. Add `controlRoomId` metadata to shared operational logs.
4. Use explicit frontend `roomApi()` and `globalApi()` concepts.
5. Keep full-page room navigation.
6. Rewrite isolation tests so they do not depend on globally unique entity IDs.
7. Do not add `controlRoomId` to domain records.
8. Default newly created rooms to **LIVE + PAUSED**.
9. Keep the v1 registry hardcoded behind `listRooms()` / `getRoom()`.
10. Require all future room authorization to pass through the Control Room manager.

---

# 17. Final Disposition

The SOW is **very close to implementation-ready**.

Its fundamental direction is correct:

> **Do not generalize manufacturing yet. First prove that Compass can host multiple truly independent operational worlds.**

Plant #1 and Plant #2 should be able to run simultaneously with:

```text
isolated canonical state
isolated hidden truth
isolated RNG streams
isolated history
isolated offers and assignments
isolated recommendation audit
independent simulation clocks
shared provider configuration
shared deployment logging
one process
one scheduler source
```

Once that boundary is proven, the architecture will have created the right foundation for a future Blueprint / Recipe layer without guessing today what a restaurant, hospital, kitchen, or other operational domain will eventually require.

**Recommendation:** revise the four required items above, then proceed to implementation review.
