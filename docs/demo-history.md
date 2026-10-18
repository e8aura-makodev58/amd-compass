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

## Round 8 month with measurable fixes (2026-10-18)

The seed starts 1 September and ends **6 October 2026, 08:00 UTC**, LIVE + PAUSED at 60×.
It includes hidden fault simulation, observable symptoms, applied catalog fixes and
observed troubleshooting evidence. Plant-2 and room metadata are unchanged. This replaces
the earlier responder-only month; its counts and speed measurements are historical.

| Item | Result |
|---|---:|
| Issues / resolution observations | 3,512 / 4,820 |
| Archived / hot issues | 2,779 / 733 |
| New catalog-fix observations | 4,237 |
| Restored live JSON | 26,996,348 bytes |
| Committed compressed live payload | 1,753,758 bytes |
| Archive day files / total bytes | 29 / 63,148,637 |
| Largest archive file | 3,272,445 bytes |
| Engine cycles / generation time | 52,352 / 378.8s |

Restored JSON SHA-256:
`da39d2d25188f6d6d452f035c31e6758409c6c20d20bd3e399774574c42d03a7`.
Generation made zero fetch calls and zero credential reads. Every committed seed file is
below 20 MB. This is lossless artifact compression, **not** a reduction of runtime state
or memory: the normal room store still uses plain 27 MB JSON. Exact observation rows
remain canonical; detailed closed work is retained for seven days.

### Seed packaging

`plant-1.json` is a `compass-seed-gzip-v1` manifest naming `plant-1.state.json.gz`, the
uncompressed byte count and SHA-256. `demo-seed-reader.mjs` accepts both ordinary seeds
and these manifests, validates the payload address, bound and checksum, then restores the
exact JSON bytes. Bootstrap and the history generator use this reader. Archives remain
ordinary JSON in `plant-1.json.history/`. Never copy the manifest into a runtime live file.

To package a freshly generated `.cache/month-plant-1.json` deterministically:

```js
import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const bytes = await readFile('.cache/month-plant-1.json');
const root = 'backend/seed/demo-control-rooms';
await writeFile(`${root}/plant-1.state.json.gz`, gzipSync(bytes, { level: 9 }));
await writeFile(`${root}/plant-1.json`, JSON.stringify({
  format: 'compass-seed-gzip-v1', file: 'plant-1.state.json.gz', bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
}) + '\n');
```

Install its companion archive tree too. The plaintext generator output remains available
in scratch storage for review; no observed fact or audit detail is discarded by packaging.

### Observed results

September's complete operational month (1 Sep 08:00–1 Oct 08:00 UTC) has **2,966 raised /
2,985 resolved events**, 1,057 reopened events, and first-time fix success **1,858/2,527
(73.5%)**. Overall first-time fix success is 2,251/3,054 (73.7%). Legacy free-text actions
are excluded; a later instrumented attempt is not reclassified as first-time if the issue
already had a legacy attempt. These are completed first-attempt outcomes, not unique
resolution-event counts. Recommended/baseline agreement is 903/3,057 (29.5%) overall.

| Complete week, Monday 08:00 UTC | Successful first attempts / completed first attempts | Rate |
|---|---:|---:|
| 7–14 September | 460 / 686 | 67.1% |
| 14–21 September | 547 / 730 | 74.9% |
| 21–28 September | 631 / 825 | 76.5% |
| 28 September–5 October | 531 / 702 | 75.6% |

Improvement is **not monotonic**; the last week decreases. No engine outcome or history
was tuned to force a trend. The extension uses deterministic fallback, not live AMD fix
inference. The original week retains earlier non-AMD responder recommendations. Neither
agreement nor this observational trend is a controlled comparison of outcome improvement.
The dashboard retains its existing complete/partial period windows.

### Records for review

- `ISS-3599`, Station 47 (`EQ-47`), symptom `B-SLOW`. Deterministic order:
  B-05 → B-01 → B-03 → B-06 → B-04 → B-02 (all IDs have the `FIX-` prefix).
  B-05 failed (16.66 min), B-01 failed (13.87 min), B-03 succeeded (11.61 min).
- `ISS-3595`, Station 42, symptom `C-MISMATCH`. Order:
  C-02 → C-04 → C-05 → C-01 → C-06 → C-03.
  C-02 failed (19.73 min), C-04 succeeded (15.03 min).
- Archived `ISS-563`, Station 71, symptom `C-INTERRUPT`. Order C-01 through C-06.
  C-01 failed (10.04 min), C-02 succeeded (5.34 min).

In Live Floor choose Stations, expand Healthy stations, select the station, then its
Observed issues record (expand Earlier issues and Show older records as needed). The
complete audit shows the recommendation and each applied procedure independently.

## Installing after review

The main agent/operator owns installation on 3200 and must back up the entire current
plant-1 directory first. Fresh-root bootstrap decodes the manifest and stages both seeds,
metadata and archives before publication; an existing root is untouched. To prepare plain
JSON plus archives for manual installation, run in the main agent's own merged worktree:

```sh
node --input-type=module <<'JS'
import { readDemoSeedBytes } from './backend/src/demo-seed-reader.mjs';
import { mkdtemp, writeFile, cp } from 'node:fs/promises';
const out = await mkdtemp('.cache/plant-1-install-');
await writeFile(`${out}/live-simulation.json`,
  await readDemoSeedBytes('backend/seed/demo-control-rooms/plant-1.json'));
await cp('backend/seed/demo-control-rooms/plant-1.json.history',
  `${out}/history-archive`, { recursive: true });
console.log(out);
JS
```

After backup, the operator installs those two prepared paths together. This worker has
not read or changed `backend/data/` or the deployment on 3200.

## Performance

Round 8 measurements use scratch roots and forced provider failures on the shared host.
Cold plant-1 store load: **3,324ms**; fresh two-room manager/bootstrap: **4,368ms**. Both
exceed the earlier two-second target. Public projection: 50ms / 838,146 bytes; in-process
DAY/WEEK/MONTH: 153/77/75ms; full analytics: 280ms. Sampled RSS 276.7 MiB, heap used
153.3 MiB. Exact observations and new fix packets increase restored state size; gzip
reduces the repository artifact, not those runtime costs. HTTP `/state` 71ms (838,146 bytes), `/issues` 26ms, `/responders` 44ms, full analytics
216ms, DAY/WEEK/MONTH 100/66/56ms; hot full issue audit 764ms. Browser checks loaded the
month, a complete troubleshooting chronology and weekly analytics without page errors
or outbound requests. Preview was stopped afterward. These are point measurements, not
latency guarantees.
