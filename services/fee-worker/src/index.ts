import "dotenv/config";

import { OnlinePumpSdk } from "@pump-fun/pump-sdk";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import postgres from "postgres";

import { loadConfig, type WorkerConfig } from "./config.js";
import { claimWindowStart, splitLamports } from "./policy.js";
import {
  actualClaimedLamports,
  allocationInstructions,
  confirmPrepared,
  prepareTransaction,
  signatureLanded,
  simulatePrepared,
  submitPrepared,
  type PreparedTransaction,
} from "./solana.js";

type ReservedDatabase = Awaited<
  ReturnType<ReturnType<typeof postgres>["reserve"]>
>;

type ClaimRow = {
  id: string;
  status: string;
  vault_estimate_lamports: string;
  claimed_lamports: string | null;
  claim_signature: string | null;
  claim_tx_base64: string | null;
  claim_blockhash: string | null;
  claim_last_valid_block_height: string | null;
  allocation_signature: string | null;
  allocation_tx_base64: string | null;
  allocation_blockhash: string | null;
  allocation_last_valid_block_height: string | null;
};

const LOCK_ID = 42_491_315;

function log(event: string, details: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, at: new Date().toISOString(), ...details }));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function updateFailure(
  sql: ReservedDatabase,
  id: string,
  error: unknown,
): Promise<void> {
  const message = errorMessage(error).slice(0, 8_000);
  await sql`
    update public.bid_fee_claims
    set error = ${message}, updated_at = now()
    where id = ${id}
  `;
  log("claim_error", { id, error: message });
}

async function finishAllocation(
  sql: ReservedDatabase,
  connection: Connection,
  config: WorkerConfig,
  row: ClaimRow,
): Promise<void> {
  const claimedLamports = BigInt(row.claimed_lamports ?? "0");
  if (claimedLamports === 0n) {
    await sql`
      update public.bid_fee_claims
      set status = 'confirmed', confirmed_at = now(), updated_at = now(), error = null
      where id = ${row.id}
    `;
    return;
  }

  if (
    row.allocation_signature &&
    row.allocation_tx_base64 &&
    row.allocation_blockhash &&
    row.allocation_last_valid_block_height
  ) {
    const landed = await signatureLanded(connection, row.allocation_signature);
    if (landed === "confirmed") {
      await sql`
        update public.bid_fee_claims
        set status = 'confirmed', confirmed_at = now(), updated_at = now(), error = null
        where id = ${row.id}
      `;
      log("allocation_reconciled", {
        id: row.id,
        signature: row.allocation_signature,
      });
      return;
    }

    const currentHeight = await connection.getBlockHeight("confirmed");
    const lastValidHeight = Number(row.allocation_last_valid_block_height);
    if (landed === "missing" && currentHeight <= lastValidHeight) {
      const prepared: PreparedTransaction = {
        transaction: versionedTransactionFromBase64(row.allocation_tx_base64),
        rawBase64: row.allocation_tx_base64,
        signature: row.allocation_signature,
        blockhash: row.allocation_blockhash,
        lastValidBlockHeight: lastValidHeight,
      };
      await submitPrepared(connection, prepared);
      await confirmPrepared(
        connection,
        prepared.signature!,
        prepared.blockhash,
        prepared.lastValidBlockHeight,
      );
      await sql`
        update public.bid_fee_claims
        set status = 'confirmed', confirmed_at = now(), updated_at = now(), error = null
        where id = ${row.id}
      `;
      log("allocation_resubmitted", {
        id: row.id,
        signature: row.allocation_signature,
      });
      return;
    }
  }

  const split = splitLamports(
    claimedLamports,
    config.liquidityBps,
    config.holderRewardsBps,
  );
  const prepared = await prepareTransaction(
    connection,
    config.creator,
    allocationInstructions(
      config.creator,
      config.liquidityTreasury,
      config.holderRewardsTreasury,
      split,
    ),
    config.priorityFeeMicroLamports,
    config.creatorKeypair,
  );
  const logs = await simulatePrepared(connection, prepared, true);

  await sql`
    update public.bid_fee_claims
    set
      status = 'allocation_prepared',
      liquidity_lamports = ${split.liquidityLamports.toString()},
      holder_rewards_lamports = ${split.holderRewardsLamports.toString()},
      allocation_signature = ${prepared.signature!},
      allocation_tx_base64 = ${prepared.rawBase64!},
      allocation_blockhash = ${prepared.blockhash},
      allocation_last_valid_block_height = ${prepared.lastValidBlockHeight},
      simulation_logs = coalesce(simulation_logs, '{}'::jsonb) ||
        ${JSON.stringify({ allocation: logs })}::jsonb,
      error = null,
      updated_at = now()
    where id = ${row.id}
  `;

  await submitPrepared(connection, prepared);
  await sql`
    update public.bid_fee_claims
    set status = 'allocation_submitted', updated_at = now()
    where id = ${row.id}
  `;
  await confirmPrepared(
    connection,
    prepared.signature!,
    prepared.blockhash,
    prepared.lastValidBlockHeight,
  );
  await sql`
    update public.bid_fee_claims
    set status = 'confirmed', confirmed_at = now(), updated_at = now(), error = null
    where id = ${row.id}
  `;
  log("allocation_confirmed", {
    id: row.id,
    signature: prepared.signature,
    claimedLamports: claimedLamports.toString(),
    liquidityLamports: split.liquidityLamports.toString(),
    holderRewardsLamports: split.holderRewardsLamports.toString(),
  });
}

