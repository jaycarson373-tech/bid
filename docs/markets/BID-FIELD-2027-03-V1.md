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

Use the daily Parcl Labs Price Feed API at
`/v1/price_feed/{parcl_id}/price_feed`. Resolve each `parcl_id` through
`/v1/search/markets` using `location_type=CITY` and the fixed Census place GEOID:

- Miami, Florida: `1245000`
- Tampa, Florida: `1271000`
- New York, New York: `3651000`
- Dallas, Texas: `4819000`
- Phoenix, Arizona: `0455000`

Archive the search response, resolved `parcl_id`, market metadata and Price Feed
response used for settlement. Parcl Labs is the housing-data provider; BID's
configured oracle submits the resulting payout vector on Robinhood Chain.

## Calculation

For each outcome, calculate:

`growth = (2027-03-31 price / 2026-09-30 price) - 1`

Use the full precision published by Parcl Labs. The winning outcome is the city with
the largest calculated growth, including when every result is negative.

Use the first API response retrieved on or after 2027-04-07 in which both dated
observations are present for all five markets. Record the five source requests,
observations, retrieval timestamp and an archive hash before submitting the
onchain resolution. Later revisions do not change the settled result.

## Ties and unavailable data

If multiple cities have exactly equal growth at full published precision, split
the `1e18` payout scale as evenly as possible among the tied outcomes. Assign any
indivisible remainder to the first tied city in the fixed outcome order above.

If any required Price Feed observation remains unavailable by
2027-09-30 23:59:59 UTC, treat the market as invalid and resolve all five
outcomes equally at `0.2e18` each.

## Oracle

The immutable oracle address configured at deployment submits the payout vector
after checking these rules. The beta uses a trusted signer; it is not an
automatic or decentralized oracle. The resolution transaction and supporting
source record must be published together.
