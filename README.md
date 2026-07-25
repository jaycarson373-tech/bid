# BID

BID is a Solana real-estate prediction market prototype. It supports:

- binary YES/NO housing questions
- city-vs-city matchups
- five-city winner markets
- an interactive USDC order preview

The current wallet and order flow is intentionally simulated. It never requests
a signature or sends a transaction.

## Run locally

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Validate

```bash
npm test
```

The test command builds the Cloudflare-compatible vinext output and verifies the
rendered BID market board.

## Solana status

The interface is ready for a Wallet Standard and Solana devnet integration, but
there is no deployed onchain market program yet. A production integration
should simulate every transaction before asking the connected wallet to sign.
