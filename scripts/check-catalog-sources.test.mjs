import assert from "node:assert/strict";
import test from "node:test";

import {
  checkCatalogSources,
  loadCatalogReleaseSources
} from "./check-catalog-sources.mjs";

test("loads only the database-selected release candidate sources", async () => {
  const calls = [];
  const sources = await loadCatalogReleaseSources(
    {
      REST_URL: "http://127.0.0.1:54321/rest/v1",
      SERVICE_ROLE_KEY: "test-service-key"
    },
    async (url, options) => {
      calls.push([url, options]);
      return new Response(
        JSON.stringify([
          { id: "current-source", url: "https://example.test/current" }
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
  );

  assert.deepEqual(sources, [
    { id: "current-source", url: "https://example.test/current" }
  ]);
  assert.equal(
    calls[0][0],
    "http://127.0.0.1:54321/rest/v1/rpc/list_catalog_release_sources"
  );
  assert.equal(calls[0][1].method, "POST");
  assert.equal(calls[0][1].headers.apikey, "test-service-key");
  assert.equal(calls[0][1].body, "{}");
});

test("source checks are deterministic and report broken references", async () => {
  const calls = [];
  const report = await checkCatalogSources(
    [
      { id: "source-b", url: "https://example.test/b" },
      { id: "source-a", url: "https://example.test/a" }
    ],
    {
      resolveImpl: async () => [{ address: "93.184.216.34", family: 4 }],
      requestImpl: async (url, options) => {
        calls.push([url.href, options.method, options.address]);
        return {
          status: url.pathname.endsWith("/a") ? 200 : 404,
          location: null
        };
      }
    }
  );

  assert.deepEqual(calls, [
    ["https://example.test/a", "HEAD", "93.184.216.34"],
    ["https://example.test/b", "HEAD", "93.184.216.34"]
  ]);
  assert.equal(report.checked, 2);
  assert.equal(report.broken, 1);
  assert.deepEqual(
    report.results.map(({ id, ok, status }) => ({ id, ok, status })),
    [
      { id: "source-a", ok: true, status: 200 },
      { id: "source-b", ok: false, status: 404 }
    ]
  );
});

test("source checks fall back to GET when HEAD is unsupported", async () => {
  const methods = [];
  const report = await checkCatalogSources(
    [{ id: "source-a", url: "https://example.test/a" }],
    {
      resolveImpl: async () => [{ address: "93.184.216.34", family: 4 }],
      requestImpl: async (_url, options) => {
        methods.push(options.method);
        return {
          status: options.method === "HEAD" ? 405 : 204,
          location: null
        };
      }
    }
  );

  assert.deepEqual(methods, ["HEAD", "GET"]);
  assert.equal(report.broken, 0);
});

test("source checks refuse loopback and private destinations", async () => {
  const report = await checkCatalogSources(
    [
      { id: "loopback", url: "https://localhost/source" },
      { id: "private", url: "https://content.example.test/source" }
    ],
    {
      resolveImpl: async (hostname) => [
        {
          address: hostname === "localhost" ? "127.0.0.1" : "10.0.0.8",
          family: 4
        }
      ],
      requestImpl: async () => {
        throw new Error("request should not run");
      }
    }
  );

  assert.equal(report.broken, 2);
  assert.deepEqual(
    report.results.map(({ error }) => error),
    ["UnsafeSourceUrl", "UnsafeSourceAddress"]
  );
});

test("source checks validate every redirect and reject private destinations", async () => {
  const requested = [];
  const report = await checkCatalogSources(
    [{ id: "redirect", url: "https://public.example.test/start?token=secret" }],
    {
      resolveImpl: async (hostname) => [
        {
          address:
            hostname === "public.example.test" ? "93.184.216.34" : "127.0.0.1",
          family: 4
        }
      ],
      requestImpl: async (url, options) => {
        requested.push([url.href, options.address]);
        return {
          status: 302,
          location: "https://private.example.test/internal"
        };
      }
    }
  );

  assert.deepEqual(requested, [
    ["https://public.example.test/start?token=secret", "93.184.216.34"]
  ]);
  assert.equal(report.broken, 1);
  assert.equal(report.results[0].error, "UnsafeSourceAddress");
  assert.equal(report.results[0].url, "https://public.example.test/start");
});

test("source checks reject private and transition address ranges", async () => {
  for (const address of [
    "::ffff:127.0.0.1",
    "100.64.0.1",
    "fec0::1",
    "64:ff9b::a00:1",
    "2002:a00:1::"
  ]) {
    const report = await checkCatalogSources(
      [{ id: address, url: "https://public.example.test/source" }],
      {
        resolveImpl: async () => [{ address, family: 6 }],
        requestImpl: async () => {
          throw new Error("request should not run");
        }
      }
    );
    assert.equal(report.results[0].error, "UnsafeSourceAddress");
  }
});
