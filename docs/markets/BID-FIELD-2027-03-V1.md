# BID five-city housing growth market rules V1

## Market

Which city posts the highest home-price growth from September 2026 to March 2027?

Outcomes, in fixed order:

1. Miami
2. Tampa
3. New York
4. Dallas
5. Phoenix

Trading closes at 2027-03-05 23:59:59 UTC. This is the trading cutoff, not the
settlement date. March 2027 observations are expected to be published later.

## Source

Use the monthly, not seasonally adjusted S&P Cotality Case-Shiller Home Price
Index observations distributed by FRED, Federal Reserve Bank of St. Louis:

- Miami: `MIXRNSA` - https://fred.stlouisfed.org/series/MIXRNSA
- Tampa: `TPXRNSA` - https://fred.stlouisfed.org/series/TPXRNSA
- New York: `NYXRNSA` - https://fred.stlouisfed.org/series/NYXRNSA
- Dallas: `DAXRNSA` - https://fred.stlouisfed.org/series/DAXRNSA
- Phoenix: `PHXRNSA` - https://fred.stlouisfed.org/series/PHXRNSA

These series represent metropolitan home-price indexes, not city-proper median
sale prices. BID does not reproduce or warrant the underlying copyrighted data.

## Calculation

For each outcome, calculate:

`growth = (March 2027 index / September 2026 index) - 1`

Use the full precision published by FRED. The winning outcome is the city with
the largest calculated growth, including when every result is negative.

Use the first FRED release in which both the September 2026 and March 2027
observations are present for all five series. Record the five source URLs,
observation values, retrieval timestamp and an archive hash before submitting
the onchain resolution. Later revisions do not change the settled result.

## Ties and unavailable data

If multiple cities have exactly equal growth at full published precision, split
the `1e18` payout scale as evenly as possible among the tied outcomes. Assign any
indivisible remainder to the first tied city in the fixed outcome order above.

If any required series remains unavailable or is permanently discontinued by
2027-09-30 23:59:59 UTC, treat the market as invalid and resolve all five
outcomes equally at `0.2e18` each.

## Oracle

The immutable oracle address configured at deployment submits the payout vector
after checking these rules. The beta uses a trusted signer; it is not an
automatic or decentralized oracle. The resolution transaction and supporting
source record must be published together.
