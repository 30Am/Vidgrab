import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof createDb>["db"];

/**
 * Creates a Drizzle client backed by a postgres-js connection pool.
 * Callers own the lifecycle: keep one instance per process, call `close()` on shutdown.
 */
export function createDb(connectionString: string, options?: { max?: number }) {
  const sql = postgres(connectionString, {
    max: options?.max ?? 10,
    // postgres-js parses bigint as string by default; we map fileSize as number in schema.
    types: {
      bigint: postgres.BigInt,
    },
  });
  const db = drizzle(sql, { schema });
  return {
    db,
    sql,
    close: () => sql.end({ timeout: 5 }),
  };
}
