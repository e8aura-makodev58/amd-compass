# Live history retention

## Reader inventory (before implementation)

| Array | Engine and scheduling readers | Other readers / invariants |
|---|---|---|
| issues | event-planner eligibility/fallback + IDs; context-engine eligibility; scheduler active ceiling; live-runtime queue/assistance; assignment/resolution/attempt engines; workforce priority, handover, temporary recurrence; responder-location | analytics equipment/class/backlog/downtime/periods; live-schema validation, station metrics, public projection and issue audit; live-migration building/projection repair; frontend active queue, search, event detail and station history |
| recommendations | live-recommendation-service IDs, stale/result handling; live-assignment-service ranked offers/decisions | analytics disagreement totals and records; live-schema public latest thirty and complete audit; live-migration generic-result normalization; frontend context/offer/override/audit |
| operationalEvents | event-planner duplicate due-token detection and IDs; recommendation/assignment/resolution/location/workforce/clock event IDs | analytics earliest coverage, lifecycle counts/timeline; station uptime origin; public latest hundred, event detail and audit; migration; frontend feed/search/audit |
| dispatchOffers | scheduler pending/claimed responses; assignment selection, acceptance/rejection/cancellation + IDs/tokens; workforce eligibility; context-engine | validation/projection-cache migration; public pending/recent offers and issue audit; frontend offer and assistance displays |
| resolutionAttempts | scheduler due/claimed resolution and review tokens; attempts/assignment/resolution/workforce roster and workload; runtime assistance | live-schema validation/private redaction; migration/backfills; frontend active assignment progress and audit |
| assignments | attempts/resolution roster and contributors; workforce legal duty/handover; assignment transfers/primary promotion + IDs; responder-location; context-engine | migration role/history/cache repair; schema roster invariants; public active assignments and issue audit; frontend crew/context/history |
| resolutionHistory | context-engine weighted observations/quantiles, attempt-engine blended outcome profile, resolution-engine evidence; H IDs | analytics weighted responder/experience/reopen metrics; migration legacy attempts and role history; validation and redacted audit. Keep canonical observation rows in order: never replace exact outcome evidence with approximate aggregates. |

`evaluation.mjs` reads these arrays for its test reports. `assignment-service.mjs` and
`offline-runtime.mjs` also read the separate fixed Offline state; retention must not alter
that path. Full reader search: all `state`/`snapshot` array references under backend/src,
plus frontend/app.js and control-search.js. Closed rows referenced by active/claimed
work or pending workforce recurrence remain live. Workforce staffing/handovers, RNG
streams and exact resolution observations are retained; original ID high-water marks and
length-based token counts must survive removal. Analytics needs compact issue interval,
lifecycle-event and completed-recommendation facts in original order, not archive reads.

## Persistence and recovery

`history-retention.mjs` plans compaction on load and the first successful mutation of
each UTC simulation day. The default cutoff is seven simulated days; zero disables new
archiving. Only strictly older RESOLVED issues without active work, due/dispatch tokens,
pending model work or scheduled/claimed temporary repairs qualify. Each issue bundle
preserves the original issue and all six related detail collections plus its resolution
observations. Canonical `resolutionHistory` remains live, in its original order.

`history-archive/<reset-epoch>/<resolution-day>.json` stores immutable bundles keyed by
issue ID. Adding another bundle atomically replaces a day file without changing existing
records; conflicting content fails rather than overwriting evidence. Archive data and
directories are synced before atomically replacing and syncing the live file. A crash
before the live rename leaves original rows live; retry accepts byte-identical bundles.
Archive indexes are committed only with the pruned state. Missing indexed files fail load.
A reset starts a new epoch when archives exist and preserves earlier epoch files.

Seed bootstrap publishes a complete staged root containing seeds and companion archives.
It never modifies an existing room root. An operator installing a seed must back up the
whole current room directory, then install both live JSON and its companion archive tree.
The worker does not install into the running deployment.

## Preserved decisions and analytics

Private metadata records ID high-water marks and removed lengths for length-based tokens,
original reduction order, event token deduplication and the recent event tail. Compact
issue facts preserve recurrence intervals, public station labels and downtime. Compact
lifecycle events preserve coverage/timeline counts; recommendation facts preserve exact
disagreement evidence. Analytics combines those facts with hot rows in original order,
including floating-point reduction order, without opening archive files. Event planner
recurrence and fallback use the same complete issue intervals; candidate scoring keeps
all exact resolution observations. RNG and workforce histories are unchanged.

Public snapshots select rows before cloning and omit private metadata/observations.
Station pages use bounded summary pagination, and archived audit loads one day file then
applies the same redactor as a live issue. All archive paths are server-side; no static
archive endpoint exists. Active/pending references remain in public operational context.

Three-day tests compare archive-enabled and disabled runs, including reconstructed rows,
RNG, workforce, candidate/planner inputs, full analytics and all period levels. A repeated
archived run proves byte-identical output. Tests exercise archive-first crash recovery,
pending-work protection and bootstrap; browser coverage opens an archived station issue.

## Growth limits

Closed detailed records are limited by the retention window, and public list payloads
are bounded. Exact resolution observations, compact facts/indexes, workforce history and
unowned operational events remain canonical and grow with history. This deliberately
preserves decision evidence; it is not constant-space storage. A future observation or
workforce compaction needs a separate equivalence proof. Reset epochs preserve old files
for operator recovery rather than deleting them automatically.

## Fix evidence extension

Canonical resolution observations now also carry applied catalog fix, public symptom,
equipment, attempt ordinal and frozen decision evidence. Fix packets and period metrics
read these exact observed rows, excluding legacy actions. Compact archived issue facts
carry the completed fix recommendation's source, first pick, baseline, disagreement and
timestamp, without duplicating its full packet. A pending fix-model request protects its
issue from compaction. Latent causes stay in private canonical `faultTruth`, never in an
issue bundle or compact fact. Archive/unarchived tests compare fix packets, private RNG
state, fix analytics and privacy of every issue bundle.
