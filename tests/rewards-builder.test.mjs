import assert from "node:assert/strict";
import test from "node:test";
import { concat, keccak256 } from "viem";
import { buildRewardsEpoch } from "../scripts/build-rewards-epoch.mjs";

function hashPair(left, right) {
  return keccak256(concat(left.toLowerCase() < right.toLowerCase() ? [left, right] : [right, left]));
}

test("builds proofs that resolve to the published reward root", () => {
  const epoch = buildRewardsEpoch({
    epochId: 1,
    asset: "0x0000000000000000000000000000000000000001",
    decimals: 6,
    rewards: [
      { account: "0x0000000000000000000000000000000000000011", amount: "70" },
      { account: "0x0000000000000000000000000000000000000022", amount: "20" },
      { account: "0x0000000000000000000000000000000000000033", amount: "10" },
    ],
  });

  assert.equal(epoch.totalAllocation, "100000000");
  for (const claim of epoch.claims) {
    const root = claim.proof.reduce((node, sibling) => hashPair(node, sibling), claim.leaf);
    assert.equal(root, epoch.merkleRoot);
  }
});

test("rejects duplicate reward accounts", () => {
  assert.throws(() => buildRewardsEpoch({
    epochId: 2,
    asset: "0x0000000000000000000000000000000000000001",
    rewards: [
      { account: "0x0000000000000000000000000000000000000011", amount: "1" },
      { account: "0x0000000000000000000000000000000000000011", amount: "2" },
    ],
  }), /duplicate reward account/);
});
