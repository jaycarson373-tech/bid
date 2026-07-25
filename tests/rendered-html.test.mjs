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

test("server-renders the BID market board", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>BID — Bet the Block<\/title>/i);
  assert.match(html, /BET THE/);
  assert.match(html, /Five-city EOY return/);
  assert.match(html, /Miami vs\. Austin — EOY return/);
  assert.match(html, /Austin positive from launch to EOY/);
  assert.match(html, /100% of platform revenue/);
  assert.match(html, /15-minute claim/);
  assert.match(html, /pump\.fun creator fees/i);
  assert.match(html, /liquidity reserve/i);
  assert.match(html, /holder reserve/i);
  assert.match(html, /Community market proposals are next/);
  assert.match(html, /Parcl provides housing data and resolution services/);
  assert.match(html, /Connect wallet/);
  assert.match(html, /Launch preview only\. Orders are simulated and never sent onchain\./);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps the finished product free of starter-preview code", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /mode: "head-to-head"/);
  assert.match(page, /mode: "field"/);
  assert.match(page, /mode: "yes-no"/);
  assert.match(page, /No transaction was sent/);
  assert.match(layout, /title: "BID — Bet the Block"/);
  assert.match(packageJson, /"name": "bid-real-estate-markets"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});
