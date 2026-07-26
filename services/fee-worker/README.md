# BID creator-fee worker

This is a short-lived Railway cron job. Each run:

1. acquires a Postgres advisory lock;
2. creates a deterministic 15-minute claim record;
3. checks creator fees across the pump.fun bonding-curve and canonical
   PumpSwap programs;
4. builds and simulates the official creator-fee claim instructions;
5. submits and confirms the claim in live mode;
6. calculates the actual creator-wallet balance delta from the confirmed
   transaction; and
7. sends 50% to the liquidity treasury and 50% to the holder-reward treasury.

Prepared transaction signatures and blockhash validity are stored before
submission. If Railway restarts between submission and confirmation, the next
run checks chain history and safely reconciles or resubmits the same signed
transaction.

## Railway variables

Copy names from [`.env.example`](.env.example) into the Railway service:

- `DATABASE_URL`: Supabase Postgres direct or session-pooler connection string.
- `SOLANA_CLUSTER`: `devnet` first; `mainnet-beta` for pump.fun production.
- `SOLANA_RPC_URL`: a private production RPC is strongly recommended.
- `BID_TOKEN_MINT`: public BID mint address used in the audit ledger.
- `CREATOR_PUBLIC_KEY`: pump.fun creator authority. Use a wallet dedicated to
  BID because creator-vault claims are creator-wide, not mint-specific.
- `LIQUIDITY_TREASURY`: separate public wallet for the liquidity reserve.
- `HOLDER_REWARDS_TREASURY`: separate public wallet for later reward epochs.
- `CREATOR_SECRET_KEY_B64`: the creator authority's 64-byte secret key encoded
  as base64. Add it directly as a protected Railway variable; never commit or
  share it. It is ignored while `DRY_RUN=true`.
- `DRY_RUN`: defaults to `true`.

The default minimum claim is `100000` lamports so the worker does not spend
network fees on dust.

## Activation

1. Create a Supabase project and copy a session-pooler or direct Postgres
   connection string into `DATABASE_URL`.
2. Create a Railway service from the repository. Keep the repository root so
   Railway reads `/railway.toml`.
3. Add all variables with `DRY_RUN=true`.
4. Trigger one manual Railway run and verify a `claim_simulated` or
   `below_claim_threshold` event plus a row in `public.bid_fee_claims`.
5. Confirm the creator and both treasury addresses again.
6. Set `DRY_RUN=false`. Railway will execute `*/15 * * * *` in UTC.

Do not send the creator secret to Vercel. The frontend does not need it.

## Holder airdrops

Claims fund the holder-reward treasury; they do not airdrop every 15 minutes.
Future distributions should publish a snapshot slot and eligibility version,
then write the epoch and per-wallet allocations to `bid_reward_epochs` and
`bid_reward_entitlements` before transfers or Merkle claims begin.