async function reconcileClaim(
  sql: ReservedDatabase,
  connection: Connection,
  config: WorkerConfig,
  row: ClaimRow,
): Promise<void> {
  if (!row.claim_signature) {
    return;
  }

  const landed = await signatureLanded(connection, row.claim_signature);
  if (landed === "failed") {
    await sql`
      update public.bid_fee_claims
      set status = 'failed', error = 'claim transaction failed onchain', updated_at = now()
      where id = ${row.id}
    `;
    return;
  }

  if (landed === "missing") {
    if (
      !row.claim_tx_base64 ||
      !row.claim_blockhash ||
      !row.claim_last_valid_block_height
    ) {
      return;
    }
    const currentHeight = await connection.getBlockHeight("confirmed");
    const lastValidHeight = Number(row.claim_last_valid_block_height);
    if (currentHeight > lastValidHeight) {
      await sql`
        update public.bid_fee_claims
        set status = 'failed', error = 'prepared claim expired before confirmation', updated_at = now()
        where id = ${row.id}
      `;
      return;
    }
    const prepared: PreparedTransaction = {
      transaction: versionedTransactionFromBase64(row.claim_tx_base64),
      rawBase64: row.claim_tx_base64,
      signature: row.claim_signature,
      blockhash: row.claim_blockhash,
      lastValidBlockHeight: lastValidHeight,
    };
    await submitPrepared(connection, prepared);
    await confirmPrepared(
      connection,
      row.claim_signature,
      row.claim_blockhash,
      lastValidHeight,
    );
  }

  const claimedLamports = await actualClaimedLamports(
    connection,
    row.claim_signature,
  );
  await sql`
    update public.bid_fee_claims
    set
      status = 'claimed',
      claimed_lamports = ${claimedLamports.toString()},
      error = null,
      updated_at = now()
    where id = ${row.id}
  `;
  await finishAllocation(sql, connection, config, {
    ...row,
    status: "claimed",
    claimed_lamports: claimedLamports.toString(),
  });
}

function versionedTransactionFromBase64(encoded: string) {
  return VersionedTransaction.deserialize(Buffer.from(encoded, "base64"));
}

