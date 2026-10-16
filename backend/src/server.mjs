import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createApplicationLogger, createApplicationLogStore, createControlRoomLogger, logEvent } from "./application-log-store.mjs";
import { createDemoRuntime } from "./offline-runtime.mjs";
import { createProviderSettingsService } from "./provider-settings.mjs";
import { createControlRoomManager } from "./control-room-manager.mjs";
import { compassDataPath, resolveCompassDataRoot } from "./data-root.mjs";

// Re-exported: createDemoRuntime's implementation moved to offline-runtime.mjs
// (control-room-manager.mjs needs it too, and importing it from server.mjs
// would create a circular dependency), but existing tests import it from here.
export { createDemoRuntime };

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const frontendRoot = join(projectRoot, "frontend");
const port = Number(process.env.COMPASS_PORT ?? process.env.PORT ?? 3000);
const host = process.env.COMPASS_HOST ?? "0.0.0.0";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
  return true; // lets a caller distinguish "a response was written" from "nothing matched"
}

function requestErrorStatus(error, fallbackStatus) {
  return Number.isInteger(error?.statusCode) ? error.statusCode : fallbackStatus;
}

function mutationResponse(response, result) {
  const conflict = result?.action?.status === "CONFLICT" ? result.action : null;
  return conflict ? sendJson(response, 409, { error: conflict.reason, code: conflict.reason, conflict }) : sendJson(response, 200, result);
}

// A room URL (/rooms/:id) has no matching file on disk — it's a client-side
// route the frontend parses from location.pathname at boot (see
// Control_Rooms_SOW_v1_DRAFT.md §4.5) — so serve the same index.html rather
// than 404ing on a page reload or a direct link to a specific room.
const ROOM_PAGE_PATTERN = /^\/rooms\/[^/]+\/?$/;

async function serveStatic(pathname, response) {
  const requestedPath = pathname === "/" || ROOM_PAGE_PATTERN.test(pathname) ? "/index.html" : pathname;
  const filePath = normalize(join(frontendRoot, requestedPath));
  if (!filePath.startsWith(`${frontendRoot}/`)) return sendJson(response, 404, { error: "Not found" });
  try {
    const contents = await readFile(filePath);
    response.writeHead(200, { "content-type": mimeTypes[extname(filePath)] ?? "application/octet-stream" });
    response.end(contents);
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
}

async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 2_000) throw new Error("Request body is too large");
  }
  return body ? JSON.parse(body) : {};
}

/**
 * Every room-scoped route body, unchanged from the single-instance design
 * except that `runtime` is now whichever room the URL resolved to instead of
 * a module-level singleton. `path` is the request path with the
 * `/api/control-rooms/:id` prefix already stripped (so this still reads
 * "/state", "/issues/:id/raise", etc. — the same literals as before the
 * prefix existed).
 */
