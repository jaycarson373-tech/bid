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
  const marketsConfigured = marketAddresses.some(Boolean);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="BID markets home" prefetch={false}>
          <Image src="/brand/bid-logo.jpg" alt="" width={34} height={34} priority />
          <small>Docs</small>
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
                One mainnet market is deployed and funded. Its complete contract path has been verified with a separate real-USDG lifecycle test covering funding, trading, position accounting, close, resolution, redemption and LP recovery.
                {siteConfig.isTestnet
                  ? " This build targets public testnet and remains unaudited."
                  : siteConfig.isPonsVerified
                    ? " The published Pons launch record is configured for onchain verification."
                    : " The BID token and Pons launch are separate from the live prediction market and remain unbound."}
              </p>
            </div>
          </section>

          <section id="markets">
            <span className={styles.sectionNumber}>01</span>
            <h2>Market model</h2>
            <p>
              The first public beta is one YES / NO market on Miami City&apos;s Parcl Labs home-price index.
              Trading closes September 30, 2026 at 23:59:59 UTC. Initial funding is 25 USDG,
              with a 5 USDG per-order minimum and cap. The cap is controlled by the factory owner. Other markets are coming soon.
              The final BID token address is not required to deploy this pool.
            </p>
            <p>
              Settlement is not automatic: the designated oracle submits the payout after data publication.
              The exact housing series, observation dates, tie rules and missing-data treatment must be
              published before accepting public trades. A closing date is not a guaranteed payout date.
              Fee claiming and automatic reserve spending remain disabled for the initial deployment.
            </p>
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
            <h3>Public beta funding</h3>
            <table>
              <thead><tr><th>Initial seed</th><th>Order cap</th><th>Use</th></tr></thead>
              <tbody>
                <tr><td>25 USDG</td><td>5 USDG</td><td>Live in the Miami YES / NO pool</td></tr>
              </tbody>
            </table>
            <p className={styles.note}>
              USDG uses six decimals. The retired field beta&apos;s 25 USDG was recovered in full before this replacement was deployed.
              The replacement&apos;s original 25 USDG seed is protocol-owned, with those BID-LP shares held by the liquidity vault.
              A second 25 USDG operator top-up brought live backing to 50 USDG. Public liquidity controls are disabled for the beta.
            </p>
            <h3>Depth policy</h3>
            <p>
              BID&apos;s conservative operating target keeps the maximum order at or below 5% of equal per-outcome depth. In a balanced binary pool,
              100 USDG of initial funding gives each outcome 100 USDG of depth and moves a 50% spot price to approximately 52.4% after a 5 USDG buy.
              Supporting 50 USDG orders at the same depth ratio requires approximately 1,000 USDG of initial funding.
            </p>
            <p className={styles.note}>
              The live 50 USDG-backed beta remains intentionally conservative: a 5 USDG buy moves the ending spot price to approximately 54.75%.
              Add protocol-controlled USDG liquidity before raising the order cap. The active market does not accept USDT collateral.
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
                <tr><td>Price-limited buy</td><td>Immediate fill at the maximum average price or better</td><td>No resting escrow</td></tr>
                <tr><td>Resting limit buy</td><td>Contract supported; public UI disabled</td><td>{siteConfig.collateralSymbol} escrowed until fill or cancellation</td></tr>
                <tr><td>Resting limit sell</td><td>Contract supported; public UI disabled</td><td>Maximum outcome input escrowed until fill or cancellation</td></tr>
              </tbody>
            </table>
            <div className={`${styles.callout} ${styles.warning}`}>
              <strong>Keeper required for resting orders</strong>
              <p>The public beta exposes immediate price protection only: a limit fills against the pool now or submits nothing. Resting limits remain disabled until cancellation, indexing and keeper execution are active.</p>
            </div>
          </section>

          <section id="settlement">
            <span className={styles.sectionNumber}>05</span>
            <h2>Settlement</h2>
            <p>
              Every market locks its question, outcomes, close time, and oracle address at creation.
              After close, the oracle submits a payout vector totaling 1e18. Traders redeem their outcome
              balances against that vector.
            </p>
            <h3>Miami public beta rules</h3>
            <p>
              The market uses the Parcl Labs daily Sales Price Feed for Miami City, Parcl ID 5352987.
              The baseline observation is September 6, 2026 and the final observation is September 30, 2026.
              YES wins only when the final value is strictly greater than the baseline; otherwise NO wins.
              If a date is unavailable, the latest published observation on or before that date is used. Revisions
              published through October 10, 2026 at 23:59:59 America/New_York are included. The rule document&apos;s
              SHA-256, e01624ec2668ac46b589909c8fb57c846146792b8d9906a785a593badef756b6, is embedded in the onchain question.
            </p>
          </section>

          <section id="flywheel">
            <span className={styles.sectionNumber}>06</span>
            <h2>The BID flywheel</h2>
            <p>
              BID&apos;s creator-fee layer is 1.5%. Pons may charge separate protocol or base fees, so BID does not publish an all-in fee until the production Pons contracts are verified. Only realized, claimed fees are allocated under <code>BID_FEE_POLICY_V1</code>.
            </p>
            <div className={styles.split}>
              <div><strong>45%</strong><span>LP rewards</span></div>
              <div><strong>30%</strong><span>Market liquidity</span></div>
              <div><strong>10%</strong><span>Buyback + burn</span></div>
              <div><strong>10%</strong><span>Treasury</span></div>
              <div><strong>5%</strong><span>Market creator rewards</span></div>
            </div>
            <h3>Allocation status</h3>
            <table>
              <thead><tr><th>Allocation</th><th>Status</th><th>Behavior</th></tr></thead>
              <tbody>
                <tr><td>LP rewards</td><td>RESERVE ONLY</td><td>Accrues to the funded rewards distributor. No LP payout is published until time-weighted eligibility and anti-snapshot rules are approved.</td></tr>
                <tr><td>Market liquidity</td><td>AUTOMATION READY</td><td>The keeper allocates by actual depth deficit across approved, open markets once explicitly enabled.</td></tr>
                <tr><td>Buyback + burn</td><td>RESERVE ONLY</td><td>Accrues without blind buying. No buyback or burn executes until quoting, slippage, simulation, and burn controls are deployed.</td></tr>
                <tr><td>Treasury</td><td>LIVE WITH CLAIMING</td><td>Routes directly to the configured secure treasury address in the same allocation transaction.</td></tr>
                <tr><td>Market creator rewards</td><td>RESERVE ONLY</td><td>Accrues until community markets and anti-wash reward rules are active.</td></tr>
              </tbody>
            </table>
            <p className={styles.note}>Smallest-unit rounding always accrues to treasury so the five allocations equal 100% of every fee event. Genesis BID markets charge a 0% BID market fee; Pons and network fees may still apply.</p>
            <h3>Activity points</h3>
            <p>
              <code>BID_POINTS_POLICY_V1</code> awards one beta activity point for each confirmed USDG traded and derives the public board directly from market events.
              Points are not a reward entitlement. Future LP rewards must use time-weighted eligible liquidity and anti-wash controls; raw volume alone cannot determine payouts.
            </p>
          </section>

          <section id="community">
            <span className={styles.sectionNumber}>07</span>
            <h2>Creator markets</h2>
            <p>
              Community creation is implemented but disabled by default. When governance enables it,
              a creator must hold a configured $BID balance, burn a configured amount, and seed the new
              market with {siteConfig.collateralSymbol}. The pool creator can earn a royalty from legitimate
              activity generated by that market, capped at 3%. Creator royalties are separate from the 5%
              market creator rewards reserve. Expanding market coverage does not automatically receive liquidity;
              protocol-owned liquidity is allocated separately according to active depth and real volume.
            </p>
          </section>

          <section id="deployment">
            <span className={styles.sectionNumber}>08</span>
            <h2>Deployment status</h2>
            <div className={styles.statusList}>
              <div><Status>TESTED</Status><span>AMM buys, sells, LP deposits and withdrawals</span></div>
              <div><Status>TESTED</Status><span>Escrowed limits, cancellation, resolution and redemption</span></div>
              <div><Status>TESTED</Status><span>One-time BID token binding, token gate, burn and creator royalties</span></div>
              <div><Status>TESTED</Status><span>Versioned 45/30/10/10/5 fee allocation with deterministic rounding</span></div>
              <div><Status>TESTED</Status><span>Operator-managed deployment into protocol-owned market LP</span></div>
              <div><Status>TESTED</Status><span>Funded Merkle reward epochs with one-time wallet claims</span></div>
              <div><Status>LIVE BETA</Status><span>Mainnet Miami YES / NO market with 50 USDG backing</span></div>
              <div><Status>TESTED</Status><span>Real mainnet $5 trade, close, resolution, redemption and complete USDG reconciliation</span></div>
              <div><Status>READ ONLY</Status><span>Railway service connected to Robinhood Chain; automated financial actions disabled</span></div>
              <div><Status tone="pending">PENDING</Status><span>Independent audit, event indexer and production monitoring</span></div>
            </div>

            <h3>Addresses</h3>
            <dl className={styles.addresses}>
              <div><dt>{siteConfig.collateralSymbol}</dt><dd><code>{siteConfig.collateralAddress || "UNAVAILABLE"}</code></dd></div>
              <div><dt>{siteConfig.isTestnet ? "Pons v2 mainnet reference" : "Pons v2 factory"}</dt><dd><code>{siteConfig.ponsFactory || "AWAITING PUBLICATION"}</code></dd></div>
              <div><dt>BID market factory</dt><dd><code>{siteConfig.marketFactoryAddress || "AWAITING PUBLICATION"}</code></dd></div>
              <div><dt>Flywheel treasury</dt><dd><code>{siteConfig.flywheelTreasuryAddress || "AWAITING PUBLICATION"}</code></dd></div>
              <div><dt>Rewards distributor</dt><dd><code>{siteConfig.rewardsVaultAddress || "AWAITING PUBLICATION"}</code></dd></div>
              <div><dt>Liquidity vault</dt><dd><code>{siteConfig.liquidityVaultAddress || "AWAITING PUBLICATION"}</code></dd></div>
              <div><dt>Buyback + burn reserve</dt><dd><code>{siteConfig.buybackVaultAddress || "AWAITING PUBLICATION"}</code></dd></div>
              <div><dt>Protocol treasury</dt><dd><code>{siteConfig.protocolTreasuryAddress || "AWAITING PUBLICATION"}</code></dd></div>
              <div><dt>Creator rewards reserve</dt><dd><code>{siteConfig.creatorRewardsVaultAddress || "AWAITING PUBLICATION"}</code></dd></div>
              <div><dt>Genesis markets</dt><dd><code>{marketsConfigured ? "Configured" : "AWAITING PUBLICATION"}</code></dd></div>
            </dl>

            <h3>Production operator map</h3>
            <table>
              <thead><tr><th>Role</th><th>Configuration</th><th>Purpose</th></tr></thead>
              <tbody>
                <tr><td>Pons creator recipient</td><td><code>BID_FLYWHEEL_TREASURY</code></td><td>Contract that atomically claims and enforces 45/30/10/10/5</td></tr>
                <tr><td>LP rewards owner</td><td><code>BID_REWARDS_OWNER</code></td><td>Safe that may publish reviewed, funded LP reward epochs</td></tr>
                <tr><td>LP operator</td><td><code>BID_LIQUIDITY_OPERATOR</code></td><td>Railway keeper that deploys the 30% allocation</td></tr>
                <tr><td>LP owner</td><td><code>BID_LIQUIDITY_VAULT_OWNER</code></td><td>Multisig that approves markets and controls withdrawals</td></tr>
                <tr><td>Deployment payer</td><td><code>BID_DEPLOYER</code></td><td>Supplies the initial USDG and pays deployment gas</td></tr>
              </tbody>
            </table>
            <p className={styles.note}>
              The Pons recipient is the treasury contract, not a personal wallet and has no private key. Updating reserve destinations uses the treasury owner&apos;s
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
                <tr><td>Capped beta seed</td><td>25 USDG</td><td>One protocol-owned pool</td></tr>
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
              <li>Keep the deployed Miami YES / NO genesis market funded with 25 USDG and a 5 USDG order cap. The factory owner can update that cap; community creation stays locked.</li>
              <li>Run <code>LaunchBidOnPons.s.sol</code> from an encrypted local Foundry keystore with a 150 bps creator fee, buyback disabled, USDG pair asset, and the treasury contract as creator recipient.</li>
              <li>Run <code>BindBidPonsCurve.s.sol</code> from the deployer; it verifies the launch, binds the final token and curve once, and hands factory and treasury ownership to their final multisigs.</li>
              <li>Put the public addresses in Vercel and Railway; put the keeper signer only in Railway&apos;s secret manager.</li>
              <li>Enable one keeper replica. It fills executable limits, atomically claims and allocates Pons fees, and deploys eligible liquidity funds into approved open markets.</li>
            </ol>
            <h3>How the market maker works</h3>
            <p>
              The deployment wallet pays the initial USDG, but the factory mints every genesis LP share directly to the protocol liquidity vault.
              The keeper can allocate the vault&apos;s 30% fee share only to owner-approved, open BID markets. It prioritizes markets below <code>LP_TARGET_DEPTH</code>
              by real outcome-pool depth deficit, leaves sub-minimum amounts reserved, and uses each market&apos;s minimum-share protection. The multisig owner controls approvals
              and withdrawals; the keeper never owns the LP shares.
            </p>
            <div className={`${styles.callout} ${styles.warning}`}>
              <strong>LP rewards status</strong>
              <p>
                Treasury claiming, exact allocation, immutable funded reward epochs and duplicate-safe wallet claims are implemented and tested. The 45% share remains a reserve until time-weighted LP scoring and anti-snapshot eligibility are implemented and approved.
              </p>
            </div>
          </section>

          <section id="risks">
            <span className={styles.sectionNumber}>11</span>
            <h2>Production requirements</h2>
            <ol>
              <li>Independent smart-contract audit and remediation.</li>
              <li>Final $BID token address and verified 1.5% Pons v2 creator fee, recipient, quote asset, and escrow configuration.</li>
              <li>Documented housing index, edge-case policy, and production resolution oracle.</li>
              <li>Multisig ownership for the factory, oracle operations, and flywheel treasury.</li>
              <li>Funded single-replica keeper, indexer, production RPC, alerting, and transaction monitoring.</li>
              <li>Time-weighted LP reward scoring and anti-snapshot/anti-wash policy before the first 45% LP reward epoch.</li>
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
            <span><i /> One-market beta live</span>
          </div>
        </aside>
      </div>
    </main>
  );
}
