import assert from "node:assert/strict";
import test from "node:test";

import { claimWindowStart, splitLamports } from "./policy.js";

test("splits even creator fees 50/50", () => {
  assert.deepEqual(splitLamports(2_000_000n, 5_000, 5_000), {
    liquidityLamports: 1_000_000n,
    holderRewardsLamports: 1_000_000n,
  });
});

test("assigns an odd remainder to holder rewards", () => {
  assert.deepEqual(splitLamports(5n, 5_000, 5_000), {
    liquidityLamports: 2n,
    holderRewardsLamports: 3n,
  });
});

test("rejects a split that does not total 100 percent", () => {
  assert.throws(() => splitLamports(10n, 4_000, 5_000), /10,000 bps/);
});

test("uses stable UTC fifteen-minute idempotency windows", () => {
  assert.equal(
    claimWindowStart(new Date("2026-07-25T19:29:59.999Z")).toISOString(),
    "2026-07-25T19:15:00.000Z",
  );
});
