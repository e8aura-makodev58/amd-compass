import assert from "node:assert/strict";
import test from "node:test";
import { createRequestHandler } from "../src/server.mjs";

async function headersFor(url) {
  const capture = {};
  const response = { writeHead(status, headers) { capture.status = status; capture.headers = headers; }, end() {} };
  await createRequestHandler(null)({ method: "GET", url, headers: { host: "localhost" }, async *[Symbol.asyncIterator]() {} }, response);
  return capture;
}

test("app pages and scripts must be revalidated, so a deploy is never hidden behind a cached copy", async () => {
  for (const url of ["/", "/rooms/plant-1", "/app.js", "/tokens.css"]) {
    const { status, headers } = await headersFor(url);
    assert.equal(status, 200, url);
    assert.equal(headers["cache-control"], "no-cache", url);
  }
});

test("vendored fonts and libraries, which never change, may be cached", async () => {
  const { status, headers } = await headersFor("/vendor/fonts/fonts.css");
  assert.equal(status, 200);
  assert.match(headers["cache-control"], /max-age=604800/);
});

async function bodyOf(url) {
  let body = "";
  const response = { writeHead() {}, end(chunk) { body = String(chunk); } };
  await createRequestHandler(null)({ method: "GET", url, headers: { host: "localhost" }, async *[Symbol.asyncIterator]() {} }, response);
  return body;
}

test("every app stylesheet, script and module import carries the same content version; vendor files do not", async () => {
  const html = await bodyOf("/");
  const version = html.match(/\/app\.js\?v=([0-9a-f]{12})"/)?.[1];
  assert.ok(version, "app.js is versioned");
  for (const file of ["tokens.css", "base.css", "ops.css", "layout.css"]) assert.ok(html.includes(`/${file}?v=${version}"`), file);
  assert.ok(html.includes('href="/vendor/dockview/dockview.css"'), "vendor stays unversioned");
  const app = await bodyOf(`/app.js?v=${version}`);
  for (const module of ["workspace-nav.js", "staffing-view.js", "tiling.js", "pareto.js", "render-lifecycle.js"]) {
    assert.ok(app.includes(`./${module}?v=${version}`), module);
  }
  assert.doesNotMatch(app, /from\s+["']\.\/[\w.-]+\.js["']/, "no unversioned relative import is left");
});
