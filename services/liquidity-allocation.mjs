export function buildLiquidityAllocationPlan(markets, available, targetDepth, minimumDeployment) {
  if (available <= 0n || targetDepth <= 0n || minimumDeployment <= 0n) return [];

  const eligible = markets
    .map((market) => ({
      address: market.address,
      deficit: targetDepth > market.currentDepth ? targetDepth - market.currentDepth : 0n,
    }))
    .filter((market) => market.deficit >= minimumDeployment)
    .sort((left, right) => {
      if (left.deficit === right.deficit) return left.address.localeCompare(right.address);
      return left.deficit > right.deficit ? -1 : 1;
    });

  const plan = [];
  let remaining = available;
  let remainingDeficit = eligible.reduce((total, market) => total + market.deficit, 0n);

  for (const market of eligible) {
    if (remaining < minimumDeployment) break;
    const amount = remainingDeficit === market.deficit
      ? (remaining < market.deficit ? remaining : market.deficit)
      : (remaining * market.deficit / remainingDeficit);
    remainingDeficit -= market.deficit;
    if (amount < minimumDeployment) continue;
    const cappedAmount = amount < market.deficit ? amount : market.deficit;
    plan.push({ address: market.address, amount: cappedAmount });
    remaining -= cappedAmount;
  }

  return plan;
}
