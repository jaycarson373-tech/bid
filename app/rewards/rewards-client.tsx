"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  createWalletClient,
  custom,
  formatUnits,
  getAddress,
  isAddress,
  isAddressEqual,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { configuredAddress, robinhoodChain, robinhoodPublicClient } from "@/lib/bidMarket";
import { siteConfig } from "@/lib/site";
import styles from "./rewards.module.css";

type RewardClaim = {
  account: string;
  amount: string;
  leaf: Hex;
  proof: Hex[];
};

type RewardManifest = {
  epochId: string;
  asset: string;
  decimals: number;
  merkleRoot: Hex;
  totalAllocation: string;
  claims: RewardClaim[];
};

const rewardsAbi = [
  {
    type: "function",
    name: "epochs",
    stateMutability: "view",
    inputs: [{ name: "epochId", type: "uint256" }],
    outputs: [
      { name: "asset", type: "address" },
      { name: "merkleRoot", type: "bytes32" },
      { name: "totalAllocation", type: "uint256" },
      { name: "totalClaimed", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "claimed",
    stateMutability: "view",
    inputs: [{ name: "epochId", type: "uint256" }, { name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "epochId", type: "uint256" },
      { name: "account", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "proof", type: "bytes32[]" },
    ],
    outputs: [],
  },
] as const;

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function errorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "shortMessage" in error) {
    return String((error as { shortMessage?: unknown }).shortMessage);
  }
  return error instanceof Error ? error.message : "The request could not be completed.";
}

async function selectRobinhoodChain(provider: EIP1193Provider) {
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: siteConfig.robinhoodChainHex }] });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? Number((error as { code?: unknown }).code)
      : 0;
    if (code !== 4902) throw error;
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

function validManifest(value: unknown): value is RewardManifest {
  if (typeof value !== "object" || value === null) return false;
  const manifest = value as Partial<RewardManifest>;
  try {
    return Boolean(
      manifest.epochId
        && BigInt(manifest.epochId) > 0n
        && manifest.asset
        && isAddress(manifest.asset)
        && Number.isInteger(manifest.decimals)
        && manifest.merkleRoot?.match(/^0x[0-9a-f]{64}$/i)
        && manifest.totalAllocation
        && BigInt(manifest.totalAllocation) > 0n
        && Array.isArray(manifest.claims)
        && manifest.claims.every((claim) => isAddress(claim.account)
          && BigInt(claim.amount) > 0n
          && /^0x[0-9a-f]{64}$/i.test(claim.leaf)
          && Array.isArray(claim.proof)
          && claim.proof.every((node) => /^0x[0-9a-f]{64}$/i.test(node))),
    );
  } catch {
    return false;
  }
}

function displayUnits(value: bigint, decimals: number) {
  const [whole, fraction = ""] = formatUnits(value, decimals).split(".");
  const grouped = BigInt(whole).toLocaleString("en-US");
  const trimmedFraction = fraction.slice(0, 6).replace(/0+$/, "");
  return trimmedFraction ? `${grouped}.${trimmedFraction}` : grouped;
}

async function readClaimStatus(distributor: `0x${string}`, manifest: RewardManifest, wallet: `0x${string}`) {
  return robinhoodPublicClient.readContract({
    address: distributor,
    abi: rewardsAbi,
    functionName: "claimed",
    args: [BigInt(manifest.epochId), wallet],
  });
}

