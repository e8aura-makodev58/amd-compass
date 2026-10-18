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
