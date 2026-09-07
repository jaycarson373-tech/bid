"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  LockKeyhole,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import {
  useConnect,
  useConnectedWallet,
  useDisconnect,
  useIsWalletReady,
  useWallets,
} from "@solana/kit-plugin-wallet/react";
import { solanaClient } from "@/lib/solanaClient";
import { optionQuote, type OptionSide, type QuoteInput } from "@/lib/optionsModel";

const strikes = [60, 65, 70, 75, 80, 85, 90];
const expiries = [
  { label: "30D", years: 30 / 365 },
  { label: "60D", years: 60 / 365 },
  { label: "90D", years: 90 / 365 },
] as const;

function money(value: number, digits = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function BrandMark() {
  return <span className="ho-mark" aria-hidden="true"><i /><i /><i /></span>;
}

function WalletControl() {
  const wallets = useWallets(solanaClient);
  const connected = useConnectedWallet(solanaClient);
  const ready = useIsWalletReady(solanaClient);
  const { dispatch: connect, isRunning: isConnecting } = useConnect(solanaClient);
  const { dispatch: disconnect, isRunning: isDisconnecting } = useDisconnect(solanaClient);
  const [open, setOpen] = useState(false);
  const shortAddress = connected
    ? `${connected.account.address.slice(0, 4)}...${connected.account.address.slice(-4)}`
    : "Connect wallet";

  return (
    <div className="wallet-control">
      <button className={`wallet-trigger ${connected ? "connected" : ""}`} type="button" disabled={!ready || isConnecting || isDisconnecting} onClick={() => setOpen((value) => !value)}>
        <Wallet size={14} strokeWidth={1.8} /><span>{shortAddress}</span><ChevronDown size={13} />
      </button>
      {open && (
        <div className="wallet-menu">
          <div className="wallet-menu-head"><span>{connected ? "Wallet connected" : "Select a Solana wallet"}</span><button type="button" aria-label="Close wallet menu" onClick={() => setOpen(false)}><X size={14} /></button></div>
          {connected ? (
            <><strong>{connected.wallet.name}</strong><code>{connected.account.address}</code><button className="wallet-menu-action" type="button" onClick={() => { disconnect(); setOpen(false); }}>Disconnect</button></>
          ) : wallets.length ? (
            wallets.map((wallet) => (
              <button className="wallet-choice" type="button" key={wallet.name} onClick={() => { connect(wallet); setOpen(false); }}>
                {wallet.icon ? (
                  // Wallet Standard icons can be extension-provided data URLs.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={wallet.icon} alt="" />
                ) : <Wallet size={18} />}<span>{wallet.name}</span><ArrowUpRight size={14} />
              </button>
            ))
          ) : <p>No Solana wallet detected. Install Phantom, Backpack, or Solflare.</p>}
        </div>
      )}
    </div>
  );
}

function PayoffChart({ side, lower, width }: { side: OptionSide; lower: number; width: number }) {
  const upper = lower + width;
  const points = Array.from({ length: 41 }, (_, index) => {
    const price = lower - width + (index / 40) * width * 3;
    const raw = side === "call" ? price - lower : upper - price;
    return Math.max(0, Math.min(width, raw));
  });
  const path = points.map((payout, index) => `${index === 0 ? "M" : "L"}${((index / 40) * 100).toFixed(2)} ${(88 - (payout / width) * 68).toFixed(2)}`).join(" ");
  return (
    <div className="payoff-chart" aria-label={`${side} spread payoff at expiry`}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img">
        <defs><linearGradient id="payoff-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#aaff45" stopOpacity=".32" /><stop offset="1" stopColor="#aaff45" stopOpacity="0" /></linearGradient></defs>
        <path className="chart-grid" d="M0 20H100 M0 54H100 M0 88H100 M25 0V100 M50 0V100 M75 0V100" />
        <path className="chart-fill" d={`${path} L100 88 L0 88 Z`} /><path className="chart-line" d={path} />
      </svg>
      <span>{money(lower, 0)}</span><span>{money(upper, 0)} cap</span>
    </div>
  );
}

export default function Home() {
  const [spot, setSpot] = useState(75);
  const [volatility, setVolatility] = useState(45);
  const [expiryIndex, setExpiryIndex] = useState(0);
  const [strike, setStrike] = useState(75);
  const [side, setSide] = useState<OptionSide>("call");
  const [contracts, setContracts] = useState(1);
  const [lpDeposit, setLpDeposit] = useState(2500);
  const width = 10;
  const quoteInput: QuoteInput = useMemo(() => ({ spot, lowerStrike: strike, upperStrike: strike + width, volatility: volatility / 100, years: expiries[expiryIndex].years, rate: 0.04, side }), [expiryIndex, side, spot, strike, volatility]);
  const selectedQuote = optionQuote(quoteInput);
  const premium = selectedQuote.premium * contracts;
  const maxPayout = width * contracts;

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="#trade" aria-label="Hood Options home"><BrandMark /><span>HOOD OPTIONS</span><small>PRELAUNCH</small></Link>
        <nav className="desktop-nav" aria-label="Primary navigation"><a className="active" href="#trade">Trade</a><a href="#vault">Liquidity</a><a href="#architecture">Protocol</a><Link href="/docs">Docs</Link></nav>
        <div className="top-actions"><span className="network-state"><i /> Solana</span><WalletControl /></div>
      </header>

      <section className="market-masthead" id="trade">
        <div className="masthead-copy"><span className="eyebrow">EUROPEAN OPTIONS / FULLY COLLATERALIZED</span><h1>HOOD<br />OPTIONS</h1><p>Defined-risk stock options, underwritten by protocol liquidity on Solana.</p></div>
        <div className="masthead-tape" aria-label="Protocol status">
          <div><span>Underlying</span><strong>HOOD</strong><small>Robinhood Markets</small></div>
          <div><span>Exercise</span><strong>European</strong><small>At expiry only</small></div>
          <div><span>Settlement</span><strong>Cash</strong><small>Stablecoin collateral</small></div>
          <div><span>Status</span><strong className="prelaunch">Prelaunch</strong><small>Contracts in testing</small></div>
        </div>
      </section>

      <section className="trading-terminal">
        <div className="terminal-toolbar">
          <div className="underlying-id"><span className="hood-avatar">H</span><div><strong>HOOD</strong><small>Robinhood Markets, Inc.</small></div><span className="model-tag">MODEL PREVIEW</span></div>
          <div className="model-spot"><span>Model spot</span><strong>{money(spot)}</strong><small><ArrowUpRight size={11} /> Editable scenario, not a live quote</small></div>
        </div>
        <div className="terminal-grid">
          <div className="chain-panel">
            <div className="model-controls">
              <label><span>Underlying scenario</span><strong>{money(spot)}</strong><input type="range" min="50" max="105" step="1" value={spot} onChange={(event) => setSpot(Number(event.target.value))} /></label>
              <label><span>Implied volatility</span><strong>{volatility}%</strong><input type="range" min="20" max="90" step="1" value={volatility} onChange={(event) => setVolatility(Number(event.target.value))} /></label>
            </div>
            <div className="expiry-tabs" role="tablist" aria-label="Expiry model"><span>Expiry</span>{expiries.map((expiry, index) => <button className={expiryIndex === index ? "active" : ""} type="button" key={expiry.label} onClick={() => setExpiryIndex(index)}>{expiry.label}</button>)}<small>MODEL TENOR</small></div>
            <div className="option-chain">
              <div className="chain-header"><span>CALL SPREAD</span><span>MODEL</span><span>STRIKE</span><span>MODEL</span><span>PUT SPREAD</span></div>
              {strikes.map((rowStrike) => {
                const call = optionQuote({ ...quoteInput, lowerStrike: rowStrike, upperStrike: rowStrike + width, side: "call" });
                const put = optionQuote({ ...quoteInput, lowerStrike: rowStrike, upperStrike: rowStrike + width, side: "put" });
                const activeCall = side === "call" && strike === rowStrike;
                const activePut = side === "put" && strike === rowStrike;
                return <div className={`chain-row ${rowStrike === strike ? "selected-row" : ""}`} key={rowStrike}>
                  <button className={activeCall ? "selected" : ""} type="button" onClick={() => { setStrike(rowStrike); setSide("call"); }}><ArrowUpRight size={13} /> Call</button>
                  <button className={`quote-cell ${activeCall ? "selected" : ""}`} type="button" onClick={() => { setStrike(rowStrike); setSide("call"); }}><strong>{money(call.premium)}</strong><small>{call.delta.toFixed(2)} Δ</small></button>
                  <div className="strike-cell"><strong>{rowStrike}</strong><small>{rowStrike} / {rowStrike + width}</small></div>
                  <button className={`quote-cell ${activePut ? "selected" : ""}`} type="button" onClick={() => { setStrike(rowStrike); setSide("put"); }}><strong>{money(put.premium)}</strong><small>{put.delta.toFixed(2)} Δ</small></button>
                  <button className={activePut ? "selected" : ""} type="button" onClick={() => { setStrike(rowStrike); setSide("put"); }}>Put <ArrowDownRight size={13} /></button>
                </div>;
              })}
            </div>
            <p className="model-disclosure">Model values use a capped Black-Scholes spread estimate. They are not live, executable, or sourced from an exchange.</p>
          </div>

          <aside className="order-ticket">
            <div className="ticket-title"><span>ORDER TICKET</span><span>HOOD / {expiries[expiryIndex].label}</span></div>
            <div className="side-switch"><button className={side === "call" ? "active" : ""} type="button" onClick={() => setSide("call")}><ArrowUpRight size={14} /> Call spread</button><button className={side === "put" ? "active" : ""} type="button" onClick={() => setSide("put")}>Put spread <ArrowDownRight size={14} /></button></div>
            <div className="ticket-contract"><span>{side.toUpperCase()} / EUROPEAN</span><strong>{money(strike, 0)} / {money(strike + width, 0)}</strong><small>Exercise at expiry · {money(width, 0)} maximum payout</small></div>
            <PayoffChart side={side} lower={strike} width={width} />
            <label className="contract-input"><span>Contracts</span><div><button type="button" onClick={() => setContracts(Math.max(1, contracts - 1))}>−</button><input value={contracts} min="1" max="100" type="number" onChange={(event) => setContracts(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} /><button type="button" onClick={() => setContracts(Math.min(100, contracts + 1))}>+</button></div></label>
            <dl className="ticket-math"><div><dt>Model premium</dt><dd>{money(premium)}</dd></div><div><dt>Maximum payout</dt><dd>{money(maxPayout)}</dd></div><div><dt>Collateral coverage</dt><dd>100%</dd></div><div><dt>Network</dt><dd>Solana</dd></div></dl>
            <button className="review-order" type="button" disabled><LockKeyhole size={15} /> Trading activates after deployment</button>
            <p className="ticket-note"><ShieldCheck size={13} /> Fully funded maximum payout before a contract can be written.</p>
          </aside>
        </div>
      </section>

      <section className="vault-section" id="vault">
        <div className="section-heading"><span>PROTOCOL LIQUIDITY</span><h2>Underwrite the market.<br />Earn its premiums.</h2><p>Liquidity providers fund bounded option liabilities. Premiums remain inside the vault and accrue to LP share value.</p></div>
        <div className="vault-grid">
          <div className="vault-console"><div className="console-head"><span>HOOD OPTION VAULT / EPOCH 01</span><strong>PRELAUNCH</strong></div><div className="vault-metrics"><div><span>Total assets</span><strong>—</strong><small>LIVE ONCHAIN VALUE</small></div><div><span>Locked collateral</span><strong>—</strong><small>OPEN MAX PAYOUTS</small></div><div><span>Available depth</span><strong>—</strong><small>NEW CONTRACT CAPACITY</small></div></div><label className="deposit-model"><span>Deposit model</span><strong>{money(lpDeposit, 0)}</strong><input type="range" min="250" max="25000" step="250" value={lpDeposit} onChange={(event) => setLpDeposit(Number(event.target.value))} /></label><div className="capacity-line"><span>Maximum fully backed {money(width, 0)} contracts</span><strong>{Math.floor(lpDeposit / width).toLocaleString()}</strong></div><button className="deposit-button" type="button" disabled>Deposits open after program audit</button></div>
          <div className="vault-principles"><article><span>01</span><div><strong>DEFINED LIABILITY</strong><p>Every series caps payout at the spread width. The vault cannot write beyond available collateral.</p></div></article><article><span>02</span><div><strong>PREMIUMS TO LPs</strong><p>Buyer premiums enter the vault, increasing net asset value rather than flowing through a separate rewards token.</p></div></article><article><span>03</span><div><strong>EPOCH WITHDRAWALS</strong><p>Liquidity exits only after outstanding settlement obligations are released, protecting active positions.</p></div></article></div>
        </div>
      </section>

      <section className="architecture-section" id="architecture">
        <div className="architecture-copy"><span>THE MONEY FLOW</span><h2>One vault.<br />Every dollar accounted for.</h2><p>HOOD Options uses bounded, cash-settled contracts so the protocol can prove the maximum liability before accepting an order.</p><Link href="/docs">Read protocol design <ExternalLink size={13} /></Link></div>
        <div className="flow-rail"><div><span>01</span><strong>LP COLLATERAL</strong><small>Stablecoin enters a program-owned vault.</small></div><i /><div><span>02</span><strong>OPTION PREMIUM</strong><small>Buyer premium increases vault assets.</small></div><i /><div><span>03</span><strong>MAX PAYOUT LOCKED</strong><small>New orders stop before solvency is breached.</small></div><i /><div><span>04</span><strong>EXPIRY SETTLEMENT</strong><small>Oracle price fixes one deterministic payout.</small></div></div>
      </section>

      <section className="risk-band"><CircleHelp size={18} /><p><strong>Reference-price derivatives, not Robinhood shares.</strong> HOOD Options is in development. No production program, collateral vault, or equity settlement oracle is live yet.</p></section>
      <footer><Link className="brand" href="#trade"><BrandMark /><span>HOOD OPTIONS</span></Link><p>European-style stock options, built for Solana.</p><div><Link href="/docs">Docs</Link><a href="#vault">Liquidity</a><span>© 2026</span></div></footer>
    </main>
  );
}
