export const BPS_DENOMINATOR = 10_000n;

export type FeeSplit = {
  liquidityLamports: bigint;
  holderRewardsLamports: bigint;
};

export function splitLamports(
  grossLamports: bigint,
  liquidityBps: number,
  holderRewardsBps: number,
): FeeSplit {
  if (grossLamports < 0n) {
    throw new Error("grossLamports cannot be negative");
  }

  if (
    !Number.isInteger(liquidityBps) ||
    !Number.isInteger(holderRewardsBps) ||
    liquidityBps < 0 ||
    holderRewardsBps < 0 ||
    liquidityBps + holderRewardsBps !== Number(BPS_DENOMINATOR)
  ) {
    throw new Error("fee split must be non-negative integers totaling 10,000 bps");
  }

  const liquidityLamports =
    (grossLamports * BigInt(liquidityBps)) / BPS_DENOMINATOR;

  return {
    liquidityLamports,
    holderRewardsLamports: grossLamports - liquidityLamports,
  };
}

export function claimWindowStart(
  date: Date,
  intervalMinutes = 15,
): Date {
  if (!Number.isInteger(intervalMinutes) || intervalMinutes <= 0) {
    throw new Error("intervalMinutes must be a positive integer");
  }

  const intervalMs = intervalMinutes * 60_000;
  return new Date(Math.floor(date.getTime() / intervalMs) * intervalMs);
}
