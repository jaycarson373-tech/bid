"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { isDemo, isLive } from "@/lib/launchState";
import { siteConfig } from "@/lib/site";

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
    id: "miami-tampa-eoy",
    code: "MIA / TPA",
    mode: "head-to-head",
    question: "Which city will post the larger home-price increase by year-end?",
    short: "Florida home-price growth showdown",
    outcomes: [
      { label: "Miami", code: "MIA", price: 0.61, tone: "coral" },
      { label: "Tampa", code: "TPA", price: 0.39, tone: "mint" },
    ],
    volume: "$1.84M",
    liquidity: "$482K",
    closes: "Dec 31, 2026",
    signal: "MIA +4.8% · TPA +2.9%",
    chart: [28, 31, 29, 35, 38, 36, 43, 41, 47, 52, 49, 55, 59, 57, 63, 68, 65, 71, 74, 72, 78, 82, 79, 86],
  },
  {
    id: "city-field-eoy",
    code: "CITY / EOY",
    mode: "field",
    question: "Which U.S. city will have the highest home-price increase by EOY?",
    short: "Highest city price growth by EOY",
    outcomes: [
      { label: "Miami", code: "MIA", price: 0.31, tone: "coral" },
      { label: "Tampa", code: "TPA", price: 0.24, tone: "mint" },
      { label: "New York", code: "NYC", price: 0.18, tone: "violet" },
      { label: "Dallas", code: "DAL", price: 0.15, tone: "gold" },
      { label: "Phoenix", code: "PHX", price: 0.12, tone: "coral" },
    ],
    volume: "$2.42M",
    liquidity: "$618K",
    closes: "Dec 31, 2026",
    signal: "5 cities · winner takes $1",
    chart: [35, 39, 37, 42, 45, 49, 47, 51, 55, 53, 58, 61, 59, 64, 67, 65, 70, 73, 71, 75, 79, 77, 82, 84],
  },
  {
    id: "austin-positive",
    code: "AUS / YOY",
    mode: "yes-no",
    question: "Will Austin home prices finish 2026 positive year over year?",
    short: "Austin turns positive by year-end",
    outcomes: [
      { label: "Yes", code: "YES", price: 0.43, tone: "mint" },
      { label: "No", code: "NO", price: 0.57, tone: "coral" },
    ],
    volume: "$713K",
    liquidity: "$198K",
    closes: "Dec 31, 2026",
    signal: "Current YoY -2.3%",
    chart: [76, 73, 75, 69, 71, 66, 63, 65, 60, 57, 59, 54, 50, 53, 48, 45, 49, 43, 40, 44, 38, 41, 39, 42],
  },
  {
    id: "la-san-diego-sep",
    code: "LAX / SAN",
    mode: "head-to-head",
    question: "Which Southern California market will gain more by September?",
    short: "SoCal price-growth showdown",
    outcomes: [
      { label: "Los Angeles", code: "LAX", price: 0.48, tone: "gold" },
      { label: "San Diego", code: "SAN", price: 0.52, tone: "violet" },
    ],
    volume: "$1.21M",
    liquidity: "$356K",
    closes: "Sep 30, 2026",
    signal: "LAX +3.6% · SAN +3.9%",
    chart: [34, 36, 39, 37, 42, 45, 43, 48, 46, 52, 55, 53, 58, 62, 59, 65, 68, 66, 71, 75, 73, 78, 81, 84],
  },
  {
    id: "national-index-three",
    code: "US20 / 3%",
    mode: "yes-no",
    question: "Will the U.S. 20-city index gain more than 3% in 2026?",
    short: "National index clears 3%",
    outcomes: [
      { label: "Yes", code: "YES", price: 0.62, tone: "mint" },
      { label: "No", code: "NO", price: 0.38, tone: "coral" },
    ],
    volume: "$886K",
    liquidity: "$244K",
    closes: "Jan 29, 2027",
    signal: "Current annual pace +2.6%",
    chart: [30, 33, 31, 36, 39, 37, 42, 45, 43, 49, 52, 50, 55, 58, 56, 61, 64, 62, 66, 70, 68, 73, 76, 79],
  },
];

