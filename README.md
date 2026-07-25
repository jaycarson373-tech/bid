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

## Deploy to Vercel

[Import the GitHub repository into Vercel](https://vercel.com/new/clone?repository-url=https://github.com/jaycarson373-tech/bid).
The repository includes a standard Next.js build, a clean lockfile, and
`vercel.json` configuration.

Set `NEXT_PUBLIC_SITE_URL` to the production URL if you attach a custom domain.
Vercel's production URL is detected automatically otherwise.

## Validate

```bash
npm test
npm run test:vercel
```

The first command verifies the rendered BID market board through the
Cloudflare-compatible build. The second runs the same Next.js production build
used by Vercel.

## Solana status

The interface is ready for a Wallet Standard and Solana devnet integration, but
there is no deployed onchain market program yet. A production integration
should simulate every transaction before asking the connected wallet to sign.
