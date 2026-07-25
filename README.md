# BID

BID is a Solana real-estate prediction-market launch site with three curated
genesis markets and an operational pump.fun creator-fee worker.

## What is live-ready

- Vercel-ready Next.js frontend
- three funded-market concepts: YES/NO, head-to-head, and five-city field
- professional Solana-coded BID brand assets and social card
- Railway cron worker scheduled every 15 minutes
- official pump.fun SDK creator-vault claim flow
- simulation before every submitted transaction
- Supabase/Postgres claim ledger, restart reconciliation, and advisory lock
- physical 50/50 routing to separate liquidity and holder-reward treasuries
- reward-epoch and holder-entitlement schema for later snapshot distributions

The market order ticket is still intentionally a preview. It does not send a
trade because BID does not yet have a deployed prediction-market program.
Creator-fee collection is a separate backend and becomes live when its required
Railway variables are configured.

## Frontend

Requires Node.js `>=22.13.0`.

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Deploy to Vercel

[Import the GitHub repository into Vercel](https://vercel.com/new/clone?repository-url=https://github.com/jaycarson373-tech/bid).
The root `vercel.json` runs the standard Next.js production build.

Set `NEXT_PUBLIC_SITE_URL` only when attaching a custom domain. Vercel detects
its generated production URL automatically.

## Creator-fee worker

The backend lives in [`services/fee-worker`](services/fee-worker). Railway uses
the root [`railway.toml`](railway.toml) to:

1. build the isolated worker package;
2. apply its Postgres migration;
3. run one claim attempt every 15 minutes; and
4. exit after each execution.

Start with `DRY_RUN=true`. The worker can simulate without a private key.
Live mode requires the pump.fun creator authority, configured directly as a
protected Railway variable. Never commit it or paste it into chat.

See [`services/fee-worker/README.md`](services/fee-worker/README.md) for the
complete environment and activation checklist.

## Validate

```bash
npm test
npm run test:vercel
npm --prefix services/fee-worker test
```
