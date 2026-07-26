import "dotenv/config";

import { readdir, readFile } from "node:fs/promises";
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
    const migrationsDir = resolve(process.cwd(), "migrations");
    const migrations = (await readdir(migrationsDir))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of migrations) {
      const migration = await readFile(resolve(migrationsDir, file), "utf8");
      await sql.unsafe(migration);
      console.log(JSON.stringify({ event: "migration_complete", migration: file }));
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
