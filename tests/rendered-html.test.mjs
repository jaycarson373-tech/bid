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

test("server-renders the live BID beta market board without fabricated telemetry", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>BID — BID the Block<\/title>/i);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.bidrh\.com"/i);
  assert.match(html, /Real estate/);
  assert.match(html, /Will Miami(?:&#x27;|')s home-price index rise by September 30/);
  assert.match(html, /Coming soon/);
  assert.match(html, /Beta/);
  assert.match(html, /Mar 5, 2027/);
  assert.match(html, /Which city posts the highest home-price growth from September 2026 to March 2027/);
  assert.match(html, /Will Austin home prices finish 2026 positive year over year/);
  assert.match(html, /Connect wallet/);
  assert.doesNotMatch(html, /CA AWAITING LAUNCH|class="ca-pill"/i);
  assert.match(html, /0% BID market fee/i);
  assert.match(html, /USDG-BACKED MARKETS/);
  assert.match(html, /One live beta market/i);
  assert.match(html, /Market/);
  assert.match(html, /Limit/);
  assert.match(html, /Exit position/);
  assert.doesNotMatch(html, /Own an LP share|Add liquidity/);
  assert.match(html, /1\.5%/);
  assert.match(html, /45%/);
  assert.match(html, /30%/);
  assert.match(html, /BUYBACK \+ BURN/);
  assert.match(html, /CREATOR REWARDS/);
  assert.doesNotMatch(html, /Solana|pump\.fun/i);
  assert.match(html, /HOUSING MARKETS/);
  assert.match(html, /MARKETS LIVE/);
  assert.match(html, /ONE MARKET LIVE/);
  assert.match(html, /Market depth and points/);
  assert.match(html, /50 USDG LIVE BACKING/);
  assert.match(html, /LOCKED · COMING SOON/);
  assert.match(html, /\$5 per order/i);
  assert.match(html, /Parcl ID 5352987/);
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
  assert.match(html, /BID token and Pons launch are separate from the live prediction market/i);
  assert.match(html, /Production requirements/);
  assert.match(html, /Funded Merkle reward epochs/);
  assert.match(html, /keeps the maximum order at or below 5%/i);
  assert.match(html, /BID_POINTS_POLICY_V1/);
  assert.match(html, /0xD9da3C6F2272760a6AFcd6F2D95114231dF5D186/);
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
  const [page, layout, packageJson, launchState, siteConfig, feePolicy, pointsPolicy] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../lib/launchState.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/site.ts", import.meta.url), "utf8"),
    readFile(new URL("../config/bid-fee-policy-v1.json", import.meta.url), "utf8"),
    readFile(new URL("../config/bid-points-policy-v1.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /mode: "field"/);
  assert.match(page, /mode: "yes-no"/);
  assert.match(page, /no signature requested/i);
  assert.match(page, /no transaction was built/);
  assert.match(page, /Fill now or cancel/);
  assert.match(page, /otherwise nothing is submitted/);
  assert.match(page, /maximumSellQuote/);
  assert.match(page, /Max position/);
  assert.match(page, /functionName: "quoteSell"/);
  assert.match(page, /functionName: "sell"/);
  assert.match(page, /Position sold/);
  assert.match(page, /addFunding/);
  assert.match(page, /removeFundingToCollateral/);
  assert.match(page, /Add liquidity/);
  assert.match(page, /Withdraw liquidity/);
  assert.match(page, /disabled={!isMarketEnabled}/);
  assert.match(page, /waitForTransactionReceipt/);
  assert.match(page, /0% BID market fee/i);
  assert.match(page, /BID CREATOR FEE/);
  assert.match(page, /Robinhood Chain/);
  assert.match(page, /Pons/);
  assert.match(page, /Sample data/);
  assert.match(page, /Winning position redeemed/i);
  assert.match(page, /event Trade/);
  assert.match(page, /BETA ACTIVITY LEADERBOARD/);
  assert.match(page, /Activity points are a beta score, not a reward entitlement/);
  assert.match(page, /Disconnect wallet/);
  assert.match(page, /eip6963:requestProvider/);
  assert.match(page, /MetaMask/);
  assert.match(page, /Rabby/);
  assert.match(page, /Phantom/);
  assert.match(page, /wallet_requestPermissions/);
  assert.match(page, /wallet_revokePermissions/);
  assert.match(page, /wallet_disconnect/);
  assert.match(page, /const provider = activeProvider/);
  assert.match(page, /marketDeploymentBlocks/);
  assert.doesNotMatch(page, /href="\/create">Create<\/a>/);
  assert.match(page, /\/docs/);
  assert.match(layout, /title: "BID — BID the Block"/);
  assert.match(launchState, /: "live"/);
  assert.match(siteConfig, /feePolicy\.creatorFeeBps/);
  assert.match(siteConfig, /PLACEHOLDER/);
  assert.match(siteConfig, /lpRewardsShareBps/);
  assert.match(siteConfig, /marketLiquidityShareBps/);
  assert.match(siteConfig, /creatorRewardsShareBps/);
  assert.equal(Object.values(JSON.parse(feePolicy).allocations).reduce((sum, value) => sum + Number(value), 0), 10_000);
  assert.equal(JSON.parse(pointsPolicy).rewardEntitlement, false);
  assert.match(packageJson, /"name": "bid-real-estate-markets"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});