const filters = ["All markets", "Head to head", "5-city fields", "Yes / No"] as const;

function truncateAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

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

function SampleBadge({ compact = false }: { compact?: boolean }) {
  return <span className={`sample-badge ${compact ? "compact" : ""}`}>Sample data</span>;
}

function LockedValue({ children = "Opens at launch" }: { children?: string }) {
  return <strong className="locked-value">{children}</strong>;
}

function MarketVisual({
  market,
  compact = false,
  showPricing = false,
}: {
  market: Market;
  compact?: boolean;
  showPricing?: boolean;
}) {
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
            <small>{showPricing ? `${Math.round(outcome.price * 100)}¢` : "BID"}</small>
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

function matchesFilter(market: Market, filter: (typeof filters)[number]) {
  if (filter === "All markets") return true;
  if (filter === "Head to head") return market.mode === "head-to-head";
  if (filter === "5-city fields") return market.mode === "field";
  return market.mode === "yes-no";
}

export default function Home() {
  const [selectedId, setSelectedId] = useState(markets[0].id);
  const [filter, setFilter] = useState<(typeof filters)[number]>("All markets");
  const [selectedOutcome, setSelectedOutcome] = useState(0);
  const [amount, setAmount] = useState(isDemo ? "250" : "");
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const [notice, setNotice] = useState("");
  const contractAddress = siteConfig.contractAddress;

  const selected = markets.find((market) => market.id === selectedId) ?? markets[0];
  const outcome = selected.outcomes[selectedOutcome] ?? selected.outcomes[0];
  const displayedMarkets = markets.filter((market) => matchesFilter(market, filter));
  const showSampleData = isDemo;

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
    if (!showSampleData) {
      setNotice("Order previews open at launch. No transaction was sent.");
      return;
    }
    setNotice(`Preview ready: ${outcome.label} for $${(Number(amount) || 0).toLocaleString()}. No transaction was sent.`);
  };

  const copyContractAddress = async () => {
    if (!contractAddress) return;

    try {
      await navigator.clipboard.writeText(contractAddress);
      setNotice("Contract address copied.");
    } catch {
      setNotice("Contract address ready. Copy failed in this browser.");
    }
  };

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="BID home">
          <BrandMark /><span>BID</span><small>beta</small>
        </a>
        <nav className="desktop-nav" aria-label="Primary navigation">
          <a className="active" href="#markets">Markets</a>
          <a href="#how-it-works">How it works</a>
          <a href="#portfolio">Portfolio</a>
        </nav>
        <div className="header-actions">
          {contractAddress && (
            <button className="ca-pill" type="button" onClick={copyContractAddress}>
              CA <span>{truncateAddress(contractAddress)}</span>
            </button>
          )}
          <span className="network-pill"><i /> Solana</span>
          <button
            className={`wallet-button ${walletConnected ? "connected" : ""}`}
            type="button"
            onClick={() => walletConnected ? setNotice("Demo wallet is ready.") : setWalletOpen(true)}
          >
            {walletConnected ? "Preview wallet" : "Connect wallet"}
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span>{showSampleData ? "DEMO" : isLive ? "PENDING" : "PRELAUNCH"}</span> REAL ESTATE MARKETS, REBUILT</div>
          <h1>BID THE<br /><em>BLOCK.</em></h1>
          <p>
            Trade what happens next in housing. Pick a city, take a side, or
            price the whole field—settled on Solana.
          </p>
          <div className="hero-actions">
            <a className="primary-cta" href="#markets">Explore markets <span>↘</span></a>
            <a className="text-link" href="#how-it-works">See how it settles <span>→</span></a>
          </div>
        </div>

        <div className="hero-market">
          <div className="hero-market-head">
            <span>FEATURED // HEAD TO HEAD // MIA-TPA</span>
              <span className="pulse-label"><i /> {showSampleData ? "trading" : isLive ? "pending" : "prelaunch"}</span>
            </div>
            <div className="hero-market-body">
            <div className="hero-question">
              <span className="market-number">01</span>
              <h2>Which city posts the bigger home-price gain by EOY? <strong>Miami or Tampa?</strong></h2>
            </div>
              {showSampleData ? (
                <div className="odds-lockup">
                  <SampleBadge compact />
                  <span className="odds-label">Miami leads</span>
                  <strong>61<span>%</span></strong>
                  <small>Tampa 39% · +7 pts this week</small>
                </div>
              ) : (
                <div className="odds-lockup locked">
                  <span className="odds-label">{isLive ? "Live data pending" : "Markets open at launch"}</span>
                  <LockedValue />
                  <small>Pricing appears when funded markets open</small>
                </div>
              )}
            </div>
          {showSampleData ? (
            <>
              <div className="mini-chart" aria-label="Sample Miami probability trend">
                <SampleBadge compact />
                {markets[0].chart.map((height, index) => (
                  <i key={index} style={{ height: `${height}%` }} />
                ))}
              </div>
              <div className="chart-scale">
                <span>JUL 01</span><span>JUL 08</span><span>JUL 15</span><span>NOW</span>
              </div>
            </>
          ) : (
            <div className="chart-placeholder">
              {/* TODO(live-data): replace with /api/markets/featured probability history once the real BID/Parcl data feed exists. */}
              <span>Chart opens at launch</span>
            </div>
          )}
          <div className="hero-market-foot">
            <span>{showSampleData ? <><SampleBadge compact /> 24H VOL <strong>$428K</strong></> : <>24H VOL <LockedValue /></>}</span>
            <span>{showSampleData ? <>LIQUIDITY <strong>$482K</strong></> : <>LIQUIDITY <LockedValue /></>}</span>
            <span>RESOLVES <strong>DEC 31</strong></span>
          </div>
        </div>
      </section>

      <section className="ticker" aria-label="Platform statistics">
        {showSampleData ? (
          <>
            <div><SampleBadge /><span>24H VOLUME</span><strong>$6.4M</strong><em>+18.2%</em></div>
            <div><SampleBadge /><span>OPEN INTEREST</span><strong>$12.8M</strong><em>+6.4%</em></div>
            <div><SampleBadge /><span>ACTIVE MARKETS</span><strong>24</strong><em>12 cities</em></div>
            <div><SampleBadge /><span>SOLANA SETTLEMENT</span><strong>0.8s</strong><em>sample claim</em></div>
          </>
        ) : (
          <div className="launch-strip">
            {/* TODO(live-data): replace with /api/platform/stats once real BID volume, open interest, and market telemetry exists. */}
            <span>{isLive ? "Live data pending" : "Markets open at launch"}</span>
            <strong>Funded real estate markets are being prepared.</strong>
            <em>Built on Solana. No sample stats shown.</em>
          </div>
        )}
      </section>

      <section className="market-section" id="markets">
        <div className="section-heading">
          <div>
            <span className="section-kicker">THE BOARD</span>
            <h2>Price the city.</h2>
          </div>
          <p>YES/NO, head-to-head, or the full field. Every outcome settles against the same public index.</p>
        </div>

        <div className="filter-row" role="group" aria-label="Filter markets">
          {filters.map((item) => (
            <button
              className={filter === item ? "active" : ""}
              key={item}
              type="button"
              onClick={() => setFilter(item)}
            >
              {item}
              {item === "All markets" && <span>{String(markets.length).padStart(2, "0")}</span>}
            </button>
          ))}
        </div>

        <div className="trading-layout">
          <div className="market-list">
            {displayedMarkets.map((market, index) => (
              <button
                className={`market-card ${selectedId === market.id ? "selected" : ""}`}
                key={market.id}
                type="button"
                onClick={() => chooseMarket(market)}
                aria-pressed={selectedId === market.id}
              >
                <span className="card-index">{String(index + 1).padStart(2, "0")}</span>
                <MarketVisual market={market} showPricing={showSampleData} />
                <span className="market-copy">
                  <span className="market-meta">
                    <span>{market.mode.replaceAll("-", " ")}</span>
                    {showSampleData ? <em><SampleBadge compact /> {market.signal}</em> : <em>Opens at launch</em>}
                  </span>
                  <strong>{market.short}</strong>
                  <small>Resolves {market.closes} · {showSampleData ? `Vol ${market.volume}` : "Opens at launch"}</small>
                </span>
                <span className={`market-odds ${market.mode === "field" ? "field-odds" : ""}`}>
                  {showSampleData ? (
                    market.outcomes.slice(0, market.mode === "field" ? 3 : 2).map((item) => (
                      <span className="outcome-quote" key={item.code}>
                        <em>{item.code}</em><strong>{Math.round(item.price * 100)}¢</strong>
                      </span>
                    ))
                  ) : (
                    <span className="outcome-quote locked-quote"><LockedValue /></span>
                  )}
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
              <MarketVisual market={selected} compact showPricing={showSampleData} />
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
                  {showSampleData ? <strong>{Math.round(item.price * 100)}¢</strong> : <LockedValue />}
                  {selected.mode === "field" && <small>{item.code}</small>}
                </button>
              ))}
            </div>

            <p className="ticket-note ticket-note-top">Demo only. Orders are simulated and never sent onchain.</p>
            <label className="amount-label" htmlFor="trade-amount">
              <span>Amount</span><small>Balance {showSampleData ? "—" : "—"}</small>
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
            {showSampleData && (
              <div className="quick-amounts">
                {[25, 100, 250, 500].map((value) => (
                  <button key={value} type="button" onClick={() => setAmount(String(value))}>${value}</button>
                ))}
              </div>
            )}

            <div className="quote-lines">
              <p><span>{outcome.label} price</span>{showSampleData ? <strong>{Math.round(quote.price * 100)}¢</strong> : <LockedValue />}</p>
              <p><span>Est. contracts</span>{showSampleData ? <strong>{quote.contracts.toFixed(2)}</strong> : <LockedValue />}</p>
              <p><span>Est. network fee</span>{showSampleData ? <strong>&lt; $0.01</strong> : <LockedValue />}</p>
            </div>

            <div className="return-box">
              <span>YOU RECEIVE IF {outcome.label.toUpperCase()} WINS</span>
              {showSampleData ? (
                <>
                  <strong>${quote.contracts.toFixed(2)}</strong>
                  <small>+${quote.profit.toFixed(2)} potential profit</small>
                </>
              ) : (
                <>
                  <LockedValue />
                  <small>Quotes open at launch</small>
                </>
              )}
            </div>

            <button className="review-button" type="button" onClick={reviewOrder}>
              {walletConnected ? `Review ${outcome.label} order` : "Connect to preview"}
              <span>→</span>
            </button>
          </aside>
        </div>
      </section>

      <section className="how-section" id="how-it-works">
        <div className="how-intro">
          <span className="section-kicker">NO DEEDS. NO DOWNTIME.</span>
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
            <p>Each funded market shows its live probability once trading opens.</p>
          </article>
          <article>
            <span>03 / SETTLE</span>
            <strong>Let the index decide</strong>
            <p>Public housing data resolves the winner. Winning contracts redeem according to locked market terms.</p>
          </article>
        </div>
        <div className="settlement-strip">
          <div className="settle-badge"><BrandMark /></div>
          <p><span>VERIFIABLE BY DESIGN</span> Market terms, closing time, and settlement source are locked before trading opens.</p>
          <div className="settle-flow"><span>Housing index</span><i>→</i><span>Oracle attestation</span><i>→</i><span>Solana settlement</span></div>
        </div>
      </section>

      <section className="portfolio-tease" id="portfolio">
        <span>YOUR CITY. YOUR THESIS.</span>
        <h2>Build the housing portfolio<br />you couldn’t buy.</h2>
        <a href="#markets">Enter the market <span>↗</span></a>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top"><BrandMark /><span>BID</span></a>
        <p>Real estate prediction markets on Solana.</p>
        <div>
          <a href="#markets">Markets</a>
          <a href="#how-it-works">How it works</a>
          {contractAddress && (
            <button className="footer-ca" type="button" onClick={copyContractAddress}>
              CA {truncateAddress(contractAddress)}
            </button>
          )}
        </div>
        <small>© 2026 BID · PROTOTYPE ONLY · NOT INVESTMENT ADVICE</small>
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
