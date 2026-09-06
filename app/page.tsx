"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  createWalletClient,
  custom,
  formatUnits,
  parseAbiItem,
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
import { isDemo, isLive } from "@/lib/launchState";
import { siteConfig } from "@/lib/site";
import pointsPolicy from "@/config/bid-points-policy-v1.json";

type Tone = "coral" | "mint" | "violet" | "gold";
type OrderType = "market" | "limit" | "liquidity";
type LiquidityAction = "add" | "remove";
type MarketReadStatus = "awaiting" | "loading" | "ready" | "error";

type FlywheelProof = {
  gross: bigint;
  lpRewards: bigint;
  marketLiquidity: bigint;
  buybackBurn: bigint;
  treasury: bigint;
  creatorRewards: bigint;
  latestTransaction: string;
};

type ActivityLeader = {
  address: string;
  volume: bigint;
  trades: number;
};

type MarketActivity = {
  decimals: number;
  marketBacking: bigint;
  feeReceiver: bigint;
  lpRewardsReserve: bigint;
  liquidityReserve: bigint;
  buybackReserve: bigint;
  treasury: bigint;
  creatorRewardsReserve: bigint;
  trackedTotal: bigint;
  totalVolume: bigint;
  tradeCount: number;
  traderCount: number;
  leaders: ActivityLeader[];
};

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
    id: "miami-up-sep30",
    contractAddress: siteConfig.marketAddresses.miamiTampa,
    code: "MIA / SEP 30",
    mode: "yes-no",
    question: "Will Miami's home-price index rise by September 30?",
    short: "Miami monthly home-price direction",
    outcomes: [
      { label: "Yes", code: "YES", price: 0.5, tone: "mint" },
      { label: "No", code: "NO", price: 0.5, tone: "coral" },
    ],
    volume: "—",
    liquidity: "25 USDG",
    closes: "Sep 30, 2026",
    signal: "Parcl ID 5352987",
    chart: [28, 31, 29, 35, 38, 36, 43, 41, 47, 52, 49, 55, 59, 57, 63, 68, 65, 71, 74, 72, 78, 82, 79, 86],
  },
  {
    id: "city-field-eoy",
    contractAddress: siteConfig.marketAddresses.cityField,
    code: "CITY / 6 MONTHS",
    mode: "field",
    question: "Which city posts the highest home-price growth from September 2026 to March 2027?",
    short: "Five-city housing outlook",
    outcomes: [
      { label: "Miami", code: "MIA", price: 0.31, tone: "coral" },
      { label: "Tampa", code: "TPA", price: 0.24, tone: "mint" },
      { label: "New York", code: "NYC", price: 0.18, tone: "violet" },
      { label: "Dallas", code: "DAL", price: 0.15, tone: "gold" },
      { label: "Phoenix", code: "PHX", price: 0.12, tone: "coral" },
    ],
    volume: "$2.42M",
    liquidity: "$618K",
    closes: "Mar 5, 2027",
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
const betaMarketId = "miami-up-sep30";
const feeAllocatedEvent = parseAbiItem(
  "event FeeAllocated(bytes32 indexed allocationVersion,address indexed asset,uint256 grossAmount,uint256 lpRewardsAmount,uint256 marketLiquidityAmount,uint256 buybackBurnAmount,uint256 treasuryAmount,uint256 creatorRewardsAmount)",
);
const tradeEvent = parseAbiItem(
  "event Trade(address indexed trader,bool indexed isBuy,uint256 indexed outcomeIndex,uint256 collateralAmount,uint256 outcomeTokenAmount,uint256 creatorFee)",
);
const activityPointUnit = BigInt(pointsPolicy.tradeVolumeAtomicPerPoint);

function truncateAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function displayTokenAmount(value: bigint, decimals: number, maximumFractionDigits = 2) {
  return Number(formatUnits(value, decimals)).toLocaleString("en-US", {
    maximumFractionDigits,
  });
}

function displayCloseDate(timestamp: bigint) {
  return new Date(Number(timestamp) * 1_000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function providerErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? Number((error as { code?: unknown }).code)
    : undefined;
}

type EventProvider = EIP1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  providers?: EventProvider[];
  isMetaMask?: boolean;
  isRabby?: boolean;
  isPhantom?: boolean;
  disconnect?: () => Promise<void>;
};

type WalletOption = {
  id: string;
  name: "MetaMask" | "Rabby" | "Phantom" | "Browser wallet";
  provider: EventProvider;
};

type Eip6963Detail = {
  info: { uuid: string; name: string; rdns: string };
  provider: EventProvider;
};

function walletName(provider: EventProvider, announcedName = "", rdns = ""): WalletOption["name"] {
  const identity = `${announcedName} ${rdns}`.toLowerCase();
  if (provider.isRabby || identity.includes("rabby")) return "Rabby";
  if (provider.isPhantom || identity.includes("phantom")) return "Phantom";
  if (provider.isMetaMask || identity.includes("metamask")) return "MetaMask";
  return "Browser wallet";
}

async function selectRobinhoodChain(provider: EIP1193Provider) {
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

function LockedValue({
  children = siteConfig.isTradingEnabled ? "Awaiting liquidity" : "Trading paused",
}: { children?: string }) {
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
  const [selectedId, setSelectedId] = useState(betaMarketId);
  const [filter, setFilter] = useState<(typeof filters)[number]>("All markets");
  const [selectedOutcome, setSelectedOutcome] = useState(0);
  const [amount, setAmount] = useState(isDemo ? "250" : "");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [liquidityAction, setLiquidityAction] = useState<LiquidityAction>("add");
  const [limitPrice, setLimitPrice] = useState("50");
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletOptions, setWalletOptions] = useState<WalletOption[]>([]);
  const [activeProvider, setActiveProvider] = useState<EventProvider | null>(null);
  const [activeWalletName, setActiveWalletName] = useState<WalletOption["name"] | "">("");
  const [notice, setNotice] = useState("");
  const [lastTransaction, setLastTransaction] = useState<Hex | "">("");
  const [transactionPending, setTransactionPending] = useState(false);
  const [faucetPending, setFaucetPending] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [livePrices, setLivePrices] = useState<Record<string, number[]>>({});
  const [liveCloseDates, setLiveCloseDates] = useState<Record<string, string>>({});
  const [marketReadStatus, setMarketReadStatus] = useState<MarketReadStatus>("awaiting");
  const [flywheelProof, setFlywheelProof] = useState<FlywheelProof | null>(null);
  const [marketActivity, setMarketActivity] = useState<MarketActivity | null>(null);
  const [marketActivityUnavailable, setMarketActivityUnavailable] = useState(false);
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
  const [walletMarketState, setWalletMarketState] = useState<{
    key: string;
    collateralBalance: bigint;
    outcomeBalances: bigint[];
    decimals: number;
    resolved: boolean;
  } | null>(null);
  const [liquidityQuote, setLiquidityQuote] = useState<{
    key: string;
    primaryAmount: bigint;
    residualAmounts: readonly bigint[];
    decimals: number;
  } | null>(null);
  const creatorTaxPercent = siteConfig.creatorTaxBps / 100;
  const verifiedPonsLive = isLive && !siteConfig.isTestnet && siteConfig.isPonsVerified;

  const selected = markets.find((market) => market.id === selectedId) ?? markets[0];
  const selectedMarketAddress = configuredAddress(selected.contractAddress);
  const marketContractConfigured = selectedMarketAddress !== null;
  const outcome = selected.outcomes[selectedOutcome] ?? selected.outcomes[0];
  const displayedMarkets = markets
    .filter((market) => matchesFilter(market, filter))
    .sort((left, right) => Number(right.id === betaMarketId) - Number(left.id === betaMarketId));
  const betaMarketFunded = Boolean(livePrices[betaMarketId]);
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
  const walletMarketKey = `${selected.id}:${walletAddress}`;
  const currentLpPosition = lpPosition?.key === lpPositionKey ? lpPosition : null;
  const currentWalletMarket = walletMarketState?.key === walletMarketKey ? walletMarketState : null;
  const selectedOutcomeBalance = currentWalletMarket?.outcomeBalances[selectedOutcome] ?? 0n;
  const hasRedeemablePosition = Boolean(
    currentWalletMarket?.resolved && currentWalletMarket.outcomeBalances.some((balance) => balance > 0n),
  );
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

  const disconnectWallet = () => {
    const provider = activeProvider;
    setWalletConnected(false);
    setWalletAddress("");
    setActiveProvider(null);
    setActiveWalletName("");
    setWalletOpen(false);
    setLastTransaction("");
    setLpPosition(null);
    setWalletMarketState(null);
    setNotice("Wallet disconnected from BID.");

    if (provider) {
      void (async () => {
        try {
          await provider.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
          return;
        } catch {
          // Fall through to wallet-specific disconnect methods.
        }
        try {
          if (provider.disconnect) await provider.disconnect();
          else await provider.request({ method: "wallet_disconnect" });
        } catch {
          // The BID session is already cleared even when a wallet does not
          // implement programmatic permission revocation.
        }
      })();
    }
  };

  useEffect(() => {
    const discovered = new Set<EventProvider>();
    const addProvider = (provider: EventProvider, id: string, announcedName = "", rdns = "") => {
      if (discovered.has(provider)) return;
      discovered.add(provider);
      setWalletOptions((current) => [...current, {
        id,
        name: walletName(provider, announcedName, rdns),
        provider,
      }]);
    };
    const handleAnnouncement = (event: Event) => {
      const detail = (event as CustomEvent<Eip6963Detail>).detail;
      if (detail?.provider && detail.info) {
        addProvider(detail.provider, detail.info.uuid, detail.info.name, detail.info.rdns);
      }
    };

    window.addEventListener("eip6963:announceProvider", handleAnnouncement);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    const injected = window.ethereum as EventProvider | undefined;
    for (const [index, provider] of (injected?.providers ?? (injected ? [injected] : [])).entries()) {
      addProvider(provider, `injected-${index}`);
    }

    return () => window.removeEventListener("eip6963:announceProvider", handleAnnouncement);
  }, []);

  useEffect(() => {
    const provider = activeProvider;
    if (!provider) return;

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = Array.isArray(args[0]) ? args[0] as string[] : [];
      const address = accounts[0] ?? "";
      setWalletAddress(address);
      setWalletConnected(Boolean(address));
    };
    const handleChainChanged = (...args: unknown[]) => {
      const chainHex = String(args[0] ?? "");
      if (chainHex.toLowerCase() !== siteConfig.robinhoodChainHex) {
        setWalletConnected(false);
        setNotice(`Wallet network changed. Switch back to ${siteConfig.networkName} before signing.`);
      }
    };

    provider.on?.("accountsChanged", handleAccountsChanged);
    provider.on?.("chainChanged", handleChainChanged);
    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [activeProvider]);

  useEffect(() => {
    let cancelled = false;

    async function loadMarketPrices() {
      const configuredMarkets = markets.filter((market) => configuredAddress(market.contractAddress));
      if (configuredMarkets.length === 0) {
        setMarketReadStatus("awaiting");
        return;
      }
      setMarketReadStatus("loading");
      const loaded = await Promise.all(markets.map(async (market) => {
        const address = configuredAddress(market.contractAddress);
        if (!address) return null;

        try {
          const [prices, closesAt] = await Promise.all([
            robinhoodPublicClient.readContract({
              address,
              abi: bidMarketAbi,
              functionName: "spotPricesBps",
            }),
            robinhoodPublicClient.readContract({
              address,
              abi: bidMarketAbi,
              functionName: "closesAt",
            }),
          ]);
          return { id: market.id, prices: prices.map(Number), closes: displayCloseDate(closesAt) };
        } catch {
          return null;
        }
      }));

      if (cancelled) return;
      const available = loaded.filter((entry) => entry !== null);
      setLivePrices(Object.fromEntries(available.map((entry) => [entry.id, entry.prices])));
      setLiveCloseDates(Object.fromEntries(available.map((entry) => [entry.id, entry.closes])));
      setMarketReadStatus(available.length === configuredMarkets.length ? "ready" : "error");
    }

    void loadMarketPrices();
    return () => { cancelled = true; };
  }, [refreshNonce]);

  useEffect(() => {
    const marketAddress = configuredAddress(siteConfig.marketAddresses.miamiTampa);
    const collateralAddress = configuredAddress(siteConfig.collateralAddress);
    const deploymentBlock = siteConfig.marketDeploymentBlocks.miamiTampa;
    if (!marketAddress || !collateralAddress || !deploymentBlock) return;

    const balanceDestinations = [
      ["marketBacking", marketAddress],
      ["feeReceiver", configuredAddress(siteConfig.flywheelTreasuryAddress)],
      ["lpRewardsReserve", configuredAddress(siteConfig.rewardsVaultAddress)],
      ["liquidityReserve", configuredAddress(siteConfig.liquidityVaultAddress)],
      ["buybackReserve", configuredAddress(siteConfig.buybackVaultAddress)],
      ["treasury", configuredAddress(siteConfig.protocolTreasuryAddress)],
      ["creatorRewardsReserve", configuredAddress(siteConfig.creatorRewardsVaultAddress)],
    ] as const;

    let cancelled = false;
    async function loadMarketActivity() {
      try {
        const [decimals, logs, balanceEntries] = await Promise.all([
          robinhoodPublicClient.readContract({
            address: collateralAddress!,
            abi: erc20TradeAbi,
            functionName: "decimals",
          }),
          robinhoodPublicClient.getLogs({
            address: marketAddress!,
            event: tradeEvent,
            fromBlock: BigInt(deploymentBlock),
          }),
          Promise.all(balanceDestinations.map(async ([key, address]) => [
            key,
            address
              ? await robinhoodPublicClient.readContract({
                address: collateralAddress!,
                abi: erc20TradeAbi,
                functionName: "balanceOf",
                args: [address],
              })
              : 0n,
          ] as const)),
        ]);

        const balances = Object.fromEntries(balanceEntries) as Record<string, bigint>;
        const traders = new Map<string, ActivityLeader>();
        let totalVolume = 0n;

        for (const log of logs) {
          const trader = log.args.trader;
          const collateralAmount = log.args.collateralAmount ?? 0n;
          if (!trader) continue;
          const key = trader.toLowerCase();
          const current = traders.get(key) ?? { address: trader, volume: 0n, trades: 0 };
          current.volume += collateralAmount;
          current.trades += 1;
          traders.set(key, current);
          totalVolume += collateralAmount;
        }

        const trackedTotal = balanceEntries.reduce((total, [, balance]) => total + balance, 0n);
        const leaders = [...traders.values()]
          .sort((left, right) => left.volume === right.volume
            ? left.address.localeCompare(right.address)
            : left.volume > right.volume ? -1 : 1)
          .slice(0, 5);

        if (!cancelled) {
          setMarketActivity({
            decimals,
            marketBacking: balances.marketBacking ?? 0n,
            feeReceiver: balances.feeReceiver ?? 0n,
            lpRewardsReserve: balances.lpRewardsReserve ?? 0n,
            liquidityReserve: balances.liquidityReserve ?? 0n,
            buybackReserve: balances.buybackReserve ?? 0n,
            treasury: balances.treasury ?? 0n,
            creatorRewardsReserve: balances.creatorRewardsReserve ?? 0n,
            trackedTotal,
            totalVolume,
            tradeCount: logs.length,
            traderCount: traders.size,
            leaders,
          });
          setMarketActivityUnavailable(false);
        }
      } catch {
        if (!cancelled) setMarketActivityUnavailable(true);
      }
    }

    void loadMarketActivity();
    return () => { cancelled = true; };
  }, [refreshNonce]);

  useEffect(() => {
    const treasuryAddress = configuredAddress(siteConfig.flywheelTreasuryAddress);
    const collateralAddress = configuredAddress(siteConfig.collateralAddress);
    if (!treasuryAddress || !collateralAddress || !siteConfig.flywheelDeploymentBlock) return;

    let cancelled = false;
    void robinhoodPublicClient.getLogs({
      address: treasuryAddress,
      event: feeAllocatedEvent,
      args: { asset: collateralAddress },
      fromBlock: BigInt(siteConfig.flywheelDeploymentBlock),
    }).then((logs) => {
      if (cancelled) return;
      const proof = logs.reduce<FlywheelProof>((total, log) => ({
        gross: total.gross + (log.args.grossAmount ?? 0n),
        lpRewards: total.lpRewards + (log.args.lpRewardsAmount ?? 0n),
        marketLiquidity: total.marketLiquidity + (log.args.marketLiquidityAmount ?? 0n),
        buybackBurn: total.buybackBurn + (log.args.buybackBurnAmount ?? 0n),
        treasury: total.treasury + (log.args.treasuryAmount ?? 0n),
        creatorRewards: total.creatorRewards + (log.args.creatorRewardsAmount ?? 0n),
        latestTransaction: log.transactionHash ?? total.latestTransaction,
      }), {
        gross: 0n,
        lpRewards: 0n,
        marketLiquidity: 0n,
        buybackBurn: 0n,
        treasury: 0n,
        creatorRewards: 0n,
        latestTransaction: "",
      });
      setFlywheelProof(proof);
    }).catch(() => {
      if (!cancelled) setFlywheelProof(null);
    });

    return () => { cancelled = true; };
  }, [refreshNonce]);

  useEffect(() => {
    let cancelled = false;
    const collateralAmount = Number(amount);

    if (
      orderType === "liquidity" ||
      !selectedMarketAddress ||
      !Number.isFinite(collateralAmount) ||
      collateralAmount < siteConfig.minTradeAmount ||
      collateralAmount > siteConfig.maxTradeAmount
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
    const account = configuredAddress(walletAddress);

    if (!selectedMarketAddress || !account || !walletConnected) {
      return;
    }

    async function loadWalletMarketState() {
      try {
        const collateral = await robinhoodPublicClient.readContract({
          address: selectedMarketAddress!,
          abi: bidMarketAbi,
          functionName: "collateral",
        });
        const [decimals, collateralBalance, resolved, ...outcomeBalances] = await Promise.all([
          robinhoodPublicClient.readContract({ address: collateral, abi: erc20TradeAbi, functionName: "decimals" }),
          robinhoodPublicClient.readContract({ address: collateral, abi: erc20TradeAbi, functionName: "balanceOf", args: [account!] }),
          robinhoodPublicClient.readContract({ address: selectedMarketAddress!, abi: bidMarketAbi, functionName: "resolved" }),
          ...selected.outcomes.map((_, index) => robinhoodPublicClient.readContract({
            address: selectedMarketAddress!,
            abi: bidMarketAbi,
            functionName: "outcomeBalanceOf",
            args: [account!, BigInt(index)],
          })),
        ]);
        if (!cancelled) {
          setWalletMarketState({
            key: walletMarketKey,
            collateralBalance,
            outcomeBalances,
            decimals,
            resolved,
          });
        }
      } catch {
        if (!cancelled) setWalletMarketState(null);
      }
    }

    void loadWalletMarketState();
    return () => { cancelled = true; };
  }, [refreshNonce, selected.outcomes, selectedMarketAddress, walletAddress, walletConnected, walletMarketKey]);

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
    if (market.id !== betaMarketId) {
      setNotice(`${market.short} is coming soon. The Miami YES / NO market is the only live beta market.`);
      return;
    }
    setSelectedId(market.id);
    setSelectedOutcome(0);
  };

  const connectWallet = async (option: WalletOption) => {
    const provider = option.provider;
    try {
      try {
        await provider.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
      } catch (error) {
        if (providerErrorCode(error) === 4001) throw error;
        // Some EVM wallets do not implement permission re-selection. Their
        // normal account request and accountsChanged event remain available.
      }
      const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
      const address = accounts[0] ?? "";

      if (!address) {
        setNotice("The wallet connected, but no account was returned.");
        return;
      }

      await selectRobinhoodChain(provider);

      setActiveProvider(provider);
      setActiveWalletName(option.name);
      setWalletConnected(true);
      setWalletAddress(address);
      setWalletOpen(false);
      setNotice(`${option.name} connected: ${truncateAddress(address)}. Robinhood Chain selected; no signature requested.`);
    } catch {
      setNotice("Wallet connection or network switching was cancelled.");
    }
  };

  const reviewOrder = async () => {
    if (!siteConfig.isTradingEnabled) {
      setNotice("Trading is paused while BID prepares the shorter $5–$50 beta market.");
      return;
    }

    if (!walletConnected) {
      setWalletOpen(true);
      return;
    }

    const account = configuredAddress(walletAddress);
    const provider = activeProvider;
    if (!selectedMarketAddress || !account || !provider) {
      setNotice("Wallet connected. This market is not deployed yet, so no transaction was built.");
      return;
    }

    let providerAccounts: string[];
    try {
      providerAccounts = await provider.request({ method: "eth_accounts" }) as string[];
    } catch {
      setNotice("Could not verify the selected wallet. Disconnect and choose it again.");
      return;
    }
    if (providerAccounts[0]?.toLowerCase() !== account.toLowerCase()) {
      setWalletAddress(providerAccounts[0] ?? "");
      setWalletConnected(Boolean(providerAccounts[0]));
      setNotice("The selected wallet account changed. Review the updated account, then submit again.");
      return;
    }

    if (!amount || Number(amount) < siteConfig.minTradeAmount) {
      setNotice(`Beta orders start at ${siteConfig.minTradeAmount} ${siteConfig.collateralSymbol}.`);
      return;
    }
    if (orderType !== "liquidity" && Number(amount) > siteConfig.maxTradeAmount) {
      setNotice(`Beta orders are capped at ${siteConfig.maxTradeAmount} ${siteConfig.collateralSymbol}.`);
      return;
    }

    const priceBps = BigInt(Math.round(Number(limitPrice) * 100));
    if (orderType === "limit" && (priceBps <= 0n || priceBps >= 10_000n)) {
      setNotice("Set a limit price between 0.01c and 99.99c.");
      return;
    }

    setTransactionPending(true);
    try {
      await selectRobinhoodChain(provider);
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
      let limitMinOutcomeTokensOut = 0n;

      if (orderType === "limit") {
        limitMinOutcomeTokensOut = (inputAmount * 10_000n + priceBps - 1n) / priceBps;
        const [quotedTokens] = await robinhoodPublicClient.readContract({
          address: selectedMarketAddress,
          abi: bidMarketAbi,
          functionName: "quoteBuy",
          args: [inputAmount, BigInt(selectedOutcome)],
        });

        if (quotedTokens < limitMinOutcomeTokensOut) {
          setNotice(
            `The pool cannot fill this order at ${limitPrice}¢ or better right now. No approval or order was submitted.`,
          );
          return;
        }
      }

      const needsCollateralApproval = orderType !== "liquidity" || liquidityAction === "add";

      if (needsCollateralApproval) {
        const collateralBalance = await robinhoodPublicClient.readContract({
          address: collateral,
          abi: erc20TradeAbi,
          functionName: "balanceOf",
          args: [account],
        });
        if (collateralBalance < inputAmount) {
          setNotice(
            `Insufficient ${siteConfig.collateralSymbol}. This order needs ${amount} ${siteConfig.collateralSymbol}; `
            + `your wallet has ${formatUnits(collateralBalance, decimals)} ${siteConfig.collateralSymbol}.`,
          );
          return;
        }

        const nativeBalance = await robinhoodPublicClient.getBalance({ address: account });
        if (nativeBalance === 0n) {
          setNotice(`This wallet needs ETH on ${siteConfig.networkName} to pay transaction gas.`);
          return;
        }
      }

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
          const approvalReceipt = await robinhoodPublicClient.waitForTransactionReceipt({ hash: approvalHash });
          if (approvalReceipt.status !== "success") {
            throw new Error(`${siteConfig.collateralSymbol} approval reverted.`);
          }
          setNotice(`${siteConfig.collateralSymbol} approved. Confirm the market action in your wallet.`);
        }
      }

      setNotice(
        orderType === "liquidity"
          ? `Confirm the liquidity ${liquidityAction === "add" ? "deposit" : "withdrawal"}.`
          : orderType === "market" ? "Confirm the market order." : "Confirm the price-limited order.",
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
        transactionHash = await walletClient.writeContract({
          address: selectedMarketAddress,
          abi: bidMarketAbi,
          functionName: "buy",
          args: [inputAmount, BigInt(selectedOutcome), limitMinOutcomeTokensOut],
        });
      }

      const transactionReceipt = await robinhoodPublicClient.waitForTransactionReceipt({ hash: transactionHash });
      if (transactionReceipt.status !== "success") {
        throw new Error("The market transaction reverted. No order was placed.");
      }
      setRefreshNonce((value) => value + 1);
      setLastTransaction(transactionHash);
      const actionLabel = orderType === "liquidity"
        ? `Liquidity ${liquidityAction === "add" ? "added" : "withdrawn"}`
        : orderType === "market" ? "Market order filled" : "Price-limited order filled";
      setNotice(`${actionLabel}. Transaction ${truncateAddress(transactionHash)} confirmed.`);
    } catch (error) {
      const message = error instanceof Error
        ? ("shortMessage" in error ? String(error.shortMessage) : error.message)
        : "The transaction was cancelled or reverted.";
      setNotice(message);
    } finally {
      setTransactionPending(false);
    }
  };

  const redeemPosition = async () => {
    const account = configuredAddress(walletAddress);
    const provider = activeProvider;
    if (!selectedMarketAddress || !account || !provider || !hasRedeemablePosition) return;

    setTransactionPending(true);
    try {
      await selectRobinhoodChain(provider);
      const walletClient = createWalletClient({ account, chain: robinhoodChain, transport: custom(provider) });
      setNotice("Confirm redemption in your wallet.");
      const transactionHash = await walletClient.writeContract({
        address: selectedMarketAddress,
        abi: bidMarketAbi,
        functionName: "redeem",
      });
      const receipt = await robinhoodPublicClient.waitForTransactionReceipt({ hash: transactionHash });
      if (receipt.status !== "success") throw new Error("Redemption reverted.");
      setLastTransaction(transactionHash);
      setRefreshNonce((value) => value + 1);
      setNotice(`Winning position redeemed. Transaction ${truncateAddress(transactionHash)} confirmed.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Redemption was cancelled or reverted.");
    } finally {
      setTransactionPending(false);
    }
  };

  const requestTestCollateral = async () => {
    if (!walletConnected) {
      setWalletOpen(true);
      return;
    }

    const account = configuredAddress(walletAddress);
    const collateralAddress = configuredAddress(siteConfig.collateralAddress);
    const provider = activeProvider;
    if (!siteConfig.isTestnet || !account || !collateralAddress || !provider) {
      setNotice("The test-collateral faucet will activate after the testnet deployment is connected.");
      return;
    }

    setFaucetPending(true);
    try {
      await selectRobinhoodChain(provider);
      const decimals = await robinhoodPublicClient.readContract({
        address: collateralAddress,
        abi: erc20TradeAbi,
        functionName: "decimals",
      });
      const walletClient = createWalletClient({
        account,
        chain: robinhoodChain,
        transport: custom(provider),
      });
      const hash = await walletClient.writeContract({
        address: collateralAddress,
        abi: erc20TradeAbi,
        functionName: "faucet",
        args: [parseUnits("10000", decimals)],
      });
      await robinhoodPublicClient.waitForTransactionReceipt({ hash });
      setNotice(`10,000 ${siteConfig.collateralSymbol} minted. Transaction ${truncateAddress(hash)} confirmed.`);
    } catch (error) {
      const message = typeof error === "object" && error !== null && "shortMessage" in error
        ? String((error as { shortMessage: unknown }).shortMessage)
        : "The test-collateral faucet transaction was cancelled or reverted.";
      setNotice(message);
    } finally {
      setFaucetPending(false);
    }
  };

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="BID home">
          <BrandMark /><small>beta</small>
        </a>
        <nav className="desktop-nav" aria-label="Primary navigation">
          <a className="active" href="#markets">Markets</a>
          <a href="#how-it-works">How it works</a>
          <a href="#flywheel">Flywheel</a>
          <a href="/rewards">Rewards</a>
          <a href="/docs">Docs</a>
        </nav>
        <div className="header-actions">
          <span className="network-pill"><i /> {siteConfig.networkName}</span>
          <a className="pons-button" href={siteConfig.ponsUrl} target="_blank" rel="noreferrer">
            Pons ↗
          </a>
          <span className="wallet-controls">
            <button
              className={`wallet-button ${walletConnected ? "connected" : ""}`}
              type="button"
              onClick={() => setWalletOpen(true)}
              aria-label={walletConnected ? `Switch wallet from ${walletAddress}` : "Connect wallet"}
            >
              {walletConnected ? `${activeWalletName} ${truncateAddress(walletAddress)} · Switch` : "Connect wallet"}
            </button>
            {walletConnected && (
              <button className="wallet-disconnect" type="button" onClick={disconnectWallet} aria-label="Disconnect wallet" title="Disconnect wallet">×</button>
            )}
          </span>
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
            <div className="eyebrow"><span>BID</span> HOUSING MARKETS // {siteConfig.networkName.toUpperCase()}</div>
            <h1 id="hero-title">Real estate<br />prediction markets.</h1>
            <p>
              Trade where cities and home prices go next. Housing prediction markets on Robinhood Chain.
            </p>
          </div>
          <div className="hero-actions">
            <a className="primary-cta" href="#markets">Explore markets <span>↓</span></a>
            <a className="secondary-cta" href="#how-it-works">How it works <span>→</span></a>
          </div>
        </div>
        <div className="hero-status" aria-label="Protocol highlights">
          <span><i /> {!siteConfig.isTradingEnabled
            ? "Trading paused"
            : selectedPrices
            ? "AMM connected"
            : marketContractConfigured && marketReadStatus === "error"
              ? "Onchain read unavailable"
              : `${siteConfig.isTestnet ? "Testnet" : "Mainnet"} beta live`}</span>
          <span>0% BID market fee</span>
          <span>{creatorTaxPercent}% BID creator fee fuels the flywheel</span>
        </div>
      </section>

      <section className="ticker" aria-label="Platform statistics">
        {showSampleData ? (
          <>
            <div><SampleBadge /><span>24H VOLUME</span><strong>$6.4M</strong><em>+18.2%</em></div>
            <div><SampleBadge /><span>OPEN INTEREST</span><strong>$12.8M</strong><em>+6.4%</em></div>
            <div><SampleBadge /><span>ACTIVE MARKETS</span><strong>24</strong><em>12 cities</em></div>
            <div><SampleBadge /><span>BID CREATOR FEE</span><strong>1.5%</strong><em>fuels the flywheel</em></div>
          </>
        ) : (
          <div className="launch-strip">
            <span>USDG-BACKED MARKETS</span>
            <strong>{siteConfig.collateralSymbol}-backed finite-outcome pools.</strong>
            <em>1.5% BID creator fee → protocol flywheel</em>
          </div>
        )}
      </section>

      <section className="market-section" id="markets">
        <div className="section-heading">
          <div>
            <span className="section-kicker">THE BOARD</span>
            <h2>Price the city.</h2>
          </div>
          <p>One live beta market. Published Parcl housing data determines the outcome.</p>
        </div>

        <div className="market-stats" aria-label="Live market statistics">
          <div><span>MARKETS LIVE</span><strong>1</strong></div>
          <div><span>FORMAT</span><strong>YES / NO</strong></div>
          <div>
            <span>USDG BACKING</span>
            <strong>
              {marketActivity
                ? displayTokenAmount(marketActivity.marketBacking, marketActivity.decimals, 2)
                : "—"} <small>USDG</small>
            </strong>
          </div>
          <div><span>ORDER SIZE</span><strong>$5</strong></div>
        </div>

        <div className="beta-market-banner" aria-label="Beta market availability">
          <span><i />ONE MARKET LIVE</span>
          <strong>MIAMI HOME-PRICE DIRECTION</strong>
          <small>$5 ORDERS · 25 USDG INITIAL LIQUIDITY</small>
          <em>PUBLIC BETA</em>
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
            {displayedMarkets.map((market, index) => {
              const isBetaMarket = market.id === betaMarketId;
              const isMarketEnabled = isBetaMarket && siteConfig.isTradingEnabled;
              return (
              <button
                className={`market-card ${isMarketEnabled ? "beta-market" : isBetaMarket ? "paused-market" : "coming-soon"} ${isMarketEnabled && selectedId === market.id ? "selected" : ""}`}
                key={market.id}
                type="button"
                onClick={isMarketEnabled ? () => chooseMarket(market) : undefined}
                disabled={!isMarketEnabled}
                aria-pressed={selectedId === market.id}
                aria-disabled={!isMarketEnabled}
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
                    {isBetaMarket && !siteConfig.isTradingEnabled
                      ? <em>{betaMarketFunded ? "Retiring · Trading paused" : "Retired"}</em>
                      : livePrices[market.id]
                      ? <em>Open · Beta</em>
                      : showSampleData
                        ? <em><SampleBadge compact /> {market.signal}</em>
                        : configuredAddress(market.contractAddress) && marketReadStatus === "error"
                          ? <em>Onchain read unavailable</em>
                          : <em>{isBetaMarket ? "Beta · Awaiting liquidity" : "Coming soon"}</em>}
                  </span>
                  <strong>{market.question}</strong>
                  <small>{isBetaMarket
                    ? siteConfig.isTradingEnabled
                      ? `Resolves ${liveCloseDates[market.id] ?? market.closes} · $5 per order · Parcl ID 5352987`
                      : "Trading paused"
                    : `Resolves ${market.closes} · Pool coming soon`}</small>
                  {!isMarketEnabled && (
                    <span className="market-lock">
                      {isBetaMarket ? "TRADING PAUSED" : "LOCKED · COMING SOON"}
                    </span>
                  )}
                </span>
                <span className={`market-odds ${market.mode === "field" ? "field-odds" : ""}`}>
                  {livePrices[market.id] || showSampleData ? (
                    market.outcomes.slice(0, market.mode === "field" ? 3 : 2).map((item, outcomeIndex) => (
                      <span className="outcome-quote" key={item.code}>
                        <em>{item.code}</em><strong>{Math.round((livePrices[market.id]?.[outcomeIndex] ?? item.price * 10_000) / 100)}¢</strong>
                      </span>
                    ))
                  ) : (
                    <span className="outcome-quote locked-quote">
                      <LockedValue>
                        {isBetaMarket ? siteConfig.isTradingEnabled ? "Awaiting liquidity" : "Trading paused" : "Coming soon"}
                      </LockedValue>
                    </span>
                  )}
                  {market.mode === "field" && <small>+2 more cities</small>}
                </span>
                <span className="select-arrow">{isMarketEnabled ? "↗" : isBetaMarket ? "PAUSED" : "LOCKED"}</span>
              </button>
              );
            })}
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
                <span>{selected.mode.replaceAll("-", " ")} · closes {liveCloseDates[selected.id] ?? selected.closes}</span>
                <h3>{selected.question}</h3>
              </div>
            </div>
            {selected.id === betaMarketId && (
              <p className="ticket-resolution">
                <strong>RESOLUTION</strong> Parcl Labs Miami City Sales Price Index · Parcl ID 5352987 · YES if Sep 30 is above Sep 6; otherwise NO.
              </p>
            )}

            {siteConfig.isTestnet && (
              <button
                className="testnet-faucet"
                type="button"
                onClick={requestTestCollateral}
                disabled={faucetPending || !siteConfig.collateralAddress}
              >
                <span>{faucetPending ? "Minting test collateral" : `Get 10,000 ${siteConfig.collateralSymbol}`}</span>
                <small>Test tokens only · one claim per hour</small>
              </button>
            )}

            <div className="rail-selector" role="group" aria-label="Order type">
              {(["market", "limit", "liquidity"] as const).map((type) => (
                <button
                  className={orderType === type ? "active" : ""}
                  key={type}
                  type="button"
                  disabled={!marketContractConfigured && !isDemo}
                  onClick={() => setOrderType(type)}
                >
                  <span>{type === "market" ? "Market" : type === "limit" ? "Limit" : "Liquidity"}</span>
                  <small>
                    {type === "market"
                      ? "Fill from pool"
                      : type === "limit" ? "Fill now or cancel" : "Own an LP share"}
                  </small>
                </button>
              ))}
            </div>

            <p className="ticket-note ticket-note-top">
              {!siteConfig.isTradingEnabled
                ? "Trading is paused. BID is preparing shorter UP / DOWN markets with a $5–$50 target order range."
                : orderType === "liquidity"
                ? `Supply ${siteConfig.collateralSymbol} to deepen every outcome and receive withdrawable BID-LP shares in this wallet. LP rewards remain reserve-only.`
                : orderType === "limit"
                ? "Set the highest average price you will pay. The order fills immediately at that price or better; otherwise nothing is submitted."
                : `0% BID market fee. Orders use ${siteConfig.collateralSymbol}; Pons and network fees may still apply.`}
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
                    <span className="outcome-name">
                      {selected.mode === "field" && <small>{item.code}</small>}
                      {selected.mode === "yes-no" ? `Buy ${item.label}` : item.label}
                    </span>
                    {showSelectedPricing
                      ? (
                        <strong>
                          {Math.round((selectedPrices?.[index] ?? item.price * 10_000) / 100)}¢
                          {selected.mode === "field" && (
                            <em>{Math.round((selectedPrices?.[index] ?? item.price * 10_000) / 100)}%</em>
                          )}
                        </strong>
                      )
                      : <LockedValue />}
                    {selected.mode === "field" && showSelectedPricing && (
                      <span className="outcome-meter">
                        <i style={{ width: `${Math.round((selectedPrices?.[index] ?? item.price * 10_000) / 100)}%` }} />
                      </span>
                    )}
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
                    <small>{action === "add" ? `${siteConfig.collateralSymbol} → BID-LP` : `BID-LP → ${siteConfig.collateralSymbol}`}</small>
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
                  ? liquidityAction === "add" ? `${siteConfig.collateralSymbol} to supply` : "LP shares to withdraw"
                  : "Trade amount"}
              </span>
              <small>
                {orderType === "liquidity"
                  ? `BID-LP ${lpBalanceDisplay}`
                  : currentWalletMarket
                    ? `${displayTokenAmount(currentWalletMarket.collateralBalance, currentWalletMarket.decimals, 4)} ${siteConfig.collateralSymbol} · ${truncateAddress(walletAddress)}`
                    : walletConnected ? truncateAddress(walletAddress) : "Connect wallet"}
              </small>
            </label>
            <div className="amount-input">
              <span>{orderType === "liquidity" && liquidityAction === "remove" ? "LP" : "$"}</span>
              <input
                id="trade-amount"
                inputMode="decimal"
                min={orderType === "liquidity" ? "0" : String(siteConfig.minTradeAmount)}
                max={orderType === "liquidity" ? undefined : siteConfig.maxTradeAmount}
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
                aria-label={orderType === "liquidity" && liquidityAction === "remove"
                  ? "BID-LP shares to withdraw"
                  : `Amount in ${siteConfig.collateralSymbol}`}
              />
              <em>{orderType === "liquidity" && liquidityAction === "remove" ? "BID-LP" : siteConfig.collateralSymbol}</em>
            </div>
            <div className="quick-amounts">
              {(orderType === "liquidity" ? [5, 10, 25] : [5]).map((value) => (
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
            {orderType !== "liquidity" && (
              <p className="integration-status">
                {siteConfig.isTradingEnabled
                  ? `ONE OPEN BETA MARKET · $${siteConfig.maxTradeAmount} ORDERS`
                  : `NEXT BETA TARGET · ${siteConfig.nextMinTradeAmount}–${siteConfig.nextMaxTradeAmount} USDG PER ORDER`}
              </p>
            )}

            {orderType === "liquidity" ? (
              <>
                <div className="quote-lines">
                  <p><span>Your position</span><strong>{lpBalanceDisplay} BID-LP</strong></p>
                  <p><span>Genesis LP fee</span><strong>0.00%</strong></p>
                  <p><span>Slippage guard</span><strong>0.50%</strong></p>
                  <p><span>Network</span><strong>{siteConfig.networkName}</strong></p>
                </div>
                <div className="return-box liquidity-return">
                  <span>{liquidityAction === "add" ? "ESTIMATED LP SHARES" : `ESTIMATED ${siteConfig.collateralSymbol} WITHDRAWAL`}</span>
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
                  <p><span>{orderType === "limit" ? "Minimum contracts" : "Est. contracts"}</span>{showSelectedPricing || orderType === "limit" ? <strong>{quote.contracts.toFixed(2)}</strong> : <LockedValue />}</p>
                  <p><span>Your {outcome.code} position</span><strong>{currentWalletMarket ? displayTokenAmount(selectedOutcomeBalance, currentWalletMarket.decimals, 4) : "—"}</strong></p>
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

            <button
              className="review-button"
              type="button"
              onClick={reviewOrder}
              disabled={
                !siteConfig.isTradingEnabled
                || transactionPending
                || (!marketContractConfigured && !isDemo)
                || (marketContractConfigured && marketReadStatus === "error" && !selectedPrices)
              }
            >
              {!siteConfig.isTradingEnabled
                ? "Trading paused · New beta in development"
                : transactionPending
                ? "Waiting for confirmation"
                : !marketContractConfigured && !isDemo
                  ? "Market activating"
                : walletConnected
                  ? orderType === "liquidity"
                    ? liquidityAction === "add" ? "Add liquidity" : "Withdraw liquidity"
                    : orderType === "market" ? "Review order" : `Buy ${outcome.label} at ≤ ${limitPrice || "—"}¢`
                  : "Connect wallet"}
              <span>→</span>
            </button>
            {hasRedeemablePosition && (
              <button className="redeem-button" type="button" onClick={redeemPosition} disabled={transactionPending}>
                Redeem winning position <span>→</span>
              </button>
            )}
            {lastTransaction && (
              <a className="ticket-tx-proof" href={`${siteConfig.explorerUrl}/tx/${lastTransaction}`} target="_blank" rel="noreferrer">
                View confirmed transaction ↗
              </a>
            )}
            {!marketContractConfigured && (
              <p className="integration-status">LIVE MARKET · QUOTE UPDATING</p>
            )}
            {marketContractConfigured && marketReadStatus === "error" && !selectedPrices && (
              <p className="integration-status">This pool is configured, but its onchain state is unavailable. Transactions stay disabled until the read succeeds.</p>
            )}
          </aside>
        </div>

        <div className="market-intelligence" aria-label="Live onchain market activity">
          <div className="intelligence-head">
            <div>
              <span className="section-kicker">ONCHAIN ACTIVITY</span>
              <h3>Market depth and points.</h3>
            </div>
            <a href={`${siteConfig.explorerUrl}/address/${siteConfig.marketAddresses.miamiTampa}`} target="_blank" rel="noreferrer">VIEW MARKET ↗</a>
          </div>
          {marketActivity ? (
            <>
              <div className="activity-metrics">
                <div><span>MARKET BACKING</span><strong>{displayTokenAmount(marketActivity.marketBacking, marketActivity.decimals)} <small>USDG</small></strong></div>
                <div><span>CONFIRMED VOLUME</span><strong>{displayTokenAmount(marketActivity.totalVolume, marketActivity.decimals)} <small>USDG</small></strong></div>
                <div><span>TRADES</span><strong>{marketActivity.tradeCount}</strong></div>
                <div><span>TRADERS</span><strong>{marketActivity.traderCount}</strong></div>
                <div><span>TRACKED USDG</span><strong>{displayTokenAmount(marketActivity.trackedTotal, marketActivity.decimals)} <small>USDG</small></strong></div>
              </div>
              <div className="activity-columns">
                <div className="reserve-ledger">
                  <span>PROTOCOL USDG LEDGER</span>
                  <p><span>Fee receiver</span><strong>{displayTokenAmount(marketActivity.feeReceiver, marketActivity.decimals)}</strong></p>
                  <p><span>LP rewards reserve</span><strong>{displayTokenAmount(marketActivity.lpRewardsReserve, marketActivity.decimals)}</strong></p>
                  <p><span>Liquidity reserve</span><strong>{displayTokenAmount(marketActivity.liquidityReserve, marketActivity.decimals)}</strong></p>
                  <p><span>Buyback reserve</span><strong>{displayTokenAmount(marketActivity.buybackReserve, marketActivity.decimals)}</strong></p>
                  <p><span>Treasury</span><strong>{displayTokenAmount(marketActivity.treasury, marketActivity.decimals)}</strong></p>
                  <p><span>Creator rewards reserve</span><strong>{displayTokenAmount(marketActivity.creatorRewardsReserve, marketActivity.decimals)}</strong></p>
                </div>
                <div className="points-board">
                  <span>BETA ACTIVITY LEADERBOARD</span>
                  {marketActivity.leaders.length ? marketActivity.leaders.map((leader, index) => (
                    <p key={leader.address}>
                      <i>{String(index + 1).padStart(2, "0")}</i>
                      <a href={`${siteConfig.explorerUrl}/address/${leader.address}`} target="_blank" rel="noreferrer">{truncateAddress(leader.address)}</a>
                      <small>{leader.trades} {leader.trades === 1 ? "trade" : "trades"}</small>
                      <strong>{(leader.volume / activityPointUnit).toString()} PTS</strong>
                    </p>
                  )) : <em>No public trades yet.</em>}
                  <small className="points-policy">1 point per confirmed USDG traded. Activity points are a beta score, not a reward entitlement. LP rewards will additionally require time-weighted eligible liquidity.</small>
                </div>
              </div>
            </>
          ) : (
            <p className="activity-loading">{marketActivityUnavailable ? "Onchain activity is temporarily unavailable." : "Reading confirmed Robinhood Chain activity…"}</p>
          )}
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
            <strong>Choose a housing market.</strong>
          </article>
          <article>
            <span>02 / PRICE</span>
            <strong>Trade your view against available liquidity.</strong>
          </article>
          <article>
            <span>03 / SETTLE</span>
            <strong>Published housing data determines the outcome.</strong>
          </article>
        </div>
        <div className="settlement-strip">
          <div className="settle-badge"><BrandMark /></div>
          <p><span>VERIFIABLE BY DESIGN</span> Closing time is recorded onchain. Settlement is submitted by the configured resolution oracle after Parcl housing data is published.</p>
          <div className="settle-flow"><span>Parcl housing data</span><i>→</i><span>BID oracle attestation</span><i>→</i><span>Robinhood Chain</span></div>
        </div>
        <div className="revenue-panel" id="flywheel">
          <div className="revenue-copy">
            <span className="section-kicker">THE BID FLYWHEEL</span>
            <h3>Volume feeds depth.<br />Depth feeds volume.</h3>
            <p>BID routes creator fees back through the protocol, rewarding the liquidity behind its markets and continuously strengthening the system.</p>
            <strong className="flywheel-story">TRADE MARKETS. PROVIDE LIQUIDITY. GET REWARDED.</strong>
            <a
              className="protocol-proof"
              href={siteConfig.isTestnet && siteConfig.marketFactoryAddress
                ? `${siteConfig.explorerUrl}/address/${siteConfig.marketFactoryAddress}`
                : !siteConfig.isTestnet && siteConfig.ponsFactory
                  ? `${siteConfig.explorerUrl}/address/${siteConfig.ponsFactory}`
                  : siteConfig.explorerUrl}
              target="_blank"
              rel="noreferrer"
            >
              {siteConfig.isTestnet
                ? "BID testnet explorer"
                : siteConfig.ponsFactory ? "Pons v2 factory" : "Factory awaiting publication"} · Chain {siteConfig.robinhoodChainId} ↗
            </a>
          </div>
          <div className="flywheel-system" aria-label="BID creator-fee allocation">
            <div className="flywheel-head">
              <div><strong>{creatorTaxPercent}%</strong><span>BID CREATOR FEE</span></div>
              <p>Pons may charge separate protocol or base fees.</p>
            </div>
            <div className="flywheel-loop" aria-label="Activity feeds BID and BID feeds its markets">
              {['ACTIVITY', 'FEES', 'REWARDS', 'LIQUIDITY', 'BETTER MARKETS'].map((label, index) => (
                <span key={label}>{label}{index < 4 && <i>→</i>}</span>
              ))}
            </div>
            <div className="allocation-bar" aria-label="45 percent LP rewards, 30 percent market liquidity, 10 percent buyback and burn, 10 percent treasury, 5 percent creator rewards">
              <i className="lp" style={{ flexBasis: `${siteConfig.lpRewardsShareBps / 100}%` }} />
              <i className="liquidity" style={{ flexBasis: `${siteConfig.marketLiquidityShareBps / 100}%` }} />
              <i className="buyback" style={{ flexBasis: `${siteConfig.buybackBurnShareBps / 100}%` }} />
              <i className="treasury" style={{ flexBasis: `${siteConfig.treasuryShareBps / 100}%` }} />
              <i className="creator" style={{ flexBasis: `${siteConfig.creatorRewardsShareBps / 100}%` }} />
            </div>
            <div className="allocation-key">
              <span><i className="lp" /><strong>45%</strong> LP REWARDS <em>RESERVE</em></span>
              <span><i className="liquidity" /><strong>30%</strong> MARKET LIQUIDITY <em>AUTO-DEPLOY READY</em></span>
              <span><i className="buyback" /><strong>10%</strong> BUYBACK + BURN <em>RESERVE BUILDING</em></span>
              <span><i className="treasury" /><strong>10%</strong> TREASURY</span>
              <span><i className="creator" /><strong>5%</strong> CREATOR REWARDS <em>RESERVE</em></span>
            </div>
            <div className="flywheel-proof">
              <span><small>TOTAL BID CREATOR FEES CLAIMED</small><strong>{flywheelProof ? `${displayTokenAmount(flywheelProof.gross, 6)} USDG` : "AWAITING PUBLICATION"}</strong></span>
              <span><small>LP REWARDS ALLOCATED</small><strong>{flywheelProof ? `${displayTokenAmount(flywheelProof.lpRewards, 6)} USDG` : "AWAITING PUBLICATION"}</strong></span>
              <span><small>LIQUIDITY ALLOCATED</small><strong>{flywheelProof ? `${displayTokenAmount(flywheelProof.marketLiquidity, 6)} USDG` : "AWAITING PUBLICATION"}</strong></span>
              <span><small>BUYBACK RESERVE</small><strong>{flywheelProof ? `${displayTokenAmount(flywheelProof.buybackBurn, 6)} USDG` : "AWAITING PUBLICATION"}</strong></span>
              <span><small>BID BURNED</small><strong>NOT ACTIVE</strong></span>
              <span><small>TREASURY</small><strong>{flywheelProof ? `${displayTokenAmount(flywheelProof.treasury, 6)} USDG` : "AWAITING PUBLICATION"}</strong></span>
              <span><small>CREATOR REWARDS RESERVE</small><strong>{flywheelProof ? `${displayTokenAmount(flywheelProof.creatorRewards, 6)} USDG` : "AWAITING PUBLICATION"}</strong></span>
              {flywheelProof?.latestTransaction && (
                <a href={`${siteConfig.explorerUrl}/tx/${flywheelProof.latestTransaction}`} target="_blank" rel="noreferrer">LATEST ALLOCATION TX ↗</a>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="portfolio-tease" id="creator-markets">
        <span>CREATOR MARKETS / COMING SOON</span>
        <h2>Build the next housing market.</h2>
        <p>Token-gated market creation is planned after the one-market beta. Parameters, initial depth and resolution rules will be reviewed before any market can open.</p>
        <a className="creator-link" href="/create">Preview creator markets →</a>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top"><BrandMark /><span>BID</span></a>
        <p>Real estate prediction markets on Robinhood Chain. {siteConfig.isTestnet
          ? "tBID test environment."
          : verifiedPonsLive ? "$BID verified on Pons." : "$BID token verification pending."}</p>
        <div>
          <a href="#markets">Markets</a>
          <a href="#how-it-works">How it works</a>
          <a href="/rewards">Rewards</a>
          <a href="/docs">Docs</a>
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
            <h2 id="wallet-title">{walletConnected ? "Switch wallet" : "Connect your wallet"}</h2>
            <p>Choose MetaMask, Rabby, or Phantom. BID uses only the provider you select and will switch or add {siteConfig.networkName} after approval.</p>
            {(["MetaMask", "Rabby", "Phantom"] as const).map((name) => {
              const option = walletOptions.find((candidate) => candidate.name === name);
              const isCurrent = walletConnected && activeProvider === option?.provider;
              return (
                <button className="wallet-choice" type="button" key={name} onClick={option ? () => connectWallet(option) : undefined} disabled={!option}>
                  <span className={`wallet-icon wallet-icon-${name.toLowerCase()}`}>{name.slice(0, 2).toUpperCase()}</span>
                  <strong>{name}</strong>
                  <em>{isCurrent ? "Switch account" : option ? "Connect" : "Not detected"}</em>
                </button>
              );
            })}
            {walletOptions.filter((option) => option.name === "Browser wallet").map((option) => (
              <button className="wallet-choice" type="button" key={option.id} onClick={() => connectWallet(option)}>
                <span className="wallet-icon robinhood-dot">EV</span><strong>Other EVM wallet</strong><em>{walletConnected && activeProvider === option.provider ? "Switch account" : "Connect"}</em>
              </button>
            ))}
            {walletConnected && (
              <button className="wallet-modal-disconnect" type="button" onClick={disconnectWallet}>Disconnect {activeWalletName} · {truncateAddress(walletAddress)}</button>
            )}
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
