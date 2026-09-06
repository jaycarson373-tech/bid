# BID V2 Beta

## Product

The next BID beta should start with one shorter binary city market tied to a named Parcl Labs metric, location, baseline observation, end observation, publication window, and deterministic resolution rule.

Each outcome share trades between 0 and 1 USDG. At settlement, the winning share redeems for exactly 1 USDG and the losing share redeems for 0 USDG. The order amount is separate from the share price.

## Locked Beta Policy

- Minimum order: 5 USDG
- Maximum order: 50 USDG
- BID market fee: 0 bps until explicitly changed in a versioned policy
- Creator markets: disabled
- Market duration: shorter than the retired six-month field market and aligned with source publication timing
- Resolution: exact published metric and observation rules must be committed before deployment

## Execution

The interface must show share price, expected contracts, maximum payout, price impact, and any network cost before signing. A 50 USDG order must not be presented as equivalent to 50 winning shares; contracts received depend on the quoted share price and available depth.

The preferred path is a hybrid market:

1. Resting limit orders provide visible user and market-maker quotes.
2. The AMM supplies continuous fallback liquidity.
3. Orders use the best available execution across resting liquidity and the AMM.
4. USDG permit or authorization signatures reduce wallet transactions; a relayer may sponsor gas only after a BID order signature binds the market, outcome, amount, minimum output, nonce, and deadline.

Gasless execution must not rely on a USDG transfer signature alone because that signature does not bind the selected prediction-market outcome.

## Liquidity

No contract setting can manufacture market depth. Larger usable orders require protocol or external LP capital, matched counterparties, or both. The UI must enforce a configurable price-impact limit and offer a limit order when an immediate market order would exceed it.

LP rewards accrue only from verified eligible liquidity. Community market creation and coin launch integration remain disabled until their contracts, moderation rules, and accounting are implemented and tested.

## Release Gate

- Retired beta liquidity recovered and recorded
- Exact Parcl metric and observation schedule published
- V2 contracts tested for buy, sell, limit, cancel, close, resolve, redeem, and recovery
- 5–50 USDG order policy enforced onchain and in the interface
- Gasless authorization replay and outcome-substitution tests pass
- Oracle and emergency cancellation behavior tested
- Production simulation passes before any mainnet broadcast
