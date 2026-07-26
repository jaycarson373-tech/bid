import "dotenv/config";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import postgres from "postgres";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    ssl: databaseUrl.includes("localhost") ? false : "require",
  });

  try {
    const migration = await readFile(
      resolve(process.cwd(), "migrations/001_fee_accounting.sql"),
      "utf8",
    );
    await sql.unsafe(migration);
    console.log(JSON.stringify({ event: "migration_complete", migration: "001_fee_accounting" }));
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
