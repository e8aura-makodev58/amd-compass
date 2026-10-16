# Running & configuration

## Run it

Requires Node.js ≥ 22.

```sh
npm ci
npm run dev
```

If the system Node is older than 22, a user-local runtime works without root. Install
Node 22 with [nvm](https://github.com/nvm-sh/nvm) (`nvm install 22 && nvm use 22`); nvm
puts the selected version's `bin/` first on `PATH` for the shell session. Re-run
`nvm use 22` in any new shell before `npm ci`, `npm test`, or `npm run dev`.

`npm run dev` runs `node --env-file-if-exists=.env backend/src/server.mjs`. Open
`http://127.0.0.1:3000`. The server binds `0.0.0.0` by default for LAN access. `npm start`
is identical. Live state persists under the git-ignored `backend/data/` tree; simulation
time does not advance while the process is stopped.

Copy the example env file to configure the AMD Token Factory provider:

```sh
cp .env.example .env
```

`.env` is git-ignored — credentials stay server-side and are never sent to the browser.
Without a key the app still runs; Live model calls fail closed to the deterministic
baselines.

## Environment variables

### Server

| Variable | Default | Purpose |
|----------|---------|---------|
| `COMPASS_PORT` (or `PORT`) | `3000` | HTTP listen port. |
| `COMPASS_HOST` | `0.0.0.0` | HTTP listen host. |
| `NODE_ENV` | — | `test` gates the test-only data-root override. |
| `COMPASS_CONTROL_ROOMS_DATA_ROOT` | — | **Test-only** multi-room data dir; requires `NODE_ENV=test`. Not a production relocation setting. |
| `COMPASS_LIVE_STATE_PATH` | `backend/data/live-simulation.json` | Test-only single-room state path override. |

### Inference modes

| Variable | Default | Purpose |
|----------|---------|---------|
| `COMPASS_LIVE_COMPASS_MODE` | `live` | Compass-agent mode: `live` / `fixture` / `force-failure`. |
| `COMPASS_EVENT_PLANNER_MODE` | `live` | Event-planner mode. |
| `COMPASS_DEMO_INFERENCE_MODE` | `fixture` | Default agent mode when not otherwise set (the Offline path). |
| `COMPASS_AGENT_TIMEOUT_MS` | `60000` | Compass-agent request timeout (ms). An AMD ranking takes about 20–40s. |
| `COMPASS_EVENT_PLANNER_TIMEOUT_MS` | `30000` | Event-planner request timeout (ms). |

### AMD Token Factory

| Variable | Default | Purpose |
|----------|---------|---------|
| `AMD_TOKEN_FACTORY_BASE_URL` | `https://developer.amd.com.cn/radeon/api/v1` | OpenAI-compatible base URL. |
| `AMD_TOKEN_FACTORY_API_KEY` | — | Team key (`rc-…`). Wins over the key file. |
| `AMD_TOKEN_FACTORY_API_KEY_FILE` | — | Path to a file containing only the key. A host path is not visible inside Docker. |
| `AMD_TOKEN_FACTORY_MODEL` | `MiMo-V2.6-Flash` | Seeds the model on a fresh install. |
| `AMD_TOKEN_FACTORY_REASONING_EFFORT` | `none` for MiMo, else `default` | Seeds the reasoning level; `default` omits the field. |
| `AMD_TOKEN_FACTORY_MAX_OUTPUT_TOKENS` | `4096` | `max_tokens` per call; a truncated reply fails closed. |

The model and reasoning level can also be chosen at runtime from the Settings → API tab, which
persists to `backend/data/provider-settings.json`. A persisted selection takes precedence
over the env seeds on subsequent boots. See
[../backend/model-providers.md](../backend/model-providers.md).

## Ports, data, and persistence

- One process serves both the API and the static frontend.
- State lives under `backend/data/` — one subtree per control room
  (`backend/data/control-rooms/<id>/`), plus the shared `provider-settings.json`,
  `room-metadata.json`, and the application log. The whole `backend/data/` tree is
  git-ignored.
- Operational diagnostics: `GET /api/logs?limit=N` returns recent structured events.
