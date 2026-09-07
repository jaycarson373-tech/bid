export type OptionSide = "call" | "put";

export type QuoteInput = {
  spot: number;
  lowerStrike: number;
  upperStrike: number;
  volatility: number;
  years: number;
  rate: number;
  side: OptionSide;
};

function normalCdf(value: number) {
  const absolute = Math.abs(value);
  const t = 1 / (1 + 0.2316419 * absolute);
  const density = Math.exp(-(absolute * absolute) / 2) / Math.sqrt(2 * Math.PI);
  const probability = 1 - density * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return value >= 0 ? probability : 1 - probability;
}

function vanillaQuote(spot: number, strike: number, volatility: number, years: number, rate: number, side: OptionSide) {
  if (spot <= 0 || strike <= 0 || volatility <= 0 || years <= 0) return { premium: 0, delta: 0 };
  const rootTime = Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (rate + (volatility * volatility) / 2) * years) / (volatility * rootTime);
  const d2 = d1 - volatility * rootTime;
  const discount = Math.exp(-rate * years);
  if (side === "call") return { premium: spot * normalCdf(d1) - strike * discount * normalCdf(d2), delta: normalCdf(d1) };
  return { premium: strike * discount * normalCdf(-d2) - spot * normalCdf(-d1), delta: normalCdf(d1) - 1 };
}

export function optionQuote(input: QuoteInput) {
  if (input.upperStrike <= input.lowerStrike) throw new Error("Upper strike must exceed lower strike");
  const lower = vanillaQuote(input.spot, input.lowerStrike, input.volatility, input.years, input.rate, input.side);
  const upper = vanillaQuote(input.spot, input.upperStrike, input.volatility, input.years, input.rate, input.side);
  const premium = input.side === "call" ? lower.premium - upper.premium : upper.premium - lower.premium;
  const delta = input.side === "call" ? lower.delta - upper.delta : upper.delta - lower.delta;
  return { premium: Math.max(0, Math.min(input.upperStrike - input.lowerStrike, premium)), delta, maxPayout: input.upperStrike - input.lowerStrike };
}

export function payoutAtExpiry(input: Pick<QuoteInput, "lowerStrike" | "upperStrike" | "side">, settlementPrice: number) {
  const width = input.upperStrike - input.lowerStrike;
  if (width <= 0) throw new Error("Upper strike must exceed lower strike");
  const intrinsic = input.side === "call" ? settlementPrice - input.lowerStrike : input.upperStrike - settlementPrice;
  return Math.max(0, Math.min(width, intrinsic));
}
