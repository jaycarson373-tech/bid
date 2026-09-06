import { readFileSync } from "node:fs";

const policyUrl = new URL("./bid-fee-policy-v1.json", import.meta.url);
export const bidFeePolicy = JSON.parse(readFileSync(policyUrl, "utf8"));

const allocationTotal = Object.values(bidFeePolicy.allocations)
  .reduce((total, basisPoints) => total + basisPoints, 0);

if (allocationTotal !== bidFeePolicy.basisPoints) {
  throw new Error(
    `${bidFeePolicy.version} allocations total ${allocationTotal}; expected ${bidFeePolicy.basisPoints}`,
  );
}

if (bidFeePolicy.creatorFeeBps !== 150) {
  throw new Error(`${bidFeePolicy.version} creator fee must be 150 basis points`);
}

export const bidFeePolicyHash = bidFeePolicy.version;
