/**
 * Residential proxy rotator with health tracking (sections 4.4, 6.1).
 * - Rotates per request, not per session.
 * - Tracks success/failure per proxy in the proxy_health table.
 * - Auto-bans a proxy for 1 hour after 3 consecutive failures.
 *
 * With no proxies configured (local dev), `next()` returns undefined and yt-dlp
 * runs over the direct connection.
 */
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { proxyHealth } from "@vidgrab/db";
import type { Database } from "@vidgrab/db";

const BAN_AFTER_CONSECUTIVE_FAILURES = 3;
const BAN_DURATION_MS = 60 * 60 * 1000; // 1 hour

function proxyId(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 16);
}

export interface LeasedProxy {
  url: string;
  id: string;
}

export class ProxyRotator {
  private readonly db: Database;
  private readonly proxies: string[];
  private cursor = 0;
  /** In-memory consecutive-failure counters, keyed by proxy id. */
  private readonly consecutiveFailures = new Map<string, number>();
  /** Soft, in-memory ban cache to avoid a DB round-trip on every lease. */
  private readonly bannedUntil = new Map<string, number>();

  constructor(db: Database, proxies: string[]) {
    this.db = db;
    this.proxies = proxies;
  }

  get enabled(): boolean {
    return this.proxies.length > 0;
  }

  /** Leases the next non-banned proxy round-robin, or undefined if none configured. */
  next(now = Date.now()): LeasedProxy | undefined {
    if (!this.enabled) return undefined;

    for (let i = 0; i < this.proxies.length; i++) {
      const url = this.proxies[(this.cursor + i) % this.proxies.length]!;
      const id = proxyId(url);
      const banned = this.bannedUntil.get(id);
      if (banned && banned > now) continue;
      this.cursor = (this.cursor + i + 1) % this.proxies.length;
      return { url, id };
    }
    // All proxies banned — fall back to the least-recently-tried one.
    const url = this.proxies[this.cursor % this.proxies.length]!;
    this.cursor = (this.cursor + 1) % this.proxies.length;
    return { url, id: proxyId(url) };
  }

  async reportSuccess(p: LeasedProxy): Promise<void> {
    this.consecutiveFailures.set(p.id, 0);
    this.bannedUntil.delete(p.id);
    await this.db
      .insert(proxyHealth)
      .values({ proxyId: p.id, successCount: 1, failureCount: 0 })
      .onConflictDoUpdate({
        target: proxyHealth.proxyId,
        set: {
          successCount: sql`${proxyHealth.successCount} + 1`,
          bannedUntil: sql`NULL`,
        },
      });
  }

  async reportFailure(p: LeasedProxy, now = Date.now()): Promise<void> {
    const fails = (this.consecutiveFailures.get(p.id) ?? 0) + 1;
    this.consecutiveFailures.set(p.id, fails);

    const shouldBan = fails >= BAN_AFTER_CONSECUTIVE_FAILURES;
    const banUntil = shouldBan ? new Date(now + BAN_DURATION_MS) : null;
    if (shouldBan && banUntil) {
      this.bannedUntil.set(p.id, banUntil.getTime());
      this.consecutiveFailures.set(p.id, 0);
    }

    await this.db
      .insert(proxyHealth)
      .values({
        proxyId: p.id,
        failureCount: 1,
        lastFailureAt: new Date(now),
        bannedUntil: banUntil,
      })
      .onConflictDoUpdate({
        target: proxyHealth.proxyId,
        set: {
          failureCount: sql`${proxyHealth.failureCount} + 1`,
          lastFailureAt: new Date(now),
          ...(banUntil ? { bannedUntil: banUntil } : {}),
        },
      });
  }

  /** Hydrates the in-memory ban cache from the DB on boot. */
  async hydrate(): Promise<void> {
    if (!this.enabled) return;
    const rows = await this.db.select().from(proxyHealth);
    for (const row of rows) {
      if (row.bannedUntil) this.bannedUntil.set(row.proxyId, row.bannedUntil.getTime());
    }
  }

  /** Clears expired bans from the table (best-effort housekeeping). */
  async clearExpiredBans(now = Date.now()): Promise<void> {
    if (!this.enabled) return;
    await this.db
      .update(proxyHealth)
      .set({ bannedUntil: null })
      .where(sql`${proxyHealth.bannedUntil} < ${new Date(now)}`);
  }
}
