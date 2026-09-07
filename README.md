# HOOD OPTIONS

HOOD Options is a prelaunch European-style stock options protocol for Solana,
starting with the HOOD equity reference price. The MVP uses capped call and put
spreads so every contract has a known maximum cash payout and can be fully
collateralized by an LP vault.

The current product includes:

- an interactive HOOD option chain and order ticket;
- clearly labeled Black-Scholes spread model values;
- Solana Wallet Standard discovery and connection;
- LP vault capacity and payoff modeling;
- an Anchor 1.1.2 program scaffold for deposits, shares, purchases, settlement,
  redemption, and permissionless release of expired claims;
- protocol documentation at `/docs`.

The product is not live. The production Solana program, collateral mint, HOOD
equity oracle, executable quote policy, and full devnet lifecycle still need to
be bound and verified. The interface deliberately disables deposits and orders
until those gates pass.

The generated program address is
`E86s7fVfuaufjfwbKG6Nm7p8kNYStUrCFKkQH5kyubs4`. It is a public identifier only;
the program has not been deployed to Solana.

## Local app

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## Checks

```bash
npm run lint
npm test
npm run build
npm run test:solana
```

## Solana program

The Anchor workspace is under `programs/hood-options`. It targets localnet by
default and performs no deployment from the root scripts.

```bash
cd programs/hood-options
anchor build
cargo test
```

No transaction is sent by these commands. Mainnet deployment must remain a
separate, explicitly approved step after devnet lifecycle testing and audit.

## Money flow

1. LP collateral enters a program-owned SPL token vault.
2. A buyer pays premium into that vault.
3. The complete maximum payout is locked before open interest increases.
4. An approved oracle path records the expiry observation.
5. The position owner redeems a deterministic cash payout.
6. Unused collateral becomes available to LPs after liabilities are released.

Premiums increase vault net asset value and therefore LP share value. There are
no creator markets and no token-emission reward promise.

## Archived code

The previous Robinhood Chain BID prototype remains under `contracts/` and in
legacy service/config files for audit history. It is not used by the HOOD
Options interface or Solana program.
