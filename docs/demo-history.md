# Offline history generation and retained month seed

`npm run generate:history` resumes a seed through the shared Live engine. Both provider
roles use deterministic fallbacks. An isolated worker guards network and credential reads;
the committed run made zero fetch calls and zero credential reads. It never starts a
server or installs data into the running deployment. Outputs default to `.cache/` and
writes into `backend/data/`, including through directory symlinks, are refused.

The worker advances at most one simulated minute per cycle, stopping at scheduled work,
and runs the shared scheduler, handlers, deferred work and autonomous dispatch. It uses
the normal retention planner and an in-memory sequential adapter to avoid rewriting disk
on every mutation. Adapter-equivalence tests compare it with the durable store. State is
migrated and validated on input, at daily boundaries and on output. Worker-local Date
calls use the target simulation time for repeatable audit timestamps.

## Reproduce the committed seed

```sh
mkdir -p .cache
git show 962ac7f:backend/seed/demo-control-rooms/plant-1.json > .cache/week-plant-1.json
npm run generate:history -- --room plant-1 --until 2026-10-06T08:00:00.000Z \
  --from .cache/week-plant-1.json --out .cache/month-plant-1.json --retention-days 7
```

`--room` selects plant-1 or plant-2; `--until` must be later than the input clock and
include a timezone. `--from`, `--out` and `--retention-days` are optional. Default retention
is seven simulated days; zero disables new archiving. A retained input needs its companion
`<input>.history/` directory. Output consists of JSON and `<output>.history/`; copying only
the JSON loses archived audit detail. A failed run does not replace the output JSON, but
may leave idempotent archive additions for a retry.

The corrected plant-1 history begins 1 September and ends **6 October 2026, 08:00 UTC**,
LIVE + PAUSED at 60×. It uses the resolution due-time fix already on master. Plant-2 and
room metadata are unchanged. The earlier stalled month was withdrawn; these figures
supersede that run.

| Item | Result |
|---|---:|
| Issues / resolution observations | 3,531 / 4,148 |
| Archived / hot issues | 2,789 / 742 |
| Live JSON | 16,755,396 bytes |
| Archive day files | 29 |
| Total archive bytes | 40,190,709 |
| Largest archive file | 1,990,575 bytes |
| Engine cycles / generation time | 50,558 / 274.7s |

Live SHA-256: `76fd984d8fa03a9887d855229849bd6f14664bc63edc7a9f5d345da76d01b569`.
Every committed file is below 20 MB. Generation final RSS was 227.8 MiB and heap used
38.5 MiB (point samples, not peak guarantees). Three-day repeated generation tests prove
byte-identical live/archive files; enabled versus disabled retention preserves exact
engine decisions, RNG, observations and analytics. See [history-retention.md](history-retention.md)
for the reader inventory and archive-first crash protocol.

The endpoint contains four complete Monday-to-Monday weeks and the complete September.
The dashboard still shows seven days / four weeks / three months **including the current
partial period**: six complete visible days, three complete weeks and one complete month.
Complete periods have nonzero issues, resolutions and downtime. Limits and completeness
rules are unchanged.

## Installing after review

The main agent/operator owns installation into the app on 3200. Back up the entire current
plant-1 directory first. Install `plant-1.json` as `live-simulation.json` and its companion
`plant-1.json.history/` as that room's `history-archive/`, preserving relative epoch/day
paths. A fresh-root bootstrap stages both room seeds, metadata and archives before
publishing; it never overwrites an existing root. This worker has not read or changed
`backend/data/` or the running deployment.

## Performance

Measurements below use scratch roots, normal manager/bootstrap and forced provider
failures. They are single-run observations on a shared host, not latency guarantees.

| Check | Observed | Target |
|---|---:|---:|
| Cold plant-1 store load | 1,469ms | <2,000ms |
| Fresh-root manager boot (both rooms + seed/archive copy + reconcile) | 2,391ms | <2,000ms cold load reference |
| HTTP `/state` (250,003 bytes) | 56ms | <300ms |
| HTTP `/issues` (100 rows / 55,660 bytes) | 34ms | <500ms |
| HTTP `/responders` | 23ms | <500ms |
| HTTP `/analytics` | 239ms | <1,000ms |
| First HTTP DAY / WEEK / MONTH | 317 / 54 / 44ms | each <300ms |
| In-process DAY / WEEK / MONTH | 88 / 48 / 42ms | each <300ms |
| In-process full analytics | 183ms | <1,000ms |
| Chromium Live Floor ready | 273ms | — |

Cold plant-1 meets the target. Full fresh-root two-room boot exceeds two seconds, and
one first HTTP DAY request measured 317ms during the browser suite, above 300ms. These
misses remain reported for review; no target was lowered. Bootstrap copies ~57 MB and
manager boot also migrates/validates/reconciles plant-2; exact retained observations and
facts still require scanning. Shared-host CPU/GC affects first-request latency. The
isolated in-process measurements are included separately rather than replacing HTTP
measurements. Final probe RSS was 230.7 MiB, heap used 153.0 MiB; the two-room manager
sample reached RSS 319.1 MiB and heap used 208.6 MiB.

Live Floor and DAY/WEEK/MONTH loaded in Chromium with no page errors or outbound requests.
The complete September bars were visually checked. Test/preview ports 3021 and 3121 were
freed after use. The app on 3200 was not touched.

Detailed closed records leave the live file after the retention window. Exact resolution
observations, compact facts/indexes, workforce history and unowned events still grow;
this change bounds polled payloads and old closed detail, not every canonical byte.
