"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  createWalletClient,
  custom,
  formatUnits,
  parseUnits,
  type EIP1193Provider,
  type Hex,
} from "viem";
import {
  bidMarketAbi,
  configuredAddress,
  erc20TradeAbi,
  robinhoodChain,
  robinhoodPublicClient,
} from "@/lib/bidMarket";
import { isDemo } from "@/lib/launchState";
import { siteConfig } from "@/lib/site";

type Tone = "coral" | "mint" | "violet" | "gold";
type OrderType = "market" | "limit" | "liquidity";
type LiquidityAction = "add" | "remove";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

type Outcome = {
  label: string;
  code: string;
  price: number;
  tone: Tone;
};

type Market = {
  id: string;
  contractAddress: string;
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
    contractAddress: siteConfig.marketAddresses.miamiTampa,
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
    contractAddress: siteConfig.marketAddresses.cityField,
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
    contractAddress: siteConfig.marketAddresses.austinPositive,
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
];

const filters = ["All markets", "Head to head", "5-city fields", "Yes / No"] as const;

function truncateAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function displayTokenAmount(value: bigint, decimals: number, maximumFractionDigits = 2) {
  return Number(formatUnits(value, decimals)).toLocaleString("en-US", {
    maximumFractionDigits,
  });
}

function providerErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? Number((error as { code?: unknown }).code)
    : undefined;
}

