export const DEFAULT_MAX_ORDER_TO_DEPTH_BPS = 500n;

export function endingBinarySpotBps(equalOutcomeDepth, collateralIn) {
  if (equalOutcomeDepth <= 0n || collateralIn < 0n) {
    throw new Error("depth must be positive and order amount cannot be negative");
  }

  const postTradeDepth = equalOutcomeDepth + collateralIn;
  const boughtSideWeight = postTradeDepth * postTradeDepth;
  const otherSideWeight = equalOutcomeDepth * equalOutcomeDepth;
  return boughtSideWeight * 10_000n / (boughtSideWeight + otherSideWeight);
}

export function recommendedMaxOrder(equalOutcomeDepth, maxOrderToDepthBps = DEFAULT_MAX_ORDER_TO_DEPTH_BPS) {
  if (equalOutcomeDepth <= 0n || maxOrderToDepthBps <= 0n || maxOrderToDepthBps > 10_000n) {
    throw new Error("depth and order ratio must be valid positive values");
  }
  return equalOutcomeDepth * maxOrderToDepthBps / 10_000n;
}

export function requiredDepthForOrder(orderAmount, maxOrderToDepthBps = DEFAULT_MAX_ORDER_TO_DEPTH_BPS) {
  if (orderAmount <= 0n || maxOrderToDepthBps <= 0n || maxOrderToDepthBps > 10_000n) {
    throw new Error("order amount and order ratio must be valid positive values");
  }
  return (orderAmount * 10_000n + maxOrderToDepthBps - 1n) / maxOrderToDepthBps;
}
