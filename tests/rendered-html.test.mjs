import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
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
  assert.match(html, /Real estate/);
  assert.match(html, /Which U.S. city will have the highest home-price increase by EOY/);
  assert.match(html, /Which city will post the larger home-price increase by year-end/);
  assert.match(html, /Will Austin home prices finish 2026 positive year over year/);
  assert.match(html, /Connect wallet/);
  assert.match(html, /AWAITING LAUNCH/);
  assert.match(html, /0% prediction market fee for now/i);
  assert.match(html, /Orders use USDG/);
  assert.match(html, /Market/);
  assert.match(html, /Limit/);
  assert.match(html, /Liquidity/);
  assert.match(html, /Mainnet prelaunch/i);
  assert.match(html, /1\.5%/);
  assert.match(html, /45%/);
  assert.match(html, /30%/);
  assert.match(html, /BUYBACK \+ BURN/);
  assert.match(html, /CREATOR REWARDS/);
  assert.doesNotMatch(html, /Solana|pump\.fun/i);
  assert.match(html, /HOUSING MARKETS/);
  assert.doesNotMatch(html, /\$6\.4M|\$12\.8M|\$428K|\$482K|Balance \$2,840\.00|61%|39%|\+7 pts/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("server-renders professional protocol documentation with honest deployment status", async () => {
  const response = await render("/docs");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /BID Protocol Docs/);
  assert.match(html, /Fixed-product pricing/);
  assert.match(html, /Liquidity/);
  assert.match(html, /Keeper required/);
  assert.match(html, /creator-fee layer is 1\.5%/i);
  assert.match(html, /RESERVE ONLY/);
  assert.match(html, /final token CA and Pons launch record are awaiting verification/i);
  assert.match(html, /Production requirements/);
  assert.match(html, /Funded Merkle reward epochs/);
  assert.match(html, /AWAITING PUBLICATION/);
});

test("server-renders the rewards claim surface in an honest prelaunch state", async () => {
  const response = await render("/rewards");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /BID Rewards/);
  assert.match(html, /Claim rewards/);
  assert.match(html, /LP rewards are reserve only/);
  assert.match(html, /AWAITING PUBLICATION/);
  assert.match(html, /Each wallet can claim once per epoch/);
});

test("server-renders creator markets as a disabled coming-soon workflow", async () => {
  const response = await render("/create");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Create a market/);
  assert.match(html, /COMING SOON/);
  assert.match(html, /RESOLUTION SOURCE/);
  assert.match(html, /CREATION NOT YET ACTIVE/);
  assert.match(html, /disabled/);
});

test("keeps the finished product free of starter-preview code", async () => {
  const [page, layout, packageJson, launchState, siteConfig, feePolicy] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../lib/launchState.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/site.ts", import.meta.url), "utf8"),
    readFile(new URL("../config/bid-fee-policy-v1.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /mode: "head-to-head"/);
  assert.match(page, /mode: "field"/);
  assert.match(page, /mode: "yes-no"/);
  assert.match(page, /no signature requested/i);
  assert.match(page, /no transaction was built/);
  assert.match(page, /placeBuyLimit/);
  assert.match(page, /addFunding/);
  assert.match(page, /removeFundingToCollateral/);
  assert.match(page, /Add liquidity/);
  assert.match(page, /Withdraw liquidity/);
  assert.match(page, /waitForTransactionReceipt/);
  assert.match(page, /0% prediction market fee for now/i);
  assert.match(page, /BID CREATOR FEE/);
  assert.match(page, /Robinhood Chain/);
  assert.match(page, /Pons/);
  assert.match(page, /Sample data/);
  assert.match(page, /Awaiting liquidity/i);
  assert.match(page, /\/docs/);
  assert.match(layout, /title: "BID — BID the Block"/);
  assert.match(launchState, /"prelaunch"/);
  assert.match(siteConfig, /feePolicy\.creatorFeeBps/);
  assert.match(siteConfig, /PLACEHOLDER/);
  assert.match(siteConfig, /lpRewardsShareBps/);
  assert.match(siteConfig, /marketLiquidityShareBps/);
  assert.match(siteConfig, /creatorRewardsShareBps/);
  assert.equal(Object.values(JSON.parse(feePolicy).allocations).reduce((sum, value) => sum + Number(value), 0), 10_000);
  assert.match(packageJson, /"name": "bid-real-estate-markets"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});
