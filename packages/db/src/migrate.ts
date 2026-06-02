/**
 * Runs pending Drizzle migrations against DATABASE_URL.
 * Usage: pnpm --filter @vidgrab/db migrate
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const migrationsFolder = resolve(__dirname, "../drizzle");
  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql);
  console.log(`[db] applying migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  await sql.end();
  console.log("[db] migrations complete");
}

main().catch((err) => {
  console.error("[db] migration failed:", err);
  process.exit(1);
});
