import assert from "node:assert/strict";
import test from "node:test";
import { proxyRequest } from "../worker/index";

const assets = {
  fetch: async () => new Response("asset", { status: 200 }),
};

test("worker serves static assets outside the API", async () => {
  const response = await proxyRequest(
    new Request("https://ilovemd.tech/privacy/"),
    { ASSETS: assets, EXPORT_ORIGIN: "", FOLIO_ACCESS_TOKEN: "" },
  );
  assert.equal(await response.text(), "asset");
});

test("worker rejects unsupported API methods without SPA fallback", async () => {
  const response = await proxyRequest(
    new Request("https://ilovemd.tech/api/exports", { method: "GET" }),
    { ASSETS: assets, EXPORT_ORIGIN: "", FOLIO_ACCESS_TOKEN: "" },
  );
  assert.equal(response.status, 405);
  assert.equal((await response.json()).code, "API_METHOD_NOT_ALLOWED");
});

test("worker returns structured unavailability when origin is not configured", async () => {
  const response = await proxyRequest(
    new Request("https://ilovemd.tech/api/health"),
    { ASSETS: assets, EXPORT_ORIGIN: "", FOLIO_ACCESS_TOKEN: "" },
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "EXPORT_SERVICE_UNAVAILABLE");
});

test("worker forwards only approved API requests and injects its secret", async () => {
  let forwarded: RequestInfo | URL | undefined;
  const response = await proxyRequest(
    new Request("https://ilovemd.tech/api/health", {
      headers: { Authorization: "Bearer browser-value" },
    }),
    {
      ASSETS: assets,
      EXPORT_ORIGIN: "https://export-origin.ilovemd.tech",
      FOLIO_ACCESS_TOKEN: "worker-secret",
    },
    async (request) => {
      forwarded = request;
      return Response.json({ status: "ok" });
    },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.ok(forwarded instanceof Request);
  assert.equal(forwarded.url, "https://export-origin.ilovemd.tech/api/health");
  assert.equal(forwarded.headers.get("authorization"), "Bearer worker-secret");
  assert.equal(forwarded.headers.get("origin"), "https://ilovemd.tech");
});

test("worker streams POST bodies to the export origin", async () => {
  let forwardedBody = "";
  const response = await proxyRequest(
    new Request("https://ilovemd.tech/api/exports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ document: { source: "# Hello" } }),
    }),
    {
      ASSETS: assets,
      EXPORT_ORIGIN: "https://export-origin.ilovemd.tech",
      FOLIO_ACCESS_TOKEN: "worker-secret",
    },
    async (request) => {
      assert.ok(request instanceof Request);
      forwardedBody = await request.text();
      return Response.json({ id: "test-export" }, { status: 202 });
    },
  );
  assert.equal(response.status, 202);
  assert.deepEqual(JSON.parse(forwardedBody), {
    document: { source: "# Hello" },
  });
});

test("worker converts an unreachable origin into structured JSON", async () => {
  const response = await proxyRequest(
    new Request("https://ilovemd.tech/api/health"),
    {
      ASSETS: assets,
      EXPORT_ORIGIN: "https://export-origin.ilovemd.tech",
      FOLIO_ACCESS_TOKEN: "worker-secret",
    },
    async () => {
      throw new Error("offline");
    },
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "EXPORT_SERVICE_UNAVAILABLE");
});