async function handleRoomScopedRoute({ request, response, path, runtime, logger, url }) {
  if (request.method === "GET" && path === "/state") {
    return sendJson(response, 200, await runtime.snapshot());
  }
  if (request.method === "POST" && path === "/reset") {
    return sendJson(response, 200, await runtime.reset());
  }
  if (request.method === "GET" && ["/issues", "/responders", "/events"].includes(path)) {
    const state = await runtime.snapshot();
    const key = path === "/issues" ? "issues" : path === "/responders" ? "responders" : "operationalEvents";
    return sendJson(response, 200, { mode: state.mode, simulationTime: state.simulationState?.simulationTime ?? null, [key]: state[key] ?? [] });
  }
  if (request.method === "GET" && path === "/analytics") {
    return sendJson(response, 200, await runtime.analytics());
  }
  if (request.method === "GET" && path === "/analytics/period") {
    return sendJson(response, 200, await runtime.analyticsPeriod({ level: url.searchParams.get("level") ?? "DAY" }));
  }
  if (request.method === "POST" && path === "/mode") {
    const payload = await readJsonBody(request);
    return sendJson(response, 200, await runtime.setMode(payload.mode));
  }
  if (request.method === "POST" && path === "/simulation/start") {
    return sendJson(response, 200, await runtime.startSimulation());
  }
  if (request.method === "POST" && path === "/simulation/pause") {
    return sendJson(response, 200, await runtime.pauseSimulation());
  }
  if (request.method === "POST" && path === "/simulation/resume") {
    return sendJson(response, 200, await runtime.resumeSimulation());
  }
  if (request.method === "POST" && path === "/simulation/speed") {
    const payload = await readJsonBody(request);
    return sendJson(response, 200, await runtime.setSimulationSpeed(Number(payload.speed)));
  }
  if (request.method === "POST" && path === "/simulation/reset") {
    return sendJson(response, 200, await runtime.reset());
  }
  if (request.method === "POST" && path === "/simulation/force-event") {
    return sendJson(response, 200, await runtime.forceNextEvent());
  }
  if (request.method === "PATCH" && path === "/demo/scenario") {
    const result = await runtime.updateWorkforceScenario(await readJsonBody(request));
    return mutationResponse(response, result);
  }
  const issueAuditMatch = path.match(/^\/issues\/([^/]+)\/audit$/);
  if (request.method === "GET" && issueAuditMatch) {
    const record = await runtime.issueAudit(decodeURIComponent(issueAuditMatch[1]));
    return record
      ? sendJson(response, 200, record)
      : sendJson(response, 404, { error: "Issue was not found" });
  }
  const forceResolveMatch = path.match(/^\/issues\/([^/]+)\/force-resolve$/);
  if (request.method === "POST" && forceResolveMatch) {
    return sendJson(response, 200, await runtime.forceResolve(decodeURIComponent(forceResolveMatch[1])));
  }
  const assistanceMatch = path.match(/^\/issues\/([^/]+)\/assistance$/);
  if (request.method === "POST" && assistanceMatch) {
    const result = await runtime.requestAssistance(decodeURIComponent(assistanceMatch[1]));
    return mutationResponse(response, result);
  }
  const releaseMatch = path.match(/^\/issues\/([^/]+)\/responders\/([^/]+)\/release$/);
  if (request.method === "POST" && releaseMatch) {
    const body = await readJsonBody(request);
    const result = await runtime.releaseResponder({ issueId: decodeURIComponent(releaseMatch[1]), responderId: decodeURIComponent(releaseMatch[2]), expectedRosterVersion: body.rosterVersion, reason: body.reason });
    return mutationResponse(response, result);
  }
  if (request.method === "POST" && path === "/assignments/transfer") {
    const result = await runtime.transferResponder(await readJsonBody(request));
    return mutationResponse(response, result);
  }
  if (request.method === "POST" && path === "/compass/recommend") {
    const payload = await readJsonBody(request);
    return sendJson(response, 200, await runtime.recommendLive(payload.issueId));
  }
  if (request.method === "POST" && ["/assignments/confirm", "/assignments/override"].includes(path)) {
    const payload = await readJsonBody(request);
    return sendJson(response, 200, await runtime.decideLive({
      recommendationId: payload.recommendationId,
      responderId: payload.responderId,
      decision: path.endsWith("/confirm") ? "CONFIRMED" : "OVERRIDDEN",
    }));
  }
  const raiseMatch = path.match(/^\/issues\/([^/]+)\/raise$/);
  if (request.method === "POST" && raiseMatch) {
    try {
      return sendJson(response, 200, await runtime.raiseIssue(decodeURIComponent(raiseMatch[1])));
    } catch (error) {
      return sendJson(response, requestErrorStatus(error, 404), { error: error.message });
    }
  }
  const recommendMatch = path.match(/^\/issues\/([^/]+)\/recommend$/);
  if (request.method === "POST" && recommendMatch) {
    try {
      return sendJson(response, 200, await runtime.requestRecommendation(decodeURIComponent(recommendMatch[1])));
    } catch (error) {
      return sendJson(response, requestErrorStatus(error, 409), { error: error.message });
    }
  }
  const confirmMatch = path.match(/^\/issues\/([^/]+)\/confirm$/);
  if (request.method === "POST" && confirmMatch) {
    try {
      const state = await runtime.snapshot();
      const issueId = decodeURIComponent(confirmMatch[1]);
      const responderId = state.workflow?.agentOutcome?.result?.topRecommendation?.responderId;
      return sendJson(response, 200, await runtime.decideAssignment(issueId, responderId, "CONFIRMED"));
    } catch (error) {
      return sendJson(response, requestErrorStatus(error, 409), { error: error.message });
    }
  }
  const overrideMatch = path.match(/^\/issues\/([^/]+)\/override\/([^/]+)$/);
  if (request.method === "POST" && overrideMatch) {
    try {
      return sendJson(response, 200, await runtime.decideAssignment(
        decodeURIComponent(overrideMatch[1]),
        decodeURIComponent(overrideMatch[2]),
        "OVERRIDDEN",
      ));
    } catch (error) {
      return sendJson(response, requestErrorStatus(error, 409), { error: error.message });
    }
  }
  const auditMatch = path.match(/^\/audit\/([^/]+)$/);
  if (request.method === "GET" && auditMatch) {
    const event = await runtime.getAuditEvent(decodeURIComponent(auditMatch[1]));
    return event
      ? sendJson(response, 200, event)
      : sendJson(response, 404, { error: "Audit event was not found" });
  }
  return null; // no room-scoped route matched
}

