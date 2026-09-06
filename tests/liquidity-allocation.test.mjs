import assert from "node:assert/strict";
import test from "node:test";

import { bidFeePolicy } from "../config/bid-fee-policy.mjs";
import { buildLiquidityAllocationPlan } from "../services/liquidity-allocation.mjs";

test("canonical fee policy sums to 100 percent", () => {
  assert.equal(
    Object.values(bidFeePolicy.allocations).reduce((total, value) => total + value, 0),
    10_000,
  );
  assert.deepEqual(bidFeePolicy.allocations, {
    lpRewards: 4_500,
    marketLiquidity: 3_000,
    buybackBurn: 1_000,
    treasury: 1_000,
    creatorRewards: 500,
  });
});

test("liquidity is allocated by real depth deficit", () => {
  const plan = buildLiquidityAllocationPlan([
    { address: "0xbbb", currentDepth: 80n },
    { address: "0xaaa", currentDepth: 20n },
    { address: "0xccc", currentDepth: 100n },
  ], 50n, 100n, 1n);

  assert.deepEqual(plan, [
    { address: "0xaaa", amount: 40n },
    { address: "0xbbb", amount: 10n },
  ]);
});

test("liquidity plan leaves sub-minimum and above-target markets untouched", () => {
  const plan = buildLiquidityAllocationPlan([
    { address: "0xaaa", currentDepth: 96n },
    { address: "0xbbb", currentDepth: 120n },
  ], 50n, 100n, 5n);

  assert.deepEqual(plan, []);
});
