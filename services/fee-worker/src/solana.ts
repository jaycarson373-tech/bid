import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

import type { FeeSplit } from "./policy.js";

export type PreparedTransaction = {
  transaction: VersionedTransaction;
  blockhash: string;
  lastValidBlockHeight: number;
  rawBase64?: string;
  signature?: string;
};

export async function prepareTransaction(
  connection: Connection,
  payer: PublicKey,
  instructions: TransactionInstruction[],
  priorityFeeMicroLamports: number,
  signer?: Keypair,
): Promise<PreparedTransaction> {
  const latest = await connection.getLatestBlockhash("confirmed");
  const allInstructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: priorityFeeMicroLamports,
    }),
    ...instructions,
  ];
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: latest.blockhash,
    instructions: allInstructions,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);

  if (!signer) {
    return {
      transaction,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    };
  }

  transaction.sign([signer]);
  return {
    transaction,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
    rawBase64: Buffer.from(transaction.serialize()).toString("base64"),
    signature: bs58.encode(transaction.signatures[0]!),
  };
}

export async function simulatePrepared(
  connection: Connection,
  prepared: PreparedTransaction,
  verifySignature: boolean,
): Promise<string[]> {
  const result = await connection.simulateTransaction(prepared.transaction, {
    commitment: "processed",
    sigVerify: verifySignature,
  });

  if (result.value.err) {
    const detail = JSON.stringify(result.value.err);
    const logs = result.value.logs?.join("\n") ?? "No simulation logs";
    throw new Error(`Solana simulation failed: ${detail}\n${logs}`);
  }

  return result.value.logs ?? [];
}

export async function submitPrepared(
  connection: Connection,
  prepared: PreparedTransaction,
): Promise<string> {
  if (!prepared.rawBase64 || !prepared.signature) {
    throw new Error("cannot submit an unsigned transaction");
  }

  const signature = await connection.sendRawTransaction(
    Buffer.from(prepared.rawBase64, "base64"),
    { maxRetries: 3, skipPreflight: false },
  );

  if (signature !== prepared.signature) {
    throw new Error("RPC returned an unexpected transaction signature");
  }

  return signature;
}

export async function confirmPrepared(
  connection: Connection,
  signature: string,
  blockhash: string,
  lastValidBlockHeight: number,
): Promise<void> {
  const confirmation = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );

  if (confirmation.value.err) {
    throw new Error(
      `Solana transaction ${signature} failed: ${JSON.stringify(confirmation.value.err)}`,
    );
  }
}

export async function actualClaimedLamports(
  connection: Connection,
  signature: string,
): Promise<bigint> {
  let transaction = null;
  for (let attempt = 0; attempt < 5 && !transaction; attempt += 1) {
    transaction = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!transaction) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  if (!transaction?.meta) {
    throw new Error(`confirmed claim ${signature} is not yet available from the RPC`);
  }

  const preBalance = transaction.meta.preBalances[0];
  const postBalance = transaction.meta.postBalances[0];
  if (preBalance === undefined || postBalance === undefined) {
    throw new Error(`claim ${signature} did not include the creator as fee payer`);
  }

  const claimed =
    BigInt(postBalance) -
    BigInt(preBalance) +
    BigInt(transaction.meta.fee);

  if (claimed < 0n) {
    throw new Error(`claim ${signature} produced a negative creator balance delta`);
  }

  return claimed;
}

export function allocationInstructions(
  creator: PublicKey,
  liquidityTreasury: PublicKey,
  holderRewardsTreasury: PublicKey,
  split: FeeSplit,
): TransactionInstruction[] {
  return [
    SystemProgram.transfer({
      fromPubkey: creator,
      toPubkey: liquidityTreasury,
      lamports: split.liquidityLamports,
    }),
    SystemProgram.transfer({
      fromPubkey: creator,
      toPubkey: holderRewardsTreasury,
      lamports: split.holderRewardsLamports,
    }),
  ];
}

export async function signatureLanded(
  connection: Connection,
  signature: string,
): Promise<"confirmed" | "failed" | "missing"> {
  const statuses = await connection.getSignatureStatuses([signature], {
    searchTransactionHistory: true,
  });
  const status = statuses.value[0];
  if (!status) {
    return "missing";
  }
  if (status.err) {
    return "failed";
  }
  if (
    status.confirmationStatus === "confirmed" ||
    status.confirmationStatus === "finalized"
  ) {
    return "confirmed";
  }
  return "missing";
}