/**
 * `manager` resolves a room id to a runtime — see control-room-manager.mjs.
 * Settings and logs are deployment-global and stay unscoped (§4.2/§4.5 of
 * Control_Rooms_SOW_v1_DRAFT.md); everything else moves under
 * /api/control-rooms/:id/. No route reaches a room's runtime except through
 * `manager.getRoom(id)` — see §4.1, "the manager is the sole boundary".
 */
export function createRequestHandler(manager, logger = null, settingsService = null) {
  return async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
    const startedAt = performance.now();
    // Request lifecycle entries belong to the room when the URL resolves to
    // one; global endpoints intentionally retain no controlRoomId.
    const lifecycleRoomMatch = url.pathname.match(/^\/api\/control-rooms\/([^/]+)(?:\/.*)?$/);
    const lifecycleRoom = lifecycleRoomMatch ? manager?.getRoom(decodeURIComponent(lifecycleRoomMatch[1])) : null;
    const requestLogger = lifecycleRoom ? createControlRoomLogger(logger, lifecycleRoom.id) : logger;
    logEvent(requestLogger, "request_started", { method: request.method, path: url.pathname });
    try {
      if (request.method === "GET" && url.pathname === "/api/control-rooms") {
        return sendJson(response, 200, { rooms: await manager.listRoomsWithStatus() });
      }
      const renameRoomMatch = url.pathname.match(/^\/api\/control-rooms\/([^/]+)\/display-name$/);
      if (request.method === "PATCH" && renameRoomMatch) {
        const roomId = decodeURIComponent(renameRoomMatch[1]);
        try {
          const result = await manager.renameRoomDisplayName(roomId, await readJsonBody(request));
          if (result.status === "CONFLICT") return sendJson(response, 409, { error: "Control room metadata changed", code: "ROOM_METADATA_CONFLICT", current: { displayName: result.displayName, revision: result.revision } });
          return sendJson(response, 200, result);
        } catch (error) {
          return sendJson(response, requestErrorStatus(error, 503), { error: error.message });
        }
      }
      if (request.method === "GET" && url.pathname === "/api/settings") {
        if (!settingsService) return sendJson(response, 503, { error: "Provider settings are unavailable" });
        return sendJson(response, 200, await settingsService.snapshot());
      }
      if (request.method === "GET" && url.pathname === "/api/settings/models") {
        if (!settingsService) return sendJson(response, 503, { error: "Provider settings are unavailable" });
        // No per-room Offline gate here (an earlier single-instance design had
        // one): settings/model discovery is deployment-global and independent
        // of any one room's mode, so no single room's mode is authoritative.
        return sendJson(response, 200, await settingsService.refreshModels(url.searchParams.get("provider") ?? undefined));
      }
      if (request.method === "POST" && url.pathname === "/api/settings/credentials") {
        if (!settingsService) return sendJson(response, 503, { error: "Provider settings are unavailable" });
        try {
          const input = await readJsonBody(request);
          const saved = await settingsService.updateCredential(input);
          logEvent(logger, "provider_credential_updated", { provider: input.provider });
          return sendJson(response, 200, saved);
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }
      if (request.method === "DELETE" && url.pathname === "/api/settings/credentials") {
        if (!settingsService) return sendJson(response, 503, { error: "Provider settings are unavailable" });
        try {
          const provider = url.searchParams.get("provider");
          const saved = await settingsService.removeCredential(provider);
          logEvent(logger, "provider_credential_removed", { provider });
          return sendJson(response, 200, saved);
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }
      if (request.method === "POST" && url.pathname === "/api/settings") {
        if (!settingsService) return sendJson(response, 503, { error: "Provider settings are unavailable" });
        try {
          const saved = await settingsService.update(await readJsonBody(request));
          logEvent(logger, "provider_settings_updated", { provider: saved.provider, modelId: saved.modelId, reasoningEffort: saved.reasoningEffort });
          return sendJson(response, 200, saved);
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }
      if (request.method === "GET" && url.pathname === "/api/logs") {
        if (typeof logger?.recent !== "function") return sendJson(response, 503, { error: "Application log store is unavailable" });
        const limit = Number(url.searchParams.get("limit") ?? 100);
        return sendJson(response, 200, { events: await logger.recent(limit) });
      }
      if (request.method === "POST" && url.pathname === "/api/logs/client") {
        const payload = await readJsonBody(request);
        logEvent(logger, "client_error", {
          action: typeof payload.action === "string" ? payload.action.slice(0, 80) : "unknown",
          message: typeof payload.message === "string" ? payload.message.slice(0, 500) : "Unknown browser error",
        });
        return sendJson(response, 202, { accepted: true });
      }

      const roomMatch = url.pathname.match(/^\/api\/control-rooms\/([^/]+)(\/.*)?$/);
      if (roomMatch) {
        const roomId = decodeURIComponent(roomMatch[1]);
        const room = manager.getRoom(roomId);
        if (!room) return sendJson(response, 404, { error: `Unknown control room: ${roomId}` });
        if (room.health !== "READY") {
          return sendJson(response, 503, { error: `Control room "${roomId}" is unavailable`, code: "ROOM_UNAVAILABLE", reason: room.reason ?? null });
        }
        const handled = await handleRoomScopedRoute({ request, response, path: roomMatch[2] || "", runtime: room.applicationRuntime, logger, url });
        if (handled) return handled;
        // A known route prefix with no matching room-scoped branch: fall
        // through to the same 405/serveStatic handling as an unknown path,
        // rather than a distinct behavior a client would have to special-case.
      }

      if (request.method === "GET") return serveStatic(url.pathname, response);
      return sendJson(response, 405, { error: "Method not allowed" });
    } catch (error) {
      logEvent(requestLogger, "request_error", { method: request.method, path: url.pathname, error: error.message });
      const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
      return sendJson(response, status, { error: status < 500 ? error.message : "Internal server error", ...(status === 409 && error.code ? { code: error.code } : {}) });
    } finally {
      logEvent(requestLogger, "request_completed", {
        method: request.method,
        path: url.pathname,
        status: response.statusCode ?? "unknown",
        durationMs: Math.round(performance.now() - startedAt),
      });
    }
  };
}

export function createCompassServer(manager, logger = console, settingsService = null) {
  const server = createServer(createRequestHandler(manager, logger, settingsService));
  server.on("error", (error) => logEvent(logger, "server_error", { error: error.message }));
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.env.COMPASS_CONTROL_ROOMS_DATA_ROOT && process.env.NODE_ENV !== "test") {
    throw new Error("COMPASS_CONTROL_ROOMS_DATA_ROOT is test-only and requires NODE_ENV=test");
  }
  // Everything that survives a process restart resolves through this one
  // root.  Docker mounts it at /app/data; local installs retain backend/data.
  const dataRoot = resolveCompassDataRoot();
  const logger = createApplicationLogger(createApplicationLogStore(compassDataPath("application-events.json")), console);
  const settingsService = createProviderSettingsService({ filePath: compassDataPath("provider-settings.json") });
  await settingsService.initialize();
  const manager = await createControlRoomManager({
    // This is deliberately narrower than COMPASS_DATA_DIR: it is a test-only
    // isolation seam retained for the hermetic browser suite.
    dataRoot: process.env.COMPASS_CONTROL_ROOMS_DATA_ROOT ?? dataRoot,
    logger,
    plannerOptions: () => settingsService.requestOptions("event-planner"),
    agentOptions: () => settingsService.requestOptions("compass"),
  });
  // createControlRoomManager already reconciled each READY room once during
  // construction; this is the same reconcile-before-serve discipline the
  // single-instance boot sequence used, extended per room.
  const server = createCompassServer(manager, logger, settingsService);
  // Only the process that owns the port may drive the simulation. Starting the
  // scheduler before binding left every failed start (EADDRINUSE) alive as a
  // headless writer competing for the same state files.
  server.on("error", (error) => {
    // Only a failure to take the port is fatal. A later socket error must not
    // tear down a server that is serving.
    if (server.listening) return;
    logEvent(logger, "server_start_failed", { host, port, error: error.message });
    manager.stopProcessScheduler();
    process.exitCode = 1;
    server.close();
  });
  server.listen(port, host, () => {
    logEvent(logger, "server_started", { host, port });
    manager.startProcessScheduler();
  });
}