function BrandMark() {
  return (
    <span className="brand-mark brand-mark-image" aria-hidden="true">
      <Image src="/brand/bid-logo.jpg" alt="" width={36} height={36} priority />
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
  prices,
}: {
  market: Market;
  compact?: boolean;
  showPricing?: boolean;
  prices?: number[];
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
        {market.outcomes.map((outcome, index) => (
          <span className={outcome.tone} key={outcome.code}>
            <strong>{outcome.code}</strong>
            <small>{showPricing ? `${Math.round((prices?.[index] ?? outcome.price) * 100)}¢` : "BID"}</small>
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
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [liquidityAction, setLiquidityAction] = useState<LiquidityAction>("add");
  const [limitPrice, setLimitPrice] = useState("50");
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [notice, setNotice] = useState("");
  const [transactionPending, setTransactionPending] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [livePrices, setLivePrices] = useState<Record<string, number[]>>({});
  const [liveQuote, setLiveQuote] = useState<{
    key: string;
    outcomeTokensOut: bigint;
    creatorFee: bigint;
    decimals: number;
  } | null>(null);
  const [lpPosition, setLpPosition] = useState<{
    key: string;
    balance: bigint;
    decimals: number;
  } | null>(null);
  const [liquidityQuote, setLiquidityQuote] = useState<{
    key: string;
    primaryAmount: bigint;
    residualAmounts: readonly bigint[];
    decimals: number;
  } | null>(null);
  const contractAddress = siteConfig.contractAddress;
  const creatorTaxPercent = siteConfig.creatorTaxBps / 100;
  const rewardsPercent = creatorTaxPercent * siteConfig.predictionRewardsShareBps / 10_000;
  const liquidityPercent = creatorTaxPercent * siteConfig.liquidityShareBps / 10_000;

  const selected = markets.find((market) => market.id === selectedId) ?? markets[0];
  const selectedMarketAddress = configuredAddress(selected.contractAddress);
  const marketContractConfigured = selectedMarketAddress !== null;
  const outcome = selected.outcomes[selectedOutcome] ?? selected.outcomes[0];
  const displayedMarkets = markets.filter((market) => matchesFilter(market, filter));
  const showSampleData = isDemo;
  const selectedPrices = livePrices[selected.id];
  const showSelectedPricing = Boolean(selectedPrices) || showSampleData;
  const displayedOutcomePrice = selectedPrices?.[selectedOutcome] !== undefined
    ? selectedPrices[selectedOutcome] / 10_000
    : outcome.price;
  const quoteKey = `${selected.id}:${selectedOutcome}:${amount}`;
  const currentLiveQuote = liveQuote?.key === quoteKey ? liveQuote : null;
  const liquidityQuoteKey = `${selected.id}:${liquidityAction}:${amount}:${walletAddress}`;
  const currentLiquidityQuote = liquidityQuote?.key === liquidityQuoteKey ? liquidityQuote : null;
  const lpPositionKey = `${selected.id}:${walletAddress}`;
  const currentLpPosition = lpPosition?.key === lpPositionKey ? lpPosition : null;
  const lpBalanceDisplay = currentLpPosition
    ? displayTokenAmount(currentLpPosition.balance, currentLpPosition.decimals, 4)
    : walletConnected ? "—" : "Connect wallet";
  const liquidityPrimaryDisplay = currentLiquidityQuote
    ? displayTokenAmount(currentLiquidityQuote.primaryAmount, currentLiquidityQuote.decimals, 4)
    : "—";
  const liquidityResidualDisplay = currentLiquidityQuote
    ? displayTokenAmount(
      currentLiquidityQuote.residualAmounts.reduce((total, value) => total + value, 0n),
      currentLiquidityQuote.decimals,
      4,
    )
    : "—";

  useEffect(() => {
    let cancelled = false;

    async function loadMarketPrices() {
      const loaded = await Promise.all(markets.map(async (market) => {
        const address = configuredAddress(market.contractAddress);
        if (!address) return null;

        try {
          const prices = await robinhoodPublicClient.readContract({
            address,
            abi: bidMarketAbi,
            functionName: "spotPricesBps",
          });
          return [market.id, prices.map(Number)] as const;
        } catch {
          return null;
        }
      }));

      if (cancelled) return;
      setLivePrices(Object.fromEntries(loaded.filter((entry) => entry !== null)));
    }

    void loadMarketPrices();
    return () => { cancelled = true; };
  }, [refreshNonce]);

  useEffect(() => {
    let cancelled = false;
    const collateralAmount = Number(amount);

    if (
      orderType === "liquidity" ||
      !selectedMarketAddress ||
      !Number.isFinite(collateralAmount) ||
      collateralAmount <= 0
    ) {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const collateral = await robinhoodPublicClient.readContract({
          address: selectedMarketAddress,
          abi: bidMarketAbi,
          functionName: "collateral",
        });
        const decimals = await robinhoodPublicClient.readContract({
          address: collateral,
          abi: erc20TradeAbi,
          functionName: "decimals",
        });
        const collateralIn = parseUnits(amount, decimals);
        const [outcomeTokensOut, creatorFee] = await robinhoodPublicClient.readContract({
          address: selectedMarketAddress,
          abi: bidMarketAbi,
          functionName: "quoteBuy",
          args: [collateralIn, BigInt(selectedOutcome)],
        });

        if (!cancelled) setLiveQuote({ key: quoteKey, outcomeTokensOut, creatorFee, decimals });
      } catch {
        if (!cancelled) setLiveQuote(null);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [amount, orderType, quoteKey, refreshNonce, selectedMarketAddress, selectedOutcome]);

  useEffect(() => {
    let cancelled = false;
    const account = configuredAddress(walletAddress);

    if (!selectedMarketAddress || !account || !walletConnected) {
      return;
    }

    async function loadLpPosition() {
      try {
        const [balance, decimals] = await Promise.all([
          robinhoodPublicClient.readContract({
            address: selectedMarketAddress!,
            abi: bidMarketAbi,
            functionName: "balanceOf",
            args: [account!],
          }),
          robinhoodPublicClient.readContract({
            address: selectedMarketAddress!,
            abi: bidMarketAbi,
            functionName: "decimals",
          }),
        ]);
        if (!cancelled) setLpPosition({ key: lpPositionKey, balance, decimals });
      } catch {
        // A missing or incompatible market remains an unquoted prelaunch pool.
      }
    }

    void loadLpPosition();
    return () => { cancelled = true; };
  }, [lpPositionKey, refreshNonce, selectedMarketAddress, walletAddress, walletConnected]);

  useEffect(() => {
    let cancelled = false;
    const numericAmount = Number(amount);
    const account = configuredAddress(walletAddress);

    if (
      orderType !== "liquidity" ||
      !selectedMarketAddress ||
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0 ||
      (liquidityAction === "remove" && !account)
    ) {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const collateral = await robinhoodPublicClient.readContract({
          address: selectedMarketAddress,
          abi: bidMarketAbi,
          functionName: "collateral",
        });
        const decimals = await robinhoodPublicClient.readContract({
          address: collateral,
          abi: erc20TradeAbi,
          functionName: "decimals",
        });
        const inputAmount = parseUnits(amount, decimals);

        if (liquidityAction === "add") {
          const [sharesMinted, residualAmounts] = await robinhoodPublicClient.readContract({
            address: selectedMarketAddress,
            abi: bidMarketAbi,
            functionName: "quoteAddFunding",
            args: [inputAmount],
          });
          if (!cancelled) {
            setLiquidityQuote({
              key: liquidityQuoteKey,
              primaryAmount: sharesMinted,
              residualAmounts,
              decimals,
            });
          }
        } else {
          const [collateralOut, residualAmounts] = await robinhoodPublicClient.readContract({
            account: account!,
            address: selectedMarketAddress,
            abi: bidMarketAbi,
            functionName: "quoteRemoveFundingToCollateral",
            args: [inputAmount],
          });
          if (!cancelled) {
            setLiquidityQuote({
              key: liquidityQuoteKey,
              primaryAmount: collateralOut,
              residualAmounts,
              decimals,
            });
          }
        }
      } catch {
        if (!cancelled) setLiquidityQuote(null);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [amount, liquidityAction, liquidityQuoteKey, orderType, selectedMarketAddress, walletAddress]);

  const quote = (() => {
    const dollars = Math.max(0, Number(amount) || 0);
    const limitPriceDollars = Math.max(0, Number(limitPrice) || 0) / 100;
    const price = orderType === "limit" ? limitPriceDollars : displayedOutcomePrice;
    const liveContracts = currentLiveQuote
      ? Number(formatUnits(currentLiveQuote.outcomeTokensOut, currentLiveQuote.decimals))
      : null;
    const contracts = orderType === "market" && liveContracts !== null
      ? liveContracts
      : price > 0 ? dollars / price : 0;
    return {
      price,
      contracts,
      profit: Math.max(0, contracts - dollars),
    };
  })();

  const chooseMarket = (market: Market) => {
    setSelectedId(market.id);
    setSelectedOutcome(0);
  };

  const connectWallet = async () => {
    const provider = window.ethereum;

    if (!provider) {
      setNotice("No EVM browser wallet was detected. Install or unlock one, then try again.");
      return;
    }

    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
      const address = accounts[0] ?? "";

      if (!address) {
        setNotice("The wallet connected, but no account was returned.");
        return;
      }

      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: siteConfig.robinhoodChainHex }],
        });
      } catch (error) {
        if (providerErrorCode(error) !== 4902) throw error;
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: siteConfig.robinhoodChainHex,
            chainName: siteConfig.networkName,
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: [siteConfig.rpcUrl],
            blockExplorerUrls: [siteConfig.explorerUrl],
          }],
        });
      }

      setWalletConnected(true);
      setWalletAddress(address);
      setWalletOpen(false);
      setNotice(`Wallet connected: ${truncateAddress(address)}. Robinhood Chain selected; no signature requested.`);
    } catch {
      setNotice("Wallet connection or network switching was cancelled.");
    }
  };

  const reviewOrder = async () => {
    if (!walletConnected) {
      setWalletOpen(true);
      return;
    }

    const account = configuredAddress(walletAddress);
    const provider = window.ethereum;
    if (!selectedMarketAddress || !account || !provider) {
      setNotice("Wallet connected. This market is not deployed yet, so no transaction was built.");
      return;
    }

    if (!amount || Number(amount) <= 0) {
      setNotice("Enter a USDG amount first.");
      return;
    }

    const priceBps = BigInt(Math.round(Number(limitPrice) * 100));
    if (orderType === "limit" && (priceBps <= 0n || priceBps >= 10_000n)) {
      setNotice("Set a limit price between 0.01c and 99.99c.");
      return;
    }

    setTransactionPending(true);
    try {
      const walletClient = createWalletClient({
        account,
        chain: robinhoodChain,
        transport: custom(provider),
      });
      const collateral = await robinhoodPublicClient.readContract({
        address: selectedMarketAddress,
        abi: bidMarketAbi,
        functionName: "collateral",
      });
      const decimals = await robinhoodPublicClient.readContract({
        address: collateral,
        abi: erc20TradeAbi,
        functionName: "decimals",
      });
      const inputAmount = parseUnits(amount, decimals);
      const needsCollateralApproval = orderType !== "liquidity" || liquidityAction === "add";

      if (orderType === "liquidity" && liquidityAction === "remove") {
        const lpBalance = await robinhoodPublicClient.readContract({
          address: selectedMarketAddress,
          abi: bidMarketAbi,
          functionName: "balanceOf",
          args: [account],
        });
        if (inputAmount > lpBalance) {
          setNotice("That withdrawal is larger than your BID-LP position.");
          return;
        }
      }

      if (needsCollateralApproval) {
        const allowance = await robinhoodPublicClient.readContract({
          address: collateral,
          abi: erc20TradeAbi,
          functionName: "allowance",
          args: [account, selectedMarketAddress],
        });

        if (allowance < inputAmount) {
          setNotice(`Approve ${siteConfig.collateralSymbol} in your wallet to continue.`);
          const approvalHash = await walletClient.writeContract({
            address: collateral,
            abi: erc20TradeAbi,
            functionName: "approve",
            args: [selectedMarketAddress, inputAmount],
          });
          await robinhoodPublicClient.waitForTransactionReceipt({ hash: approvalHash });
        }
      }

      setNotice(
        orderType === "liquidity"
          ? `Confirm the liquidity ${liquidityAction === "add" ? "deposit" : "withdrawal"}.`
          : orderType === "market" ? "Confirm the market order." : "Confirm the onchain limit order.",
      );
      let transactionHash: Hex;

      if (orderType === "liquidity" && liquidityAction === "add") {
        const [quotedShares] = await robinhoodPublicClient.readContract({
          address: selectedMarketAddress,
          abi: bidMarketAbi,
          functionName: "quoteAddFunding",
          args: [inputAmount],
        });
        const minSharesMinted = quotedShares * 9_950n / 10_000n;
        transactionHash = await walletClient.writeContract({
          address: selectedMarketAddress,
          abi: bidMarketAbi,
          functionName: "addFunding",
          args: [inputAmount, minSharesMinted],
        });
      } else if (orderType === "liquidity") {
        const [quotedCollateral] = await robinhoodPublicClient.readContract({
          account,
          address: selectedMarketAddress,
          abi: bidMarketAbi,
          functionName: "quoteRemoveFundingToCollateral",
          args: [inputAmount],
        });
        const minCollateralOut = quotedCollateral * 9_950n / 10_000n;
        transactionHash = await walletClient.writeContract({
          address: selectedMarketAddress,
          abi: bidMarketAbi,
          functionName: "removeFundingToCollateral",
          args: [inputAmount, minCollateralOut],
        });
      } else if (orderType === "market") {
        const [quotedTokens] = await robinhoodPublicClient.readContract({
          address: selectedMarketAddress,
          abi: bidMarketAbi,
          functionName: "quoteBuy",
          args: [inputAmount, BigInt(selectedOutcome)],
        });
        const minOutcomeTokensOut = quotedTokens * 9_950n / 10_000n;
        transactionHash = await walletClient.writeContract({
          address: selectedMarketAddress,
          abi: bidMarketAbi,
          functionName: "buy",
          args: [inputAmount, BigInt(selectedOutcome), minOutcomeTokensOut],
        });
      } else {
        const minOutcomeTokensOut = (inputAmount * 10_000n + priceBps - 1n) / priceBps;
        transactionHash = await walletClient.writeContract({
          address: selectedMarketAddress,
          abi: bidMarketAbi,
          functionName: "placeBuyLimit",
          args: [inputAmount, BigInt(selectedOutcome), minOutcomeTokensOut],
        });
      }

      await robinhoodPublicClient.waitForTransactionReceipt({ hash: transactionHash });
      setRefreshNonce((value) => value + 1);
      const actionLabel = orderType === "liquidity"
        ? `Liquidity ${liquidityAction === "add" ? "added" : "withdrawn"}`
        : orderType === "market" ? "Market order filled" : "Limit order placed";
      setNotice(`${actionLabel}. Transaction ${truncateAddress(transactionHash)} confirmed.`);
    } catch (error) {
      const message = typeof error === "object" && error !== null && "shortMessage" in error
        ? String((error as { shortMessage: unknown }).shortMessage)
        : "The transaction was cancelled or reverted.";
      setNotice(message);
    } finally {
      setTransactionPending(false);
    }
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
          <a href="#flywheel">Flywheel</a>
          <a href="/docs">Docs</a>
        </nav>
        <div className="header-actions">
          {contractAddress && (
            <button className="ca-pill" type="button" onClick={copyContractAddress}>
              CA <span>{truncateAddress(contractAddress)}</span>
            </button>
          )}
          <span className="network-pill"><i /> Robinhood Chain</span>
          <a className="pons-button" href={siteConfig.ponsUrl} target="_blank" rel="noreferrer">
            Pons ↗
          </a>
          <button
            className={`wallet-button ${walletConnected ? "connected" : ""}`}
            type="button"
            onClick={() => walletConnected ? setNotice(`Wallet connected on Robinhood Chain: ${truncateAddress(walletAddress)}.`) : setWalletOpen(true)}
          >
            {walletConnected ? truncateAddress(walletAddress) : "Connect wallet"}
          </button>
        </div>
      </header>

      <section className="hero" id="top" aria-labelledby="hero-title">
        <Image
          className="hero-banner-image"
          src="/brand/bid-banner.jpg"
          alt="BID real estate prediction markets on Robinhood Chain"
          fill
          priority
          sizes="100vw"
        />
        <div className="hero-shade" aria-hidden="true" />
        <div className="hero-content">
          <div className="hero-copy">
            <div className="eyebrow"><span>BID</span> RWA HOUSING MARKETS // ROBINHOOD CHAIN</div>
            <h1 id="hero-title">BID: real estate prediction markets.</h1>
            <p>
              USDG-backed outcome pools turn housing data into tradable odds.
              $BID activity on Pons funds trader rewards and deeper liquidity.
            </p>
          </div>
          <div className="hero-actions">
            <a className="primary-cta" href="#markets">Explore markets <span>↓</span></a>
            <a className="secondary-cta" href="/docs">Read protocol docs <span>→</span></a>
          </div>
        </div>
        <div className="hero-status" aria-label="Protocol highlights">
          <span><i /> {marketContractConfigured ? "AMM connected" : "Mainnet prelaunch"}</span>
          <span>0% genesis market fee</span>
          <span>2.5% Pons creator tax → rewards + LP</span>
        </div>
      </section>

      <section className="ticker" aria-label="Platform statistics">
        {showSampleData ? (
          <>
            <div><SampleBadge /><span>24H VOLUME</span><strong>$6.4M</strong><em>+18.2%</em></div>
            <div><SampleBadge /><span>OPEN INTEREST</span><strong>$12.8M</strong><em>+6.4%</em></div>
            <div><SampleBadge /><span>ACTIVE MARKETS</span><strong>24</strong><em>12 cities</em></div>
            <div><SampleBadge /><span>PONS CREATOR TAX</span><strong>2.5%</strong><em>rewards + LP</em></div>
          </>
        ) : (
          <div className="launch-strip">
            <span>0% BID TRADING FEE</span>
            <strong>USDG-backed finite-outcome pools.</strong>
            <em>2.5% Pons flywheel → rewards + deeper LP</em>
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
                <MarketVisual
                  market={market}
                  showPricing={Boolean(livePrices[market.id]) || showSampleData}
                  prices={livePrices[market.id]?.map((price) => price / 10_000)}
                />
                <span className="market-copy">
                  <span className="market-meta">
                    <span>{market.mode.replaceAll("-", " ")}</span>
                    {livePrices[market.id]
                      ? <em>Live AMM · {market.signal}</em>
                      : showSampleData ? <em><SampleBadge compact /> {market.signal}</em> : <em>Opening soon</em>}
                  </span>
                  <strong>{market.short}</strong>
                  <small>Resolves {market.closes} · {showSampleData ? `Vol ${market.volume}` : "Opening soon"}</small>
                </span>
                <span className={`market-odds ${market.mode === "field" ? "field-odds" : ""}`}>
                  {livePrices[market.id] || showSampleData ? (
                    market.outcomes.slice(0, market.mode === "field" ? 3 : 2).map((item, outcomeIndex) => (
                      <span className="outcome-quote" key={item.code}>
                        <em>{item.code}</em><strong>{Math.round((livePrices[market.id]?.[outcomeIndex] ?? item.price * 10_000) / 100)}¢</strong>
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
              <span className="ticket-code">{selected.code} / {siteConfig.collateralSymbol}</span>
            </div>
            <div className={`selected-market ${selected.mode === "field" ? "field" : ""}`}>
              <MarketVisual
                market={selected}
                compact
                showPricing={showSelectedPricing}
                prices={selectedPrices?.map((price) => price / 10_000)}
              />
              <div>
                <span>{selected.mode.replaceAll("-", " ")} · resolves {selected.closes}</span>
                <h3>{selected.question}</h3>
              </div>
            </div>

            <div className="rail-selector" role="group" aria-label="Order type">
              {(["market", "limit", "liquidity"] as const).map((type) => (
                <button
                  className={orderType === type ? "active" : ""}
                  key={type}
                  type="button"
                  onClick={() => setOrderType(type)}
                >
                  <span>{type === "market" ? "Market" : type === "limit" ? "Limit" : "Liquidity"}</span>
                  <small>
                    {type === "market"
                      ? "Fill from pool"
                      : type === "limit" ? "Set max price" : "Earn LP share"}
                  </small>
                </button>
              ))}
            </div>

            <p className="ticket-note ticket-note-top">
              {orderType === "liquidity"
                ? "Supply USDG to deepen every outcome. Withdrawals merge balanced inventory back into USDG."
                : "0% BID protocol fee at launch. Orders use USDG collateral; Robinhood Chain gas still applies."}
            </p>
            {orderType !== "liquidity" && (
              <div className={`outcome-picker ${selected.mode === "field" ? "field-picker" : ""}`}>
                {selected.outcomes.map((item, index) => (
                  <button
                    className={`${item.tone} ${selectedOutcome === index ? "active" : ""}`}
                    key={item.code}
                    type="button"
                    onClick={() => setSelectedOutcome(index)}
                  >
                    <span>{selected.mode === "yes-no" ? `Buy ${item.label}` : item.label}</span>
                    {showSelectedPricing
                      ? <strong>{Math.round((selectedPrices?.[index] ?? item.price * 10_000) / 100)}¢</strong>
                      : <LockedValue />}
                    {selected.mode === "field" && <small>{item.code}</small>}
                  </button>
                ))}
              </div>
            )}
            {orderType === "liquidity" && (
              <div className="liquidity-selector" role="group" aria-label="Liquidity action">
                {(["add", "remove"] as const).map((action) => (
                  <button
                    className={liquidityAction === action ? "active" : ""}
                    key={action}
                    type="button"
                    onClick={() => setLiquidityAction(action)}
                  >
                    <span>{action === "add" ? "Add liquidity" : "Withdraw"}</span>
                    <small>{action === "add" ? "USDG → BID-LP" : "BID-LP → USDG"}</small>
                  </button>
                ))}
              </div>
            )}
            {orderType === "limit" && (
              <label className="limit-price-row" htmlFor="limit-price">
                <span>Max price</span>
                <span className="limit-price-input">
                  <input
                    id="limit-price"
                    inputMode="decimal"
                    min="0.01"
                    max="99.99"
                    step="0.01"
                    value={limitPrice}
                    onChange={(event) => setLimitPrice(event.target.value.replace(/[^\d.]/g, ""))}
                    aria-label="Limit price in cents"
                  />
                  <em>¢</em>
                </span>
              </label>
            )}
            <label className="amount-label" htmlFor="trade-amount">
              <span>
                {orderType === "liquidity"
                  ? liquidityAction === "add" ? "USDG to supply" : "LP shares to withdraw"
                  : "Trade amount"}
              </span>
              <small>
                {orderType === "liquidity" ? `BID-LP ${lpBalanceDisplay}` : walletConnected ? truncateAddress(walletAddress) : "Connect wallet"}
              </small>
            </label>
            <div className="amount-input">
              <span>{orderType === "liquidity" && liquidityAction === "remove" ? "LP" : "$"}</span>
              <input
                id="trade-amount"
                inputMode="decimal"
                min="0"
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
                aria-label={orderType === "liquidity" && liquidityAction === "remove"
                  ? "BID-LP shares to withdraw"
                  : `Amount in ${siteConfig.collateralSymbol}`}
              />
              <em>{orderType === "liquidity" && liquidityAction === "remove" ? "BID-LP" : siteConfig.collateralSymbol}</em>
            </div>
            <div className="quick-amounts">
              {[25, 100, 250, 500].map((value) => (
                <button key={value} type="button" onClick={() => setAmount(String(value))}>${value}</button>
              ))}
              {orderType === "liquidity" && liquidityAction === "remove" && currentLpPosition && (
                <button
                  className="max-amount"
                  type="button"
                  onClick={() => setAmount(formatUnits(currentLpPosition.balance, currentLpPosition.decimals))}
                >
                  Max
                </button>
              )}
            </div>

            {orderType === "liquidity" ? (
              <>
                <div className="quote-lines">
                  <p><span>Your position</span><strong>{lpBalanceDisplay} BID-LP</strong></p>
                  <p><span>Genesis LP fee</span><strong>0.00%</strong></p>
                  <p><span>Slippage guard</span><strong>0.50%</strong></p>
                  <p><span>Network</span><strong>{siteConfig.networkName}</strong></p>
                </div>
                <div className="return-box liquidity-return">
                  <span>{liquidityAction === "add" ? "ESTIMATED LP SHARES" : "ESTIMATED USDG WITHDRAWAL"}</span>
                  <strong>{liquidityPrimaryDisplay}</strong>
                  <small>
                    {liquidityAction === "add"
                      ? `${liquidityResidualDisplay} excess outcome inventory`
                      : `${liquidityResidualDisplay} residual outcome position`}
                  </small>
                </div>
              </>
            ) : (
              <>
                <div className="quote-lines">
                  <p><span>{orderType === "market" ? `${outcome.label} pool price` : "Limit price"}</span>{showSelectedPricing || orderType === "limit" ? <strong>{Math.round(quote.price * 10000) / 100}¢</strong> : <LockedValue />}</p>
                  <p><span>Protocol fee</span><strong>0.00%</strong></p>
                  <p><span>Est. contracts</span>{showSelectedPricing || orderType === "limit" ? <strong>{quote.contracts.toFixed(2)}</strong> : <LockedValue />}</p>
                  <p><span>Network</span><strong>{siteConfig.networkName}</strong></p>
                </div>

                <div className="return-box">
                  <span>YOU RECEIVE IF {outcome.label.toUpperCase()} WINS</span>
                  {showSelectedPricing || orderType === "limit" ? (
                    <>
                      <strong>${quote.contracts.toFixed(2)}</strong>
                      <small>+${quote.profit.toFixed(2)} potential profit</small>
                    </>
                  ) : (
                    <>
                      <LockedValue />
                      <small>Quotes open with funded pools</small>
                    </>
                  )}
                </div>
              </>
            )}

            <button className="review-button" type="button" onClick={reviewOrder} disabled={transactionPending}>
              {transactionPending
                ? "Waiting for confirmation"
                : walletConnected
                  ? orderType === "liquidity"
                    ? liquidityAction === "add" ? "Add liquidity" : "Withdraw liquidity"
                    : `${orderType === "market" ? "Buy" : "Place limit"} ${outcome.label}`
                  : "Connect wallet"}
              <span>→</span>
            </button>
            {!marketContractConfigured && (
              <p className="integration-status">This pool is in prelaunch. Add its deployed address to turn on real quotes and order signing.</p>
            )}
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
            <p>Trade a YES/NO question, a city matchup, or a finite field backed one-for-one by USDG.</p>
          </article>
          <article>
            <span>02 / POOL</span>
            <strong>Price against the LP</strong>
            <p>A fixed-product market maker turns pooled outcome inventory into live odds and deeper fills.</p>
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
          <div className="settle-flow"><span>Housing index</span><i>→</i><span>Oracle attestation</span><i>→</i><span>Robinhood Chain</span></div>
        </div>
        <div className="revenue-panel" id="flywheel">
          <div className="revenue-copy">
            <span className="section-kicker">THE BID FLYWHEEL</span>
            <h3>Volume feeds depth.<br />Depth feeds volume.</h3>
            <p>
              $BID launches on Pons with a creator tax fixed at 2.5%. Creator-tax
              proceeds are routed evenly into prediction-market rewards and protocol-owned
              liquidity, tightening fills as the market grows.
            </p>
            <a
              className="protocol-proof"
              href={`${siteConfig.explorerUrl}/address/${siteConfig.ponsFactory}`}
              target="_blank"
              rel="noreferrer"
            >
              Pons v2 factory · Chain {siteConfig.robinhoodChainId} ↗
            </a>
          </div>
          <div className="fee-grid" aria-label="Pons creator-tax allocation">
            <article className="platform-fee"><strong>{creatorTaxPercent}%</strong><span>Pons creator tax · fixed at token launch</span></article>
            <article><strong>{rewardsPercent}%</strong><span>Trade value → prediction-market rewards</span></article>
            <article><strong>{liquidityPercent}%</strong><span>Trade value → prediction-market LP</span></article>
          </div>
        </div>
      </section>

      <section className="portfolio-tease" id="creator-markets">
        <span>ROADMAP / TOKEN-GATED CREATION</span>
        <h2>Hold. Burn.<br />Own the market.</h2>
        <p>Community launchers will hold a minimum $BID balance, burn a small launch amount, and earn a capped creator royalty from the markets they originate.</p>
        <div className="creator-roadmap" aria-label="Future creator market mechanics">
          <span><strong>01</strong> Hold $BID</span>
          <span><strong>02</strong> Burn to launch</span>
          <span><strong>03</strong> Earn royalties</span>
        </div>
        <button type="button" disabled>Creator markets · coming later</button>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top"><BrandMark /><span>BID</span></a>
        <p>Real estate prediction markets on Robinhood Chain. $BID on Pons.</p>
        <div>
          <a href="#markets">Markets</a>
          <a href="#how-it-works">How it works</a>
          <a href="/docs">Docs</a>
          {contractAddress && (
            <button className="footer-ca" type="button" onClick={copyContractAddress}>
              CA {truncateAddress(contractAddress)}
            </button>
          )}
        </div>
        <small>© 2026 BID · NOT INVESTMENT ADVICE</small>
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
            <span className="modal-kicker">ROBINHOOD CHAIN WALLET</span>
            <h2 id="wallet-title">Connect your wallet</h2>
            <p>BID supports injected EVM wallets and will switch or add Robinhood Chain after you approve the connection.</p>
            <button className="wallet-choice" type="button" onClick={connectWallet}>
              <span className="wallet-icon robinhood-dot">RH</span><strong>Browser wallet</strong><em>Connect</em>
            </button>
            <small>No private keys. No seed phrases. Orders only activate for deployed and funded BID pools.</small>
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
