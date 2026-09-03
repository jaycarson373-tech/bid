import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { siteConfig } from "@/lib/site";
import styles from "./docs.module.css";

export const metadata: Metadata = {
  title: "BID Protocol Docs",
  description: "Technical documentation for BID housing prediction markets on Robinhood Chain.",
};

const navigation = [
  ["overview", "Overview"],
  ["markets", "Market model"],
  ["pricing", "AMM pricing"],
  ["liquidity", "Liquidity"],
  ["orders", "Orders"],
  ["settlement", "Settlement"],
  ["flywheel", "BID flywheel"],
  ["community", "Creator markets"],
  ["deployment", "Deployment"],
  ["risks", "Risks"],
] as const;

function Status({ children, tone = "ready" }: { children: ReactNode; tone?: "ready" | "pending" }) {
  return <span className={`${styles.status} ${styles[tone]}`}>{children}</span>;
}

export default function DocsPage() {
  const marketAddresses = Object.values(siteConfig.marketAddresses);
  const marketsConfigured = marketAddresses.length > 0 && marketAddresses.every(Boolean);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="BID markets home">
          <Image src="/brand/bid-logo.jpg" alt="" width={34} height={34} priority />
          <span>BID</span><small>Docs</small>
        </Link>
        <nav aria-label="Documentation utilities">
          <a href={siteConfig.ponsUrl} target="_blank" rel="noreferrer">Pons v2 ↗</a>
          <a href={siteConfig.explorerUrl} target="_blank" rel="noreferrer">Explorer ↗</a>
          <Link className={styles.appLink} href="/#markets">Open markets</Link>
        </nav>
      </header>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarTitle}>Protocol</div>
          <nav aria-label="Documentation sections">
            {navigation.map(([id, label], index) => (
              <a className={index === 0 ? styles.current : ""} href={`#${id}`} key={id}>{label}</a>
            ))}
          </nav>
          <div className={styles.sidebarMeta}>
            <span>Network</span>
            <strong><i /> {siteConfig.networkName}</strong>
            <small>Chain ID {siteConfig.robinhoodChainId}</small>
          </div>
        </aside>

        <article className={styles.article}>
          <div className={styles.breadcrumbs}>BID / PROTOCOL / OVERVIEW</div>
          <section className={styles.intro} id="overview">
            <span className={styles.eyebrow}>Protocol documentation</span>
            <h1>Housing markets,<br />priced onchain.</h1>
            <p>
              BID is a {siteConfig.collateralSymbol}-collateralized prediction-market protocol for finite real-estate outcomes.
              It runs on Robinhood Chain and uses a fixed-product pool so every market can quote a price
              before a natural counterparty arrives.
            </p>
            <div className={styles.callout}>
              <strong>Current status</strong>
              <p>
                The contracts and interface are functional prototypes with automated tests.
                {siteConfig.isTestnet ? " This build targets public testnet and remains unaudited." : " They are not audited or deployed to mainnet yet."}
              </p>
            </div>
          </section>

          <section id="markets">
            <span className={styles.sectionNumber}>01</span>
            <h2>Market model</h2>
            <p>
              Each market has between two and eight mutually exclusive outcomes. Depositing one unit of
              {siteConfig.collateralSymbol} creates one complete set: one unit of every outcome. After resolution, a complete set
              is always worth one unit of collateral because the payout vector must sum to 1.
            </p>
            <div className={styles.featureGrid}>
              <div><strong>YES / NO</strong><p>Binary questions with one winning side.</p></div>
              <div><strong>HEAD TO HEAD</strong><p>Two locations compete under one metric.</p></div>
              <div><strong>FINITE FIELD</strong><p>One winner across three to eight locations.</p></div>
            </div>
          </section>

          <section id="pricing">
            <span className={styles.sectionNumber}>02</span>
            <h2>Fixed-product pricing</h2>
            <p>
              BID holds outcome inventory in a pool and preserves the product of those balances through
              every trade. The displayed spot price is the normalized inverse balance for each outcome.
              Buying an outcome lowers that outcome&apos;s pool balance and raises its implied probability.
            </p>
            <pre><code>{`k = b₁ × b₂ × … × bₙ
pᵢ = (1 / bᵢ) ÷ Σ(1 / bⱼ)
Σpᵢ = 1`}</code></pre>
            <p className={styles.note}>Quotes and execution use integer math. UI prices are rounded to basis points; the transaction applies a 0.5% minimum-output guard.</p>
          </section>

          <section id="liquidity">
            <span className={styles.sectionNumber}>03</span>
            <h2>Liquidity</h2>
            <p>
              LPs supply {siteConfig.collateralSymbol} and receive BID-LP shares proportional to the pool. When the pool is
              imbalanced, the deposit also returns excess outcome inventory so existing odds do not move.
              Deposits include a minimum-share check.
            </p>
            <div className={styles.flow}>
              <span>{siteConfig.collateralSymbol}</span><b>→</b><span>Complete sets</span><b>→</b><span>Outcome pool</span><b>→</b><span>BID-LP</span>
            </div>
            <p>
              The standard withdrawal path burns BID-LP, merges the balanced portion of withdrawn
              inventory directly back into {siteConfig.collateralSymbol}, and leaves only the imbalance as redeemable outcome
              positions. A minimum-collateral check protects the transaction from pool movement.
            </p>
          </section>

          <section id="orders">
            <span className={styles.sectionNumber}>04</span>
            <h2>Orders</h2>
            <table>
              <thead><tr><th>Order</th><th>Execution</th><th>Custody</th></tr></thead>
              <tbody>
                <tr><td>Market buy</td><td>Immediate against pool</td><td>{siteConfig.collateralSymbol} moves only on execution</td></tr>
                <tr><td>Market sell</td><td>Immediate against pool</td><td>Outcome balance burns on execution</td></tr>
                <tr><td>Limit buy</td><td>Immediate or keeper-fillable</td><td>{siteConfig.collateralSymbol} escrowed; owner can cancel</td></tr>
                <tr><td>Limit sell</td><td>Immediate or keeper-fillable</td><td>Maximum outcome input escrowed</td></tr>
              </tbody>
            </table>
            <div className={`${styles.callout} ${styles.warning}`}>
              <strong>Keeper required</strong>
              <p>Resting limits are permissionlessly fillable, but production needs an indexer and keeper to detect executable orders and submit fills.</p>
            </div>
          </section>

          <section id="settlement">
            <span className={styles.sectionNumber}>05</span>
            <h2>Settlement</h2>
            <p>
              Every market locks its question, outcomes, close time, and oracle address at creation.
              After close, the oracle submits a payout vector totaling 1e18. Traders redeem their outcome
              balances against that vector. The production oracle and exact housing-data methodology are not finalized.
            </p>
          </section>

          <section id="flywheel">
            <span className={styles.sectionNumber}>06</span>
            <h2>The BID flywheel</h2>
            <p>
              {siteConfig.isTestnet
                ? "Testnet uses tBID to exercise the same 2.5% flywheel economics without representing a live Pons token."
                : "The 2.5% Pons v2 creator tax applies to $BID token trading, not to genesis prediction-market orders."}
              {" "}Claimed creator-tax proceeds route through the flywheel treasury and split evenly.
            </p>
            <div className={styles.split}>
              <div><strong>1.25%</strong><span>Trading rewards</span></div>
              <div><strong>1.25%</strong><span>Protocol-owned LP</span></div>
            </div>
            <p className={styles.note}>Genesis BID markets charge a 0% protocol fee. Network gas still applies.</p>
          </section>

          <section id="community">
            <span className={styles.sectionNumber}>07</span>
            <h2>Creator markets</h2>
            <p>
              Community creation is implemented but disabled by default. When governance enables it,
              a creator must hold a configured $BID balance, burn a configured amount, and seed the new
              market with USDG. The creator royalty is capped at 3%.
            </p>
          </section>

          <section id="deployment">
            <span className={styles.sectionNumber}>08</span>
            <h2>Deployment status</h2>
            <div className={styles.statusList}>
              <div><Status>TESTED</Status><span>AMM buys, sells, LP deposits and withdrawals</span></div>
              <div><Status>TESTED</Status><span>Escrowed limits, cancellation, resolution and redemption</span></div>
              <div><Status>TESTED</Status><span>Token gate, burn, creator royalties and treasury split</span></div>
              <div><Status tone="pending">PENDING</Status><span>Independent audit and mainnet deployment</span></div>
              <div><Status tone="pending">PENDING</Status><span>Oracle, keeper, indexer and monitoring</span></div>
            </div>

            <h3>Addresses</h3>
            <dl className={styles.addresses}>
              <div><dt>{siteConfig.collateralSymbol}</dt><dd><code>{siteConfig.collateralAddress || "Not deployed"}</code></dd></div>
              <div><dt>{siteConfig.isTestnet ? "Pons v2 mainnet reference" : "Pons v2 factory"}</dt><dd><code>{siteConfig.ponsFactory}</code></dd></div>
              <div><dt>BID market factory</dt><dd><code>{siteConfig.marketFactoryAddress || "Not deployed"}</code></dd></div>
              <div><dt>Flywheel treasury</dt><dd><code>{siteConfig.flywheelTreasuryAddress || "Not deployed"}</code></dd></div>
              <div><dt>Genesis markets</dt><dd><code>{marketsConfigured ? "Configured" : "Not deployed"}</code></dd></div>
            </dl>
          </section>

          <section id="risks">
            <span className={styles.sectionNumber}>09</span>
            <h2>Production requirements</h2>
            <ol>
              <li>Independent smart-contract audit and remediation.</li>
              <li>Final $BID token address and verified 2.5% Pons v2 tax configuration.</li>
              <li>Documented housing index, edge-case policy, and production resolution oracle.</li>
              <li>Multisig ownership for the factory, oracle operations, and flywheel treasury.</li>
              <li>Funded keeper, indexer, production RPC, alerting, and transaction monitoring.</li>
              <li>Sufficient {siteConfig.collateralSymbol} to seed every genesis pool and test real execution depth.</li>
              <li>Legal review for market availability, disclosures, and jurisdiction controls.</li>
            </ol>
          </section>

          <footer className={styles.footer}>
            <span>BID protocol docs · September 2026</span>
            <Link href="/#markets">Return to markets →</Link>
          </footer>
        </article>

        <aside className={styles.toc}>
          <span>On this page</span>
          {navigation.slice(1).map(([id, label]) => <a href={`#${id}`} key={id}>{label}</a>)}
          <div>
            <strong>Build status</strong>
            <span><i /> Contracts tested</span>
            <span className={styles.pendingText}><i /> Mainnet pending</span>
          </div>
        </aside>
      </div>
    </main>
  );
}
