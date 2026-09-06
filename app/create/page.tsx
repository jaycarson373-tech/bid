import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Create a Market | BID",
  description: "Preview BID's future token-gated housing market creation workflow.",
};

const fields = [
  ["QUESTION", "Which city will lead home-price growth?"],
  ["MARKET TYPE", "Head to head"],
  ["LOCATION", "Select locations"],
  ["RESOLUTION SOURCE", "Published housing data"],
  ["RESOLUTION DATE", "Select date"],
  ["INITIAL LIQUIDITY", "USDG amount"],
] as const;

export default function CreateMarketPage() {
  return (
    <main className="create-page">
      <header className="topbar create-topbar">
        <Link className="brand" href="/" aria-label="BID home">
          <span className="brand-mark brand-mark-image" aria-hidden="true">
            <Image src="/brand/bid-logo.jpg" alt="" width={36} height={36} priority />
          </span>
        </Link>
        <nav className="desktop-nav" aria-label="Primary navigation">
          <Link href="/#markets">Markets</Link>
          <Link href="/rewards">Rewards</Link>
          <Link className="active" href="/create">Create</Link>
          <Link href="/docs">Docs</Link>
        </nav>
        <Link className="secondary-cta create-back" href="/">Back to markets <span>←</span></Link>
      </header>

      <section className="create-intro">
        <span className="section-kicker">COMING SOON / TOKEN-GATED</span>
        <h1>Create a market.</h1>
        <p>BID will open housing-market creation to holders after the creation contracts, activity rules, and creator reward controls are deployed and verified.</p>
      </section>

      <section className="create-workspace" aria-label="Future market creation preview">
        <div className="create-fields">
          {fields.map(([label, placeholder]) => (
            <label key={label}>
              <span>{label}</span>
              <input value={placeholder} disabled readOnly />
            </label>
          ))}
        </div>
        <aside className="create-preview">
          <span>MARKET PREVIEW</span>
          <strong>Question and outcome preview</strong>
          <dl>
            <div><dt>STATUS</dt><dd>COMING SOON</dd></div>
            <div><dt>COLLATERAL</dt><dd>USDG</dd></div>
            <div><dt>CREATION GATE</dt><dd>NOT ACTIVE</dd></div>
            <div><dt>CREATOR REWARDS</dt><dd>RESERVE ONLY</dd></div>
          </dl>
          <button type="button" disabled>CREATION NOT YET ACTIVE</button>
        </aside>
      </section>
    </main>
  );
}
