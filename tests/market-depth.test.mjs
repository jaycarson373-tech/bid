import assert from "node:assert/strict";
import test from "node:test";

import {
  endingBinarySpotBps,
  recommendedMaxOrder,
  requiredDepthForOrder,
} from "../services/market-depth.mjs";

test("binary pool depth math quantifies the current beta price impact", () => {
  assert.equal(endingBinarySpotBps(25_000_000n, 5_000_000n), 5_901n);
  assert.equal(endingBinarySpotBps(100_000_000n, 5_000_000n), 5_243n);
});

test("the conservative order cap remains five percent of equal outcome depth", () => {
  assert.equal(recommendedMaxOrder(100_000_000n), 5_000_000n);
  assert.equal(requiredDepthForOrder(5_000_000n), 100_000_000n);
  assert.equal(requiredDepthForOrder(50_000_000n), 1_000_000_000n);
});

test("depth math rejects invalid values", () => {
  assert.throws(() => endingBinarySpotBps(0n, 1n));
  assert.throws(() => recommendedMaxOrder(1n, 10_001n));
  assert.throws(() => requiredDepthForOrder(0n));
});
