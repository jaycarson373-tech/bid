import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("beta recovery is read-only by default and requires an explicit execution gate", async () => {
  const script = await read("scripts/recover-beta-liquidity.mjs");
  const manifest = JSON.parse(await read("package.json"));

  assert.match(script, /Mode: \$\{execute \? "EXECUTE" : "READ-ONLY CHECK"\}/);
  assert.match(script, /I_APPROVE_25_USDG_RECOVERY/);
  assert.match(script, /trades\.length !== 0/);
  assert.match(script, /limitOrders\.length !== 0/);
  assert.match(script, /vaultShares !== totalShares/);
  assert.match(script, /residualOutcomeTokens\.some/);
  assert.match(script, /simulateContract/);
  assert.equal(manifest.scripts["recover:beta:check"].includes("--execute"), false);
  assert.equal(manifest.scripts["recover:beta"].endsWith("--execute"), true);
});

test("v2 policy sets the requested 5 to 50 USDG order range", async () => {
  const policy = JSON.parse(await read("config/bid-market-policy-v2.json"));

  assert.equal(policy.minimumOrderAtomic, "5000000");
  assert.equal(policy.maximumOrderAtomic, "50000000");
  assert.equal(policy.payoutPerWinningShareAtomic, "1000000");
  assert.equal(policy.targetFormat, "BINARY_UP_DOWN");
  assert.equal(policy.communityCreationEnabled, false);
});
