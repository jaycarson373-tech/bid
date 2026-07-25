"use client";

import { useMemo, useState } from "react";
import Image from "next/image";

type Tone = "coral" | "mint" | "violet" | "gold";

type Outcome = {
  label: string;
  code: string;
  price: number;
  tone: Tone;
};

type Market = {
  id: string;
  code: string;
  mode: "yes-no" | "head-to-head" | "field";
  question: string;
  short: string;
  outcomes: Outcome[];
  volume: string;
  liquidity: string;
  closes: string;
  signal: string;
  chart: number[];
};

const markets: Market[] = [
  {
    id: "miami-austin-eoy",
    code: "MIA / AUS",
    mode: "head-to-head",
    question: "Which city will deliver the higher home-price return from launch through year-end?",
    short: "Miami vs. Austin — EOY return",
    outcomes: [
      { label: "Miami", code: "MIA", price: 0.54, tone: "coral" },
      { label: "Austin", code: "AUS", price: 0.46, tone: "mint" },
    ],
    volume: "$0",
    liquidity: "$50",
    closes: "Dec 31, 2026",
    signal: "Parcl daily price feed",
    chart: [42, 44, 43, 45, 46, 44, 47, 46, 48, 49, 47, 50, 51, 50, 52, 51, 53, 52, 54, 53, 54, 55, 54, 54],
  },
  {
    id: "city-field-eoy",
    code: "CITY / EOY",
    mode: "field",
    question: "Which city will deliver the highest home-price return from launch through EOY?",
    short: "Five-city EOY return",
    outcomes: [
      { label: "Miami", code: "MIA", price: 0.25, tone: "coral" },
      { label: "New York", code: "NYC", price: 0.23, tone: "mint" },
      { label: "Los Angeles", code: "LAX", price: 0.21, tone: "violet" },
      { label: "Austin", code: "AUS", price: 0.17, tone: "gold" },
      { label: "Phoenix", code: "PHX", price: 0.14, tone: "coral" },
    ],
    volume: "$0",
    liquidity: "$50",
    closes: "Dec 31, 2026",
    signal: "5-city relative return",
    chart: [35, 36, 38, 37, 39, 41, 40, 42, 43, 41, 44, 45, 44, 46, 48, 47, 49, 50, 49, 51, 53, 52, 54, 55],
  },
  {
    id: "austin-positive",
    code: "AUS / EOY",
    mode: "yes-no",
    question: "Will Austin’s home-price feed finish 2026 above its launch snapshot?",
    short: "Austin positive from launch to EOY",
    outcomes: [
      { label: "Yes", code: "YES", price: 0.47, tone: "mint" },
      { label: "No", code: "NO", price: 0.53, tone: "coral" },
    ],
    volume: "$0",
    liquidity: "$50",
    closes: "Dec 31, 2026",
    signal: "Launch snapshot vs. Dec 31",
    chart: [55, 53, 54, 52, 51, 50, 52, 49, 48, 50, 49, 47, 48, 46, 45, 47, 46, 48, 47, 46, 48, 47, 46, 47],
  },
];

function BrandMark() {
  return (
    <span className="brand-mark brand-mark-image" aria-hidden="true">
      <Image src="/brand/bid-logo.png" alt="" width={36} height={36} priority />
    </span>
  );
}

function CityStamp({ code, tone }: { code: string; tone: Tone }) {
  return (
    <div className={`city-stamp ${tone}`} aria-hidden="true">
      <span className="city-code">{code}</span>
      <div className="skyline"><i /><i /><i /><i /><i /></div>
      <span className="grid-line grid-line-one" />
      <span className="grid-line grid-line-two" />
    </div>
  );
}

