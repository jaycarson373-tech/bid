import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the BID market board in prelaunch without fabricated telemetry", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>BID — BID the Block<\/title>/i);
  assert.match(html, /BID THE/);
  assert.match(html, /Highest city price growth by EOY/);
  assert.match(html, /Florida home-price growth showdown/);
  assert.match(html, /Austin turns positive by year-end/);
  assert.match(html, /Connect wallet/);
  assert.match(html, /Demo only\. Orders are simulated and never sent onchain\./);
  assert.match(html, /Markets open at launch/);
  assert.doesNotMatch(html, /\$6\.4M|\$12\.8M|\$428K|\$482K|Balance \$2,840\.00|61%|39%|\+7 pts/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps the finished product free of starter-preview code", async () => {
  const [page, layout, packageJson, launchState] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../lib/launchState.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /mode: "head-to-head"/);
  assert.match(page, /mode: "field"/);
  assert.match(page, /mode: "yes-no"/);
  assert.match(page, /No transaction was sent/);
  assert.match(page, /Sample data/);
  assert.match(page, /Markets open at launch/);
  assert.match(layout, /title: "BID — BID the Block"/);
  assert.match(launchState, /"prelaunch"/);
  assert.match(packageJson, /"name": "bid-real-estate-markets"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});
