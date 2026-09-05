import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  concat,
  encodeAbiParameters,
  getAddress,
  isAddress,
  keccak256,
  parseUnits,
} from "viem";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function hashPair(left, right) {
  return keccak256(concat(left.toLowerCase() < right.toLowerCase() ? [left, right] : [right, left]));
}

function leafHash(epochId, asset, account, amount) {
  const encoded = encodeAbiParameters(
    [{ type: "uint256" }, { type: "address" }, { type: "address" }, { type: "uint256" }],
    [epochId, asset, account, amount],
  );
  return keccak256(keccak256(encoded));
}

function buildLevels(leaves) {
  const levels = [leaves];
  while (levels.at(-1).length > 1) {
    const current = levels.at(-1);
    const next = [];
    for (let index = 0; index < current.length; index += 2) {
      next.push(hashPair(current[index], current[index + 1] ?? current[index]));
    }
    levels.push(next);
  }
  return levels;
}

function proofFor(levels, leafIndex) {
  const proof = [];
  let index = leafIndex;
  for (let levelIndex = 0; levelIndex < levels.length - 1; levelIndex += 1) {
    const level = levels[levelIndex];
    const siblingIndex = index ^ 1;
    proof.push(level[siblingIndex] ?? level[index]);
    index = Math.floor(index / 2);
  }
  return proof;
}

export function buildRewardsEpoch(input) {
  const epochId = BigInt(input.epochId);
  const decimals = Number(input.decimals ?? 6);
  const rawAsset = input.asset || ZERO_ADDRESS;
  if (epochId <= 0n) throw new Error("epochId must be greater than zero");
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error("decimals must be between 0 and 36");
  if (!isAddress(rawAsset)) throw new Error("asset must be a valid EVM address");
  if (!Array.isArray(input.rewards) || input.rewards.length === 0) throw new Error("rewards must contain at least one entry");

  const asset = getAddress(rawAsset);
  const seen = new Set();
  const claims = input.rewards.map((reward) => {
    if (!isAddress(reward.account)) throw new Error(`invalid reward account: ${reward.account}`);
    const account = getAddress(reward.account);
    const accountKey = account.toLowerCase();
    if (seen.has(accountKey)) throw new Error(`duplicate reward account: ${account}`);
    seen.add(accountKey);
    const amount = parseUnits(String(reward.amount), decimals);
    if (amount <= 0n) throw new Error(`reward amount must be positive for ${account}`);
    return { account, amount, leaf: leafHash(epochId, asset, account, amount) };
  });

  const levels = buildLevels(claims.map((claim) => claim.leaf));
  const totalAllocation = claims.reduce((total, claim) => total + claim.amount, 0n);
  return {
    epochId: epochId.toString(),
    asset,
    decimals,
    merkleRoot: levels.at(-1)[0],
    totalAllocation: totalAllocation.toString(),
    claims: claims.map((claim, index) => ({
      account: claim.account,
      amount: claim.amount.toString(),
      leaf: claim.leaf,
      proof: proofFor(levels, index),
    })),
  };
}

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) {
    throw new Error("usage: npm run rewards:build -- input.json output.json");
  }
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const epoch = buildRewardsEpoch(input);
  await writeFile(outputPath, `${JSON.stringify(epoch, null, 2)}\n`, { flag: "wx" });
  console.log(`PASS  epoch ${epoch.epochId} root ${epoch.merkleRoot}`);
  console.log(`PASS  ${epoch.claims.length} claims total ${epoch.totalAllocation} base units`);
  console.log(`WROTE ${outputPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`FAIL  ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
