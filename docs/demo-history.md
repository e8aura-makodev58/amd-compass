# Offline demo history

`npm run generate:history` resumes a committed room seed through the real Live runtime,
with both model roles forced to failure so dispatch and event creation use the normal
deterministic fallbacks. It never starts a server, loads provider settings or reads an API
key. Its worker has a throwing fetch guard and credential-read guard; output is committed
only if both counters remain zero. The default output is `.cache/generated-demo-history/<room>.json`.
It refuses to write the worktree's `backend/data/`, including through directory symlinks.

```sh
npm run generate:history -- --room plant-1 --until 2026-11-06T08:00:00.000Z \
  --from backend/seed/demo-control-rooms/plant-1.json \
  --out .cache/plant-1-extended.json
```

`--room` accepts plant-1 or plant-2 and selects the default input filename. `--until` is a
required ISO timestamp with a timezone, later than the source clock. `--from` and `--out`
are optional explicit paths. Regeneration and installation are separate: this script does
not install data into a running application or change room metadata. A failed generation
never replaces the destination file. Installation into an existing volume is the main
agent/operator's job; the normal demo bootstrap still copies seeds only to a fresh root.

The worker advances at most one simulated minute per cycle and stops earlier at known
scheduled offers, resolutions, assistance reviews, repairs, staffing reviews, handovers
and extension deadlines. It uses the shared `advanceSimulation` runtime cycle: scheduler,
real handlers, deferred agent work and autonomous dispatch. There are no manufactured
history rows, forced completions, pruning or retention changes. A single sequential
in-memory store avoids a whole-file disk rewrite and UI projection per mutation; the
normal durable store remains unchanged. State is migrated and validated on input,
validated at daily boundaries and on output, and checked at public privacy boundaries.
An adapter-equivalence test checks an engine run against the actual durable store.

For repeatable audit metadata, zero-argument Date calls inside the isolated worker use
the target simulation time. Existing input records are retained. No clock or fetch global
is changed in the application or test process. The same input, horizon and engine version
produce byte-identical output; stdout includes SHA-256, size, duration and memory, while
stderr reports daily progress.

## Committed plant-1 seed (2026-10-17)

> **Withdrawn the same day.** The seed described below was generated before the resolution
> stall fix (`docs/decisions.md`, "Resolution due times round up") and was replaced by the
> original week-long seed. The figures below are kept as the record of that run. With the
> fix, the same command produces 3,531 issues in 74 MB, which is too slow to load (cold
> room load ~21s, `/state` ~4.5s); a month-long seed waits on history retention.

The September seed was extended from 8 September to **6 October 2026, 08:00 UTC**. Its
continuous original start is 1 September. This contains September, four complete
Monday-to-Monday weeks (7 September–5 October), and more than seven complete days.
The room ends LIVE + PAUSED at its existing 60× speed. plant-2 and room metadata are unchanged.

To reproduce the committed file from the original week-long source:

```sh
mkdir -p .cache
git show 962ac7f:backend/seed/demo-control-rooms/plant-1.json > .cache/week-plant-1.json
npm run generate:history -- --room plant-1 --until 2026-10-06T08:00:00.000Z \
  --from .cache/week-plant-1.json --out .cache/month-plant-1.json
```

- Output: **15,509,844 bytes** (14.79 MiB), 669 issues and 844 resolution-history rows.
- SHA-256: `b94fbb11d09b33882fa03375c3cb7946540f62b2060f1d85ce6b0193e126cd15`.
- Two full regenerations matched byte-for-byte; 41,764 cycles, zero fetch calls and zero credential reads.
- A timed regeneration took 20.3s on this shared host; final worker RSS 271.3 MiB,
  heap used 50.0 MiB (point samples, not peak guarantees).

The dashboard caps its window at seven days / four weeks / three months **including the
current partial period**. At this endpoint the visible windows contain six complete days,
three complete weeks, and one complete month; older complete periods remain in history.
September has 610 issues raised, 621 resolutions and recorded downtime. Complete visible
days and weeks also have nonzero issues, resolutions and downtime. No chart limits or
completeness rules were changed to conceal partial periods.

## Performance and review

One cold normal-manager boot, including both rooms and fresh-root seed copying, took
1.82s. The first plant-1 public snapshot took 282ms. In-process period projections took
123ms DAY / 126ms WEEK / 131ms MONTH, including a normal store snapshot. RSS after those
checks was 252.1 MiB, heap used 143.8 MiB. These are single-run measurements on a shared
host, not latency guarantees. Two local HTTP/Chromium checks against the isolated paused
seed produced these ranges (response body received and parsed):

| Check | Time |
|---|---:|
| `/state` | 288–335ms |
| `/issues` | 258–294ms |
| `/responders` | 263–386ms |
| `/analytics` | 363–499ms |
| `/analytics/period?level=DAY` | 127–168ms |
| `/analytics/period?level=WEEK` | 118–163ms |
| `/analytics/period?level=MONTH` | 123–226ms |
| Chromium Live Floor ready | 509–531ms |

Live Floor and all three period views loaded with no browser errors or outbound requests;
September's complete/nonzero month was visually checked. The normal manager/bootstrap
and preview used scratch roots with both provider roles forced to failure. Both servers
were stopped after their checks; the running deployment was never touched.

History retention is unchanged. The deterministic fallback run reaches the ten-actionable
issue cap and spends much of its later history with a backlog; this is the engine's actual
outcome, not a reason to manufacture more events. The smaller file than the estimated
35 MB reflects that throughput. Cold startup is already near two seconds; the main agent
should decide any further performance or retention work after reviewing these measurements.
