import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, CircleAlert } from "lucide-react";
import styles from "./docs.module.css";

export const metadata: Metadata = {
  title: "Protocol Docs | HOOD OPTIONS",
  description: "Architecture, collateral, pricing, settlement, and risk documentation for HOOD Options on Solana.",
};

const sections = [
  ["overview", "Overview"],
  ["product", "Contract design"],
  ["lifecycle", "Lifecycle"],
  ["liquidity", "LP vault"],
  ["pricing", "Pricing"],
  ["oracle", "Settlement oracle"],
  ["accounts", "Solana accounts"],
  ["status", "Deployment status"],
  ["risks", "Risks"],
] as const;

function Status({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  return <span className={ready ? styles.ready : styles.pending}>{ready ? <Check size={11} /> : <CircleAlert size={11} />}{children}</span>;
}

export default function DocsPage() {
  return (
    <main className={styles.shell}>
      <header className={styles.header}><Link href="/"><ArrowLeft size={14} /> HOOD OPTIONS</Link><span>PROTOCOL DOCUMENTATION / V0.1</span></header>
      <aside className={styles.nav}><strong>CONTENTS</strong>{sections.map(([id, label]) => <a href={`#${id}`} key={id}>{label}</a>)}</aside>
      <article className={styles.content}>
        <section className={styles.intro} id="overview"><span>OVERVIEW</span><h1>European options.<br />Bounded by design.</h1><p>HOOD Options is a proposed cash-settled stock options protocol on Solana. The first supported reference asset is HOOD. The production program and oracle are not deployed yet.</p><div className={styles.statusRow}><Status ready>Frontend model</Status><Status ready={false}>Solana program</Status><Status ready={false}>Equity oracle</Status><Status ready={false}>Production vault</Status></div></section>

        <section id="product"><h2>Contract design</h2><p>The MVP uses capped call and put spreads, not uncovered options. Every contract has a lower strike, upper strike, expiry, settlement window, and maximum cash payout. Exercise is European: payout is determined once, at expiry.</p><div className={styles.formula}><span>CALL PAYOUT</span><code>min(max(Sₜ − K₁, 0), K₂ − K₁)</code><span>PUT PAYOUT</span><code>min(max(K₂ − Sₜ, 0), K₂ − K₁)</code></div><p>This cap makes the liability knowable before a trade. If the vault cannot reserve the complete maximum payout, the order must fail.</p></section>

        <section id="lifecycle"><h2>Lifecycle</h2><ol className={styles.steps}><li><strong>CREATE SERIES</strong><p>The protocol authority creates a HOOD series with fixed strikes, expiry, collateral mint, and settlement rules.</p></li><li><strong>DEPOSIT</strong><p>LP stablecoin moves into the program-owned vault and receives epoch shares.</p></li><li><strong>BUY</strong><p>The buyer pays a premium. The vault locks the full maximum payout for every purchased contract.</p></li><li><strong>SETTLE</strong><p>After expiry, the approved oracle path records one valid HOOD settlement price.</p></li><li><strong>REDEEM</strong><p>The position owner receives the deterministic payout. Unused collateral returns to available vault liquidity.</p></li><li><strong>WITHDRAW</strong><p>LP shares redeem only after the epoch&apos;s outstanding obligations are released.</p></li></ol></section>

        <section id="liquidity"><h2>LP vault</h2><p>Premiums remain inside the vault and increase share value. There is no separate emissions promise and no creator-market allocation. Protocol-owned reserves and user LP shares must be accounted for separately.</p><table><tbody><tr><th>Total assets</th><td>Collateral held by the vault, including paid premiums.</td></tr><tr><th>Locked collateral</th><td>Maximum unresolved payout across open contracts.</td></tr><tr><th>Available liquidity</th><td>Total assets minus locked collateral and pending withdrawals.</td></tr><tr><th>LP share value</th><td>Net vault assets divided by outstanding LP shares.</td></tr></tbody></table></section>

        <section id="pricing"><h2>Pricing</h2><p>The current website is an interactive model preview. It estimates capped-spread premiums from Black-Scholes vanilla legs. Those values are clearly labeled and are not executable quotes.</p><p>Production pricing still needs a deterministic onchain policy covering oracle spot, volatility input, time to expiry, utilization spread, fees, quote expiry, slippage bounds, and stale-data rejection. No offchain quote should be trusted without onchain bounds.</p></section>

        <section id="oracle"><h2>Settlement oracle</h2><p>A production HOOD equity feed has not been bound. Settlement must reject stale updates, excessive confidence intervals, timestamps outside the documented observation window, and unapproved feed accounts. A manual admin price is acceptable only for local tests, never as an undisclosed production oracle.</p><div className={styles.callout}><CircleAlert size={16} /><p><strong>Launch blocker:</strong> bind and independently verify a licensed or otherwise permitted HOOD reference-price source that can publish to Solana at the required settlement time.</p></div></section>

        <section id="accounts"><h2>Solana accounts</h2><table><tbody><tr><th>ProtocolConfig PDA</th><td>Authority, oracle authority, collateral mint, pause state, fee policy.</td></tr><tr><th>Vault PDA</th><td>Total assets, total shares, locked liability, epoch state.</td></tr><tr><th>Vault token account</th><td>Program-controlled SPL collateral custody.</td></tr><tr><th>Series PDA</th><td>HOOD strikes, type, expiry, settlement state, open interest.</td></tr><tr><th>LP Position PDA</th><td>Owner, shares, epoch, withdrawal state.</td></tr><tr><th>Option Position PDA</th><td>Owner, series, contract count, premium paid, redemption state.</td></tr></tbody></table></section>

        <section id="status"><h2>Deployment status</h2><div className={styles.checklist}><p><Status ready>Responsive option-chain interface</Status></p><p><Status ready>Solana Wallet Standard connection</Status></p><p><Status ready>Capped payout and solvency model tests</Status></p><p><Status ready={false}>Audited Solana program deployment</Status></p><p><Status ready={false}>Production collateral mint binding</Status></p><p><Status ready={false}>HOOD oracle binding</Status></p><p><Status ready={false}>End-to-end devnet lifecycle</Status></p></div><p>The interface must remain prelaunch until the pending items pass. A program ID or vault balance should never be invented or displayed as live.</p></section>

        <section id="risks"><h2>Risks</h2><p>LPs can lose collateral when option payouts exceed premiums earned. Traders can lose the complete premium. Additional risks include oracle failure, smart-contract defects, Solana congestion, stablecoin depeg, model error, limited liquidity, and legal or jurisdictional restrictions.</p><p>HOOD Options references a public stock price but does not represent ownership of Robinhood Markets shares. Nothing in this documentation is investment advice or an offer in any jurisdiction.</p></section>
      </article>
    </main>
  );
}
