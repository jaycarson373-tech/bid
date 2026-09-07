import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("public product is HOOD Options and does not expose fabricated live data", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /HOOD OPTIONS/);
  assert.match(page, /EUROPEAN OPTIONS/);
  assert.match(page, /MODEL PREVIEW/);
  assert.match(page, /not a live quote/i);
  assert.match(page, /Fully funded maximum payout/i);
  assert.match(page, /Trading activates after deployment/i);
  assert.match(page, /Premiums remain inside the vault/i);
  assert.match(page, /No production program, collateral vault, or equity settlement oracle is live yet/i);
  assert.doesNotMatch(page, /creator market|creator rewards|Robinhood Chain|Pons|USDG/i);
  assert.doesNotMatch(page, /\$\d+(?:\.\d+)?M|APR|APY/);
  assert.match(layout, /HOOD OPTIONS — European Stock Options on Solana/);
});

test("documentation states collateral lifecycle and production blockers", async () => {
  const docs = await readFile(new URL("../app/docs/page.tsx", import.meta.url), "utf8");
  assert.match(docs, /CALL PAYOUT/);
  assert.match(docs, /PUT PAYOUT/);
  assert.match(docs, /Maximum unresolved payout/);
  assert.match(docs, /HOOD equity feed has not been bound/);
  assert.match(docs, /End-to-end devnet lifecycle/);
  assert.match(docs, /There is no separate emissions promise and no creator-market allocation/);
});

test("creator and legacy rewards routes are removed", async () => {
  await assert.rejects(access(new URL("../app/create/page.tsx", import.meta.url)));
  await assert.rejects(access(new URL("../app/rewards/page.tsx", import.meta.url)));
});

test("Solana secret stays server-only", async () => {
  const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(envExample, /ORACLE_OPERATOR_KEYPAIR_B64/);
  assert.doesNotMatch(envExample, /NEXT_PUBLIC_.*(?:PRIVATE|SECRET|KEYPAIR)/i);
});