async function processNewWindow(
  sql: ReservedDatabase,
  connection: Connection,
  config: WorkerConfig,
): Promise<void> {
  const window = claimWindowStart(new Date());
  const id = `${config.cluster}:${config.creator.toBase58()}:${window.toISOString()}`;

  const inserted = await sql<ClaimRow[]>`
    insert into public.bid_fee_claims (
      id,
      claim_window,
      cluster,
      token_mint,
      creator_address,
      status
    )
    values (
      ${id},
      ${window},
      ${config.cluster},
      ${config.tokenMint.toBase58()},
      ${config.creator.toBase58()},
      'running'
    )
    on conflict (id) do nothing
    returning *
  `;
  if (inserted.length === 0) {
    log("window_already_processed", { id });
    return;
  }

  try {
    const sdk = new OnlinePumpSdk(connection);
    const estimate = BigInt(
      (await sdk.getCreatorVaultBalanceBothPrograms(config.creator)).toString(),
    );
    await sql`
      update public.bid_fee_claims
      set vault_estimate_lamports = ${estimate.toString()}, updated_at = now()
      where id = ${id}
    `;

    if (estimate < config.minClaimLamports) {
      await sql`
        update public.bid_fee_claims
        set status = 'empty', updated_at = now()
        where id = ${id}
      `;
      log("below_claim_threshold", {
        id,
        estimateLamports: estimate.toString(),
        thresholdLamports: config.minClaimLamports.toString(),
      });
      return;
    }

    const instructions = await sdk.collectCoinCreatorFeeInstructions(
      config.creator,
      config.creator,
    );
    const prepared = await prepareTransaction(
      connection,
      config.creator,
      instructions,
      config.priorityFeeMicroLamports,
      config.creatorKeypair,
    );
    const simulationLogs = await simulatePrepared(
      connection,
      prepared,
      !config.dryRun,
    );

    if (config.dryRun) {
      await sql`
        update public.bid_fee_claims
        set
          status = 'simulated',
          simulation_logs = ${JSON.stringify({ claim: simulationLogs })}::jsonb,
          updated_at = now()
        where id = ${id}
      `;
      log("claim_simulated", {
        id,
        estimateLamports: estimate.toString(),
        instructionCount: instructions.length,
      });
      return;
    }

    await sql`
      update public.bid_fee_claims
      set
        status = 'claim_prepared',
        claim_signature = ${prepared.signature!},
        claim_tx_base64 = ${prepared.rawBase64!},
        claim_blockhash = ${prepared.blockhash},
        claim_last_valid_block_height = ${prepared.lastValidBlockHeight},
        simulation_logs = ${JSON.stringify({ claim: simulationLogs })}::jsonb,
        updated_at = now()
      where id = ${id}
    `;
    await submitPrepared(connection, prepared);
    await sql`
      update public.bid_fee_claims
      set status = 'claim_submitted', updated_at = now()
      where id = ${id}
    `;
    await confirmPrepared(
      connection,
      prepared.signature!,
      prepared.blockhash,
      prepared.lastValidBlockHeight,
    );

    const claimedLamports = await actualClaimedLamports(
      connection,
      prepared.signature!,
    );
    await sql`
      update public.bid_fee_claims
      set status = 'claimed', claimed_lamports = ${claimedLamports.toString()}, updated_at = now()
      where id = ${id}
    `;
    await finishAllocation(sql, connection, config, {
      ...inserted[0]!,
      id,
      status: "claimed",
      claimed_lamports: claimedLamports.toString(),
    });
  } catch (error) {
    const message = errorMessage(error).slice(0, 8_000);
    await sql`
      update public.bid_fee_claims
      set
        status = case when status = 'running' then 'failed' else status end,
        error = ${message},
        updated_at = now()
      where id = ${id}
    `;
    throw error;
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const connection = new Connection(config.rpcUrl, "confirmed");
  const rootSql = postgres(config.databaseUrl, {
    max: 1,
    prepare: false,
    ssl: config.databaseUrl.includes("localhost") ? false : "require",
  });
  const sql = await rootSql.reserve();
  let locked = false;

  try {
    const lockRows = await sql<{ locked: boolean }[]>`
      select pg_try_advisory_lock(${LOCK_ID}) as locked
    `;
    locked = lockRows[0]?.locked ?? false;
    if (!locked) {
      log("worker_already_running");
      return;
    }

    log("worker_started", {
      dryRun: config.dryRun,
      cluster: config.cluster,
      creator: config.creator.toBase58(),
      tokenMint: config.tokenMint.toBase58(),
    });

    if (!config.dryRun) {
      const pending = await sql<ClaimRow[]>`
        select *
        from public.bid_fee_claims
        where status in (
          'claim_prepared',
          'claim_submitted',
          'claimed',
          'allocation_prepared',
          'allocation_submitted'
        )
        order by created_at asc
      `;

      for (const row of pending) {
        try {
          if (row.status.startsWith("claim_")) {
            await reconcileClaim(sql, connection, config, row);
          } else {
            await finishAllocation(sql, connection, config, row);
          }
        } catch (error) {
          await updateFailure(sql, row.id, error);
        }
      }
    }

    await processNewWindow(sql, connection, config);
    log("worker_complete");
  } finally {
    if (locked) {
      await sql`select pg_advisory_unlock(${LOCK_ID})`;
    }
    sql.release();
    await rootSql.end();
  }
}

main().catch((error) => {
  log("worker_fatal", { error: errorMessage(error) });
  process.exitCode = 1;
});