function MarketVisual({ market, compact = false }: { market: Market; compact?: boolean }) {
  if (market.mode === "yes-no") {
    return (
      <div className={`binary-visual ${compact ? "compact" : ""}`} aria-hidden="true">
        <span>YES</span><span>NO</span>
      </div>
    );
  }

  if (market.mode === "field") {
    return (
      <div className={`field-visual ${compact ? "compact" : ""}`} aria-hidden="true">
        {market.outcomes.map((outcome) => (
          <span className={outcome.tone} key={outcome.code}>
            <strong>{outcome.code}</strong>
            <small>{Math.round(outcome.price * 100)}¢</small>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className={`versus-visual ${compact ? "compact" : ""}`} aria-hidden="true">
      <CityStamp code={market.outcomes[0].code} tone={market.outcomes[0].tone} />
      <span className="versus-badge">VS</span>
      <CityStamp code={market.outcomes[1].code} tone={market.outcomes[1].tone} />
    </div>
  );
}

export default function Home() {
  const [selectedId, setSelectedId] = useState(markets[0].id);
  const [selectedOutcome, setSelectedOutcome] = useState(0);
  const [amount, setAmount] = useState("10");
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const [notice, setNotice] = useState("");

  const selected = markets.find((market) => market.id === selectedId) ?? markets[0];
  const outcome = selected.outcomes[selectedOutcome] ?? selected.outcomes[0];

  const quote = useMemo(() => {
    const dollars = Math.max(0, Number(amount) || 0);
    const contracts = outcome.price > 0 ? dollars / outcome.price : 0;
    return {
      price: outcome.price,
      contracts,
      profit: Math.max(0, contracts - dollars),
    };
  }, [amount, outcome]);

  const chooseMarket = (market: Market) => {
    setSelectedId(market.id);
    setSelectedOutcome(0);
  };

  const connectWallet = () => {
    setWalletConnected(true);
    setWalletOpen(false);
    setNotice("Demo wallet connected. No blockchain permissions were requested.");
  };

  const reviewOrder = () => {
    if (!walletConnected) {
      setWalletOpen(true);
      return;
    }
    setNotice(`Preview ready: ${outcome.label} for $${(Number(amount) || 0).toLocaleString()}. No transaction was sent.`);
  };

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="BID home">
          <BrandMark /><span>BID</span><small>beta</small>
        </a>
        <nav className="desktop-nav" aria-label="Primary navigation">
          <a className="active" href="#markets">Markets</a>
          <a href="#fees">Fee policy</a>
          <a href="#roadmap">Roadmap</a>
        </nav>
        <div className="header-actions">
          <span className="network-pill"><i /> Solana</span>
          <button
            className={`wallet-button ${walletConnected ? "connected" : ""}`}
            type="button"
            onClick={() => walletConnected ? setNotice("Demo wallet is ready.") : setWalletOpen(true)}
          >
            {walletConnected ? "7xP…3mQ" : "Connect wallet"}
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span>GENESIS</span> RESOLUTION DATA BY PARCL LABS</div>
          <h1>BET THE<br /><em>BLOCK.</em></h1>
          <p>
            Three carefully defined housing markets. BID is allocating $50 USDC
            to seed each market, with resolution designed around Parcl housing data.
          </p>
          <div className="hero-actions">
            <a className="primary-cta" href="#markets">Explore markets <span>↘</span></a>
            <a className="text-link" href="#how-it-works">See how it settles <span>→</span></a>
          </div>
        </div>

        <div className="hero-market">
          <div className="hero-market-head">
            <span>FEATURED // BID FUNDED // MIA-AUS</span>
            <span className="pulse-label"><i /> launch preview</span>
          </div>
          <div className="hero-market-body">
            <div className="hero-question">
              <span className="market-number">01</span>
              <h2>Which city delivers the higher home-price return by EOY? <strong>Miami or Austin?</strong></h2>
            </div>
            <div className="odds-lockup">
              <span className="odds-label">Opening indication</span>
              <strong>54<span>%</span></strong>
              <small>Miami 54% · Austin 46%</small>
            </div>
          </div>
          <div className="mini-chart" aria-label="Illustrative Miami probability trend at 54 percent">
            {markets[0].chart.map((height, index) => (
              <i key={index} style={{ height: `${height}%` }} />
            ))}
          </div>
          <div className="chart-scale">
            <span>JUL 01</span><span>JUL 08</span><span>JUL 15</span><span>NOW</span>
          </div>
          <div className="hero-market-foot">
            <span>VOLUME <strong>$0</strong></span>
            <span>BID SEED <strong>$50 USDC</strong></span>
            <span>RESOLVES <strong>DEC 31</strong></span>
          </div>
        </div>
      </section>

      <section className="ticker" aria-label="Platform statistics">
        <div><span>LAUNCH MARKETS</span><strong>03</strong><em>curated by BID</em></div>
        <div><span>INITIAL SEED</span><strong>$150</strong><em>$50 per market</em></div>
        <div><span>CLAIM CADENCE</span><strong>15m</strong><em>pump.fun creator fees</em></div>
        <div><span>FEE ROUTING</span><strong>50/50</strong><em>liquidity / rewards</em></div>
      </section>

      <section className="market-section" id="markets">
        <div className="section-heading">
          <div>
            <span className="section-kicker">THE GENESIS BOARD</span>
            <h2>Only what we fund.</h2>
          </div>
          <p>Three narrowly defined markets. Each receives a $50 USDC launch allocation and a published resolution rule.</p>
        </div>

        <div className="launch-manifest" aria-label="Launch market policy">
          <span><strong>03</strong> curated markets</span>
          <span><strong>$50</strong> BID seed per market</span>
          <span><strong>Parcl</strong> resolution data</span>
          <span><strong>Solana</strong> settlement target</span>
        </div>

        <div className="trading-layout">
          <div className="market-list">
            {markets.map((market, index) => (
              <button
                className={`market-card ${selectedId === market.id ? "selected" : ""}`}
                key={market.id}
                type="button"
                onClick={() => chooseMarket(market)}
                aria-pressed={selectedId === market.id}
              >
                <span className="card-index">{String(index + 1).padStart(2, "0")}</span>
                <MarketVisual market={market} />
                <span className="market-copy">
                  <span className="market-meta">
                    <span>{market.mode.replaceAll("-", " ")}</span>
                    <em>{market.signal}</em>
                  </span>
                  <strong>{market.short}</strong>
                  <small>Resolves {market.closes} · BID seed {market.liquidity} USDC · Vol {market.volume}</small>
                </span>
                <span className={`market-odds ${market.mode === "field" ? "field-odds" : ""}`}>
                  {market.outcomes.slice(0, market.mode === "field" ? 3 : 2).map((item) => (
                    <span className="outcome-quote" key={item.code}>
                      <em>{item.code}</em><strong>{Math.round(item.price * 100)}¢</strong>
                    </span>
                  ))}
                  {market.mode === "field" && <small>+2 more cities</small>}
                </span>
                <span className="select-arrow">↗</span>
              </button>
            ))}
          </div>

          <aside className="trade-ticket" aria-label={`Trade ${selected.short}`}>
            <div className="ticket-top">
              <span>ORDER TICKET</span>
              <span className="ticket-code">{selected.code} / USDC</span>
            </div>
            <div className={`selected-market ${selected.mode === "field" ? "field" : ""}`}>
              <MarketVisual market={selected} compact />
              <div>
                <span>{selected.mode.replaceAll("-", " ")} · resolves {selected.closes}</span>
                <h3>{selected.question}</h3>
              </div>
            </div>

            <div className={`outcome-picker ${selected.mode === "field" ? "field-picker" : ""}`}>
              {selected.outcomes.map((item, index) => (
                <button
                  className={`${item.tone} ${selectedOutcome === index ? "active" : ""}`}
                  key={item.code}
                  type="button"
                  onClick={() => setSelectedOutcome(index)}
                >
                  <span>{selected.mode === "yes-no" ? `Buy ${item.label}` : item.label}</span>
                  <strong>{Math.round(item.price * 100)}¢</strong>
                  {selected.mode === "field" && <small>{item.code}</small>}
                </button>
              ))}
            </div>

            <label className="amount-label" htmlFor="trade-amount">
              <span>Amount</span><small>Balance shown after connection</small>
            </label>
            <div className="amount-input">
              <span>$</span>
              <input
                id="trade-amount"
                inputMode="decimal"
                min="0"
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
                aria-label="Trade amount in USDC"
              />
              <em>USDC</em>
            </div>
            <div className="quick-amounts">
              {[1, 5, 10, 25].map((value) => (
                <button key={value} type="button" onClick={() => setAmount(String(value))}>${value}</button>
              ))}
            </div>

            <div className="quote-lines">
              <p><span>{outcome.label} price</span><strong>{Math.round(quote.price * 100)}¢</strong></p>
              <p><span>Est. contracts</span><strong>{quote.contracts.toFixed(2)}</strong></p>
              <p><span>Est. network fee</span><strong>&lt; $0.01</strong></p>
            </div>

            <div className="return-box">
              <span>YOU RECEIVE IF {outcome.label.toUpperCase()} WINS</span>
              <strong>${quote.contracts.toFixed(2)}</strong>
              <small>+${quote.profit.toFixed(2)} potential profit</small>
            </div>

            <button className="review-button" type="button" onClick={reviewOrder}>
              {walletConnected ? `Review ${outcome.label} order` : "Connect to preview"}
              <span>→</span>
            </button>
            <p className="ticket-note">Launch preview only. Orders are simulated and never sent onchain.</p>
          </aside>
        </div>
      </section>

      <section className="fee-section" id="fees">
        <div className="fee-intro">
          <div>
            <span className="section-kicker">PUMP.FUN CREATOR FEES</span>
            <h2>Fees go back<br />to the market.</h2>
          </div>
          <p>BID’s claim worker checks the creator vault every 15 minutes. Successful claims are recorded before funds move into two dedicated reserves.</p>
        </div>
        <div className="claim-flow" aria-label="Creator fee routing">
          <span><small>01</small>pump.fun trades</span>
          <i>→</i>
          <span><small>02</small>creator vault</span>
          <i>→</i>
          <span><small>03</small>15-minute claim</span>
          <i>→</i>
          <span><small>04A</small>liquidity reserve</span>
          <span><small>04B</small>holder reserve</span>
        </div>
        <div className="fee-grid">
          <article className="fee-card liquidity-card">
            <span>50%</span>
            <div>
              <small>LIQUIDITY RESERVE</small>
              <h3>Thinner spreads.<br />Better execution.</h3>
              <p>Half of every successful creator-fee claim is routed to a dedicated reserve for transparent BID liquidity support.</p>
            </div>
          </article>
          <article className="fee-card rewards-card">
            <span>50%</span>
            <div>
              <small>HOLDER REWARD RESERVE</small>
              <h3>Participation<br />should compound.</h3>
              <p>Half is reserved for later reward epochs using published holder snapshots, eligibility rules, and onchain receipts.</p>
            </div>
          </article>
        </div>
        <div className="holder-policy">
          <span>PLANNED HOLDER POLICY</span>
          <strong>100% of platform revenue, airdropped to holders.</strong>
          <p>Creator fees follow the launch split above. Separately, our long-term target is to return BID platform revenue to eligible holders through published onchain distributions. Holder rewards are not paid every 15 minutes and remain subject to final eligibility, governance, and legal review.</p>
        </div>
      </section>

      <section className="how-section" id="how-it-works">
        <div className="how-intro">
          <span className="section-kicker">PARCL-RESOLVED. SOLANA-SETTLED.</span>
          <h2>Housing moves slow.<br />BID doesn’t.</h2>
        </div>
        <div className="steps">
          <article>
            <span>01 / PICK</span>
            <strong>Choose the market</strong>
            <p>Trade a YES/NO question, a city matchup, or a five-city field.</p>
          </article>
          <article>
            <span>02 / PRICE</span>
            <strong>Back an outcome</strong>
            <p>Each price from 1¢ to 99¢ reflects the market’s live probability.</p>
          </article>
          <article>
            <span>03 / SETTLE</span>
            <strong>Let the data decide</strong>
            <p>Each launch market names its Parcl price feed, snapshot, close, and calculation before trading begins.</p>
          </article>
        </div>
        <div className="settlement-strip">
          <div className="settle-badge"><BrandMark /></div>
          <p><span>INDEPENDENT RESOLUTION DATA</span> Parcl provides housing data and resolution services. BID defines and operates its own markets.</p>
          <div className="settle-flow"><span>Parcl data</span><i>→</i><span>Published rule</span><i>→</i><span>Solana settlement</span></div>
        </div>
      </section>

      <section className="portfolio-tease" id="roadmap">
        <span>COMING NEXT / COMMUNITY MARKETS</span>
        <h2>Bring the thesis.<br />Create the market.</h2>
        <p>Community market proposals are next: choose the geography, define the resolution rule, and commit seed liquidity. BID will curate the first wave before opening creation more broadly.</p>
        <a href="#markets">View genesis markets <span>↗</span></a>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top"><BrandMark /><span>BID</span></a>
        <p>Three funded real estate markets. Built for Solana.</p>
        <div><a href="#markets">Markets</a><a href="#fees">Fee policy</a><a href="#roadmap">Roadmap</a></div>
        <small>© 2026 BID · LAUNCH PREVIEW ONLY · BID IS INDEPENDENT AND NOT AFFILIATED WITH PARCL OR PUMP.FUN · REWARDS ARE PLANNED, NOT ACTIVE OR GUARANTEED · NOT INVESTMENT ADVICE</small>
      </footer>

      {walletOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setWalletOpen(false)}>
          <div
            className="wallet-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div><BrandMark /><span>BID</span></div>
              <button type="button" onClick={() => setWalletOpen(false)} aria-label="Close wallet dialog">×</button>
            </div>
            <span className="modal-kicker">DEMO CONNECTION</span>
            <h2 id="wallet-title">Choose a wallet</h2>
            <p>This prototype won’t request a signature or move funds.</p>
            <button className="wallet-choice" type="button" onClick={connectWallet}>
              <span className="wallet-icon violet-dot">P</span><strong>Phantom</strong><em>Detected</em>
            </button>
            <button className="wallet-choice" type="button" onClick={connectWallet}>
              <span className="wallet-icon red-dot">S</span><strong>Solflare</strong><em>Demo</em>
            </button>
            <button className="wallet-choice" type="button" onClick={connectWallet}>
              <span className="wallet-icon blue-dot">B</span><strong>Backpack</strong><em>Demo</em>
            </button>
            <small>Production version: Wallet Standard + simulated transaction review before signing.</small>
          </div>
        </div>
      )}

      {notice && (
        <button className="toast" type="button" onClick={() => setNotice("")} aria-label="Dismiss notification">
          <span>✓</span>{notice}<em>×</em>
        </button>
      )}
    </main>
  );
}
