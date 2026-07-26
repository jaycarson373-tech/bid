import { Keypair, PublicKey } from "@solana/web3.js";

type Cluster = "devnet" | "mainnet-beta";

export type WorkerConfig = {
  dryRun: boolean;
  cluster: Cluster;
  rpcUrl: string;
  databaseUrl: string;
  tokenMint: PublicKey;
  creator: PublicKey;
  creatorKeypair?: Keypair;
  liquidityTreasury: PublicKey;
  holderRewardsTreasury: PublicKey;
  liquidityBps: number;
  holderRewardsBps: number;
  minClaimLamports: bigint;
  priorityFeeMicroLamports: number;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function integer(name: string, fallback: string): number {
  const value = Number.parseInt(process.env[name] ?? fallback, 10);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
  return value;
}

function publicKey(name: string): PublicKey {
  try {
    return new PublicKey(required(name));
  } catch {
    throw new Error(`${name} must be a valid Solana public key`);
  }
}

function decodeCreatorKeypair(): Keypair {
  const encoded = required("CREATOR_SECRET_KEY_B64");
  let bytes: Buffer;

  try {
    bytes = Buffer.from(encoded, "base64");
  } catch {
    throw new Error("CREATOR_SECRET_KEY_B64 must be valid base64");
  }

  if (bytes.length !== 64) {
    throw new Error("CREATOR_SECRET_KEY_B64 must decode to a 64-byte secret key");
  }

  return Keypair.fromSecretKey(bytes);
}

export function loadConfig(): WorkerConfig {
  const clusterValue = process.env.SOLANA_CLUSTER?.trim() || "devnet";
  if (clusterValue !== "devnet" && clusterValue !== "mainnet-beta") {
    throw new Error("SOLANA_CLUSTER must be devnet or mainnet-beta");
  }
  const cluster: Cluster = clusterValue;

  const dryRun = (process.env.DRY_RUN?.trim().toLowerCase() ?? "true") !== "false";
  const creator = publicKey("CREATOR_PUBLIC_KEY");
  const liquidityTreasury = publicKey("LIQUIDITY_TREASURY");
  const holderRewardsTreasury = publicKey("HOLDER_REWARDS_TREASURY");

  if (liquidityTreasury.equals(holderRewardsTreasury)) {
    throw new Error("liquidity and holder-reward treasuries must be different");
  }
  if (creator.equals(liquidityTreasury) || creator.equals(holderRewardsTreasury)) {
    throw new Error("reserve treasuries must be separate from the creator wallet");
  }

  const liquidityBps = integer("LIQUIDITY_BPS", "5000");
  const holderRewardsBps = integer("HOLDER_REWARDS_BPS", "5000");
  if (liquidityBps + holderRewardsBps !== 10_000) {
    throw new Error("LIQUIDITY_BPS and HOLDER_REWARDS_BPS must total 10,000");
  }

  const creatorKeypair = dryRun ? undefined : decodeCreatorKeypair();
  if (creatorKeypair && !creatorKeypair.publicKey.equals(creator)) {
    throw new Error("creator secret key does not match CREATOR_PUBLIC_KEY");
  }

  const rpcUrl =
    process.env.SOLANA_RPC_URL?.trim() ||
    (cluster === "devnet" ? "https://api.devnet.solana.com" : "");
  if (!rpcUrl) {
    throw new Error("SOLANA_RPC_URL is required on mainnet-beta");
  }

  return {
    dryRun,
    cluster,
    rpcUrl,
    databaseUrl: required("DATABASE_URL"),
    tokenMint: publicKey("BID_TOKEN_MINT"),
    creator,
    creatorKeypair,
    liquidityTreasury,
    holderRewardsTreasury,
    liquidityBps,
    holderRewardsBps,
    minClaimLamports: BigInt(integer("MIN_CLAIM_LAMPORTS", "100000")),
    priorityFeeMicroLamports: integer("PRIORITY_FEE_MICROLAMPORTS", "1000"),
  };
}
