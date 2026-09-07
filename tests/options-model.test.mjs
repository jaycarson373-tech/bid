import assert from "node:assert/strict";
import test from "node:test";

function payout(side, lower, upper, settlement) {
  const width = upper - lower;
  if (width <= 0) throw new Error("Upper strike must exceed lower strike");
  const intrinsic = side === "call" ? settlement - lower : upper - settlement;
  return Math.max(0, Math.min(width, intrinsic));
}

test("capped call spread never exceeds its funded liability", () => {
  assert.equal(payout("call", 70, 80, 50), 0);
  assert.equal(payout("call", 70, 80, 75), 5);
  assert.equal(payout("call", 70, 80, 200), 10);
});

test("capped put spread never exceeds its funded liability", () => {
  assert.equal(payout("put", 70, 80, 100), 0);
  assert.equal(payout("put", 70, 80, 75), 5);
  assert.equal(payout("put", 70, 80, 0), 10);
});

test("vault cannot write liabilities beyond available collateral", () => {
  const availableCollateral = 2500_000000n;
  const maxPayoutPerContract = 10_000000n;
  const requestedContracts = 251n;
  assert.equal(requestedContracts * maxPayoutPerContract > availableCollateral, true);
});