export default function RewardsClient() {
  const distributor = configuredAddress(siteConfig.rewardsVaultAddress);
  const [manifest, setManifest] = useState<RewardManifest | null>(null);
  const [wallet, setWallet] = useState("");
  const [loading, setLoading] = useState(Boolean(distributor && siteConfig.rewardsManifestUrl));
  const [notice, setNotice] = useState("");
  const [hasClaimed, setHasClaimed] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [transaction, setTransaction] = useState<Hex | null>(null);

  useEffect(() => {
    if (!distributor || !siteConfig.rewardsManifestUrl) return;
    const rewardsAddress = distributor;
    const manifestUrl = siteConfig.rewardsManifestUrl;
    let cancelled = false;
    async function loadManifest() {
      try {
        const response = await fetch(manifestUrl, { cache: "no-store" });
        if (!response.ok) throw new Error("The published rewards manifest is unavailable.");
        const candidate: unknown = await response.json();
        if (!validManifest(candidate)) throw new Error("The published rewards manifest is invalid.");
        const epochId = BigInt(candidate.epochId);
        const totalAllocation = BigInt(candidate.totalAllocation);
        const [asset, root, onchainAllocation] = await robinhoodPublicClient.readContract({
          address: rewardsAddress,
          abi: rewardsAbi,
          functionName: "epochs",
          args: [epochId],
        });
        if (!isAddressEqual(asset, getAddress(candidate.asset))
          || root.toLowerCase() !== candidate.merkleRoot.toLowerCase()
          || onchainAllocation !== totalAllocation) {
          throw new Error("The rewards manifest does not match the published onchain epoch.");
        }
        if (!cancelled) setManifest(candidate);
      } catch (error) {
        if (!cancelled) setNotice(errorMessage(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadManifest();
    return () => { cancelled = true; };
  }, [distributor]);

  const allocation = useMemo(() => manifest?.claims.find(
    (claim) => wallet && claim.account.toLowerCase() === wallet.toLowerCase(),
  ) ?? null, [manifest, wallet]);

  useEffect(() => {
    if (!distributor || !manifest || !isAddress(wallet)) return;
    let cancelled = false;
    readClaimStatus(distributor, manifest, getAddress(wallet))
      .then((claimed) => { if (!cancelled) setHasClaimed(claimed); })
      .catch((error) => { if (!cancelled) setNotice(errorMessage(error)); });
    return () => { cancelled = true; };
  }, [distributor, manifest, wallet]);

  async function connectWallet() {
    const provider = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
    if (!provider) {
      setNotice("No unlocked EVM browser wallet was detected.");
      return;
    }
    try {
      await selectRobinhoodChain(provider);
      const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
      if (!accounts[0] || !isAddress(accounts[0])) throw new Error("The wallet returned no valid account.");
      setWallet(getAddress(accounts[0]));
      setNotice("");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function claimRewards() {
    if (!distributor || !manifest || !allocation || !wallet || hasClaimed) return;
    const provider = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
    if (!provider) return;
    setClaiming(true);
    setNotice("");
    try {
      await selectRobinhoodChain(provider);
      const account = getAddress(wallet);
      const args = [BigInt(manifest.epochId), account, BigInt(allocation.amount), allocation.proof] as const;
      const { request } = await robinhoodPublicClient.simulateContract({
        account,
        address: distributor,
        abi: rewardsAbi,
        functionName: "claim",
        args,
      });
      const client = createWalletClient({ account, chain: robinhoodChain, transport: custom(provider) });
      const hash = await client.writeContract(request);
      setTransaction(hash);
      const receipt = await robinhoodPublicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The rewards transaction reverted.");
      setHasClaimed(await readClaimStatus(distributor, manifest, account));
      setNotice("Rewards claimed successfully.");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setClaiming(false);
    }
  }

  const configured = Boolean(distributor && siteConfig.rewardsManifestUrl);
  const amount = allocation && manifest
    ? displayUnits(BigInt(allocation.amount), manifest.decimals)
    : "0";
  const assetLabel = manifest?.asset === "0x0000000000000000000000000000000000000000"
    ? "ETH"
    : siteConfig.collateralSymbol;

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          <Image src="/brand/bid-logo.jpg" alt="" width={34} height={34} priority />
          <strong>BID</strong><span>Rewards</span>
        </Link>
        <nav><Link href="/">Markets</Link><Link href="/docs">Docs</Link></nav>
      </header>

      <div className={styles.layout}>
        <aside className={styles.rail}>
          <span>NETWORK</span>
          <strong><i /> {siteConfig.networkName}</strong>
          <small>Chain ID {siteConfig.robinhoodChainId}</small>
        </aside>

        <section className={styles.content}>
          <div className={styles.titleRow}>
            <div><span>FLYWHEEL / REWARDS</span><h1>Claim rewards</h1></div>
            <span className={styles.verified}>{manifest ? "ONCHAIN VERIFIED" : "AWAITING EPOCH"}</span>
          </div>
          <p className={styles.lead}>Published reward files are checked against the immutable epoch root before any wallet transaction is prepared.</p>

          <div className={styles.flow} aria-label="Reward flow">
            <span>Pons fees</span><b>→</b><span>70% rewards</span><b>→</b><span>Published epoch</span><b>→</b><span>Wallet claim</span>
          </div>

          <div className={styles.claimPanel}>
            <div className={styles.panelHeader}><span>LATEST EPOCH</span><strong>{manifest?.epochId ?? "AWAITING PUBLICATION"}</strong></div>
            {!configured ? (
              <div className={styles.empty}><strong>Rewards begin after launch</strong><p>The distributor and first verified epoch have not been published yet.</p></div>
            ) : loading ? (
              <div className={styles.empty}><strong>Verifying epoch</strong><p>Matching the proof manifest to Robinhood Chain.</p></div>
            ) : !wallet ? (
              <div className={styles.balance}><span>Your allocation</span><strong>Connect wallet</strong></div>
            ) : (
              <div className={styles.balance}><span>Your allocation</span><strong>{amount} {assetLabel}</strong><small>{allocation ? shortAddress(wallet) : "No allocation in this epoch"}</small></div>
            )}

            <button
              type="button"
              disabled={!configured || loading || (Boolean(wallet) && (!allocation || hasClaimed)) || claiming}
              onClick={wallet ? claimRewards : connectWallet}
            >
              {claiming ? "Submitting claim" : hasClaimed ? "Already claimed" : wallet ? allocation ? "Claim rewards" : "Not eligible" : "Connect wallet"}
            </button>
            {notice && <p className={styles.notice} role="status">{notice}</p>}
            {transaction && <a className={styles.tx} href={`${siteConfig.explorerUrl}/tx/${transaction}`} target="_blank" rel="noreferrer">View transaction ↗</a>}
          </div>

          <div className={styles.assurances}>
            <div><strong>One claim</strong><span>Each wallet can claim once per epoch.</span></div>
            <div><strong>Fixed recipient</strong><span>Claims always pay the wallet encoded in the proof.</span></div>
            <div><strong>Funded first</strong><span>Roots cannot commit more than the contract holds.</span></div>
          </div>
        </section>
      </div>
    </main>
  );
}
