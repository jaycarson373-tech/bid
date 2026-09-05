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
  ["costs", "Launch costs"],
  ["operations", "Operator flow"],
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
        <Link className={styles.brand} href="/" aria-label="BID markets home" prefetch={false}>
          <Image src="/brand/bid-logo.jpg" alt="" width={34} height={34} priority />
          <span>BID</span><small>Docs</small>
        </Link>
        <nav aria-label="Documentation utilities">
          <Link href="/rewards" prefetch={false}>Rewards</Link>
          <a href={siteConfig.ponsUrl} target="_blank" rel="noreferrer">Pons docs ↗</a>
          <a href={siteConfig.explorerUrl} target="_blank" rel="noreferrer">Explorer ↗</a>
          <Link className={styles.appLink} href="/#markets" prefetch={false}>Open markets</Link>
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
                {siteConfig.isTestnet
                  ? " This build targets public testnet and remains unaudited."
                  : siteConfig.isPonsVerified
                    ? " The published Pons launch record is configured for onchain verification."
                    : " The final token CA and Pons launch record are awaiting verification."}
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
            <h3>Genesis funding</h3>
            <table>
              <thead><tr><th>Depth per market</th><th>Three-market total</th><th>Use</th></tr></thead>
              <tbody>
                <tr><td>5,000 USDG</td><td>15,000 USDG</td><td>Thin beta; $500 orders materially move five-way odds</td></tr>
                <tr><td>10,000 USDG</td><td>30,000 USDG</td><td>Lean public launch</td></tr>
                <tr><td>25,000 USDG</td><td>75,000 USDG</td><td>Recommended launch target</td></tr>
              </tbody>
            </table>
            <p className={styles.note}>
              USDG uses six decimals. For 25,000 USDG per pool, set <code>BID_INITIAL_LIQUIDITY=25000000000</code>.
              The deployment wallet supplies 75,000 USDG, while every genesis BID-LP share is minted directly to the protocol liquidity vault.
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
                : siteConfig.isPonsVerified
                  ? "The verified 2.5% Pons v2 creator tax applies to $BID token trading, not to genesis prediction-market orders."
                  : "The production launch targets a 2.5% Pons v2 creator tax, subject to final onchain verification."}
              {" "}Claimed creator-tax proceeds route through the flywheel treasury with an immutable 70/20/10 allocation.
            </p>
            <div className={styles.split}>
              <div><strong>1.75%</strong><span>Trading rewards</span></div>
              <div><strong>0.50%</strong><span>Protocol-owned LP</span></div>
              <div><strong>0.25%</strong><span>Protocol reserve</span></div>
            </div>
            <p className={styles.note}>Genesis BID markets charge a 0% protocol fee. Network gas still applies.</p>
          </section>

          <section id="community">
            <span className={styles.sectionNumber}>07</span>
            <h2>Creator markets</h2>
            <p>
              Community creation is implemented but disabled by default. When governance enables it,
              a creator must hold a configured $BID balance, burn a configured amount, and seed the new
              market with {siteConfig.collateralSymbol}. The creator royalty is capped at 3%.
            </p>
          </section>

          <section id="deployment">
            <span className={styles.sectionNumber}>08</span>
            <h2>Deployment status</h2>
            <div className={styles.statusList}>
              <div><Status>TESTED</Status><span>AMM buys, sells, LP deposits and withdrawals</span></div>
              <div><Status>TESTED</Status><span>Escrowed limits, cancellation, resolution and redemption</span></div>
              <div><Status>TESTED</Status><span>Token gate, burn, creator royalties and 70/20/10 treasury split</span></div>
              <div><Status>TESTED</Status><span>Operator-managed deployment into protocol-owned market LP</span></div>
              <div><Status>TESTED</Status><span>Funded Merkle reward epochs with one-time wallet claims</span></div>
              <div><Status tone="pending">PENDING</Status><span>Independent audit and mainnet deployment</span></div>
              <div><Status tone="pending">PENDING</Status><span>Keeper deployment, oracle policy, indexer and monitoring</span></div>
            </div>

            <h3>Addresses</h3>
            <dl className={styles.addresses}>
              <div><dt>{siteConfig.collateralSymbol}</dt><dd><code>{siteConfig.collateralAddress || "AWAITING LAUNCH"}</code></dd></div>
              <div><dt>{siteConfig.isTestnet ? "Pons v2 mainnet reference" : "Pons v2 factory"}</dt><dd><code>{siteConfig.ponsFactory || "AWAITING PUBLICATION"}</code></dd></div>
              <div><dt>BID market factory</dt><dd><code>{siteConfig.marketFactoryAddress || "AWAITING PUBLICATION"}</code></dd></div>
              <div><dt>Flywheel treasury</dt><dd><code>{siteConfig.flywheelTreasuryAddress || "AWAITING PUBLICATION"}</code></dd></div>
              <div><dt>Rewards distributor</dt><dd><code>{siteConfig.rewardsVaultAddress || "AWAITING PUBLICATION"}</code></dd></div>
              <div><dt>Liquidity vault</dt><dd><code>{siteConfig.liquidityVaultAddress || "AWAITING PUBLICATION"}</code></dd></div>
              <div><dt>Reserve vault</dt><dd><code>{siteConfig.reserveVaultAddress || "AWAITING PUBLICATION"}</code></dd></div>
              <div><dt>Genesis markets</dt><dd><code>{marketsConfigured ? "Configured" : "AWAITING PUBLICATION"}</code></dd></div>
            </dl>

            <h3>Production operator map</h3>
            <table>
              <thead><tr><th>Role</th><th>Configuration</th><th>Purpose</th></tr></thead>
              <tbody>
                <tr><td>Pons creator recipient</td><td><code>BID_FLYWHEEL_TREASURY</code></td><td>Claims Pons fees and enforces 70/20/10</td></tr>
                <tr><td>Rewards owner</td><td><code>BID_REWARDS_OWNER</code></td><td>Safe that publishes reviewed, funded reward epochs</td></tr>
                <tr><td>LP operator</td><td><code>BID_LIQUIDITY_OPERATOR</code></td><td>Railway keeper that deploys the 20% allocation</td></tr>
                <tr><td>LP owner</td><td><code>BID_LIQUIDITY_VAULT_OWNER</code></td><td>Multisig that approves markets and controls withdrawals</td></tr>
                <tr><td>Deployment payer</td><td><code>BID_DEPLOYER</code></td><td>Supplies the initial USDG and pays deployment gas</td></tr>
              </tbody>
            </table>
            <p className={styles.note}>
              The Pons recipient is the treasury contract, not a personal wallet. Updating rewards or reserve wallets uses the treasury owner&apos;s
              <code> setDestinations</code> call; replacing the treasury uses <code>transferPonsCreatorFeeRecipient</code> after existing escrow balances are claimed.
            </p>
          </section>

          <section id="costs">
            <span className={styles.sectionNumber}>09</span>
            <h2>Launch costs</h2>
            <p>
              There are three separate cost buckets: the Pons token-launch fee, Robinhood Chain gas, and USDG supplied to the prediction-market pools.
              Pool funding is protocol-owned capital represented by BID-LP shares; it is not paid away as a launch fee.
            </p>
            <table>
              <thead><tr><th>Cost</th><th>Amount</th><th>Where it goes</th></tr></thead>
              <tbody>
                <tr><td>Pons launch</td><td>Read live from the factory</td><td>Pons v2 launch transaction</td></tr>
                <tr><td>Deployment + keeper gas</td><td>Variable ETH</td><td>Robinhood Chain validators</td></tr>
                <tr><td>Lean market depth</td><td>30,000 USDG</td><td>Three protocol-owned pools</td></tr>
                <tr><td>Recommended market depth</td><td>75,000 USDG</td><td>Three protocol-owned pools</td></tr>
                <tr><td>Keeper reserve</td><td>0.01 ETH minimum configured</td><td>Keeper wallet; spent only on transactions</td></tr>
              </tbody>
            </table>
            <pre><code>npm run costs:production</code></pre>
            <p className={styles.note}>
              This read-only command verifies Robinhood Chain ID 4663, checks Pons factory bytecode, reads its current launch fee and the current gas price,
              and submits no transaction. Hosting, independent audit, legal review, RPC and monitoring plans are vendor costs outside the contracts.
            </p>
          </section>

          <section id="operations">
            <span className={styles.sectionNumber}>10</span>
            <h2>Production operator flow</h2>
            <ol>
              <li>Deploy the rewards distributor, treasury and liquidity vault with multisig owners and the Railway keeper&apos;s public operator address.</li>
              <li>Run <code>LaunchBidOnPons.s.sol</code> from an encrypted keystore with a 250 bps creator tax, buyback disabled, USDG pair asset, and the treasury contract as creator recipient.</li>
              <li>Run <code>BindBidPonsCurve.s.sol</code> from the deployer; it binds the curve and hands treasury ownership to the final multisig before verification.</li>
              <li>Deploy the market factory and three genesis markets, supplying 10,000 to 25,000 USDG per market from the deployment wallet.</li>
              <li>Put the public addresses in Vercel and Railway; put the keeper signer only in Railway&apos;s secret manager.</li>
              <li>Enable one keeper replica. It fills executable limits, claims Pons fees, applies 70/20/10, and deploys eligible LP funds into approved open markets.</li>
            </ol>
            <h3>How the market maker works</h3>
            <p>
              The deployment wallet pays the initial USDG, but the factory mints every genesis LP share directly to the protocol liquidity vault.
              The keeper can allocate the vault&apos;s 20% fee share only to owner-approved, open BID markets. It waits until at least 100 USDG is available per
              eligible market, divides the available collateral evenly, and uses each market&apos;s minimum-share protection. The multisig owner controls approvals
              and withdrawals; the keeper never owns the LP shares.
            </p>
            <div className={`${styles.callout} ${styles.warning}`}>
              <strong>Rewards status</strong>
              <p>
                Treasury claiming, the exact 70/20/10 split, immutable funded reward epochs and duplicate-safe wallet claims are implemented and tested.
                Trader scoring and anti-wash eligibility remain an operating-policy blocker before the first real allocation is published.
              </p>
            </div>
          </section>

          <section id="risks">
            <span className={styles.sectionNumber}>11</span>
            <h2>Production requirements</h2>
            <ol>
              <li>Independent smart-contract audit and remediation.</li>
              <li>Final $BID token address and verified 2.5% Pons v2 tax, recipient, quote asset, and escrow configuration.</li>
              <li>Documented housing index, edge-case policy, and production resolution oracle.</li>
              <li>Multisig ownership for the factory, oracle operations, and flywheel treasury.</li>
              <li>Funded single-replica keeper, indexer, production RPC, alerting, and transaction monitoring.</li>
              <li>Approved reward-scoring and anti-wash policy for the tested 70% Merkle claim system.</li>
              <li>Sufficient {siteConfig.collateralSymbol} to seed every genesis pool and test real execution depth.</li>
              <li>Legal review for market availability, disclosures, and jurisdiction controls.</li>
            </ol>
          </section>

          <footer className={styles.footer}>
            <span>BID protocol docs · September 2026</span>
            <Link href="/#markets" prefetch={false}>Return to markets →</Link>
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
