import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Postgres store for the pilot.
 *
 * This was SQLite in a file, which was the right answer while the app ran on a
 * machine somebody owned. It stopped being the right answer the moment the
 * pilot needed to live somewhere nobody has to keep switched on: free hosting
 * tiers give you a filesystem that is wiped on every restart, so a single-file
 * database there is a pilot that silently deletes itself. The data moved to a
 * managed Postgres; the app kept everything else.
 *
 * Three small shims below carry the existing SQL across unchanged. They are
 * worth the words because each one is a whole class of bug that would otherwise
 * be discovered one query at a time, in production.
 */

/**
 * 1. Placeholders.
 *
 * The queries are written with `?`, which Postgres does not accept — it wants
 * `$1`, `$2`. Rewriting here keeps sixty-odd call sites exactly as they were,
 * and keeps them readable.
 *
 * Quote-aware, because a `?` inside a string literal is data and must survive.
 * No query has one today; one will eventually, and it would fail in a way
 * nobody would connect to this function.
 */
export const toPositional = (sql: string): string => {
  let out = "";
  let n = 0;
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]!;
    if (c === "'") {
      // '' is an escaped quote inside a literal, not the end of one.
      if (inString && sql[i + 1] === "'") {
        out += "''";
        i++;
        continue;
      }
      inString = !inString;
      out += c;
    } else if (c === "?" && !inString) {
      out += `$${++n}`;
    } else {
      out += c;
    }
  }
  return out;
};

/**
 * 2. Column names.
 *
 * Postgres folds unquoted identifiers to lower case, so a column declared as
 * `displayName` is really `displayname`, and every row this driver returned
 * would arrive with keys the application does not read. Rather than quote
 * several hundred identifiers across the schema and the queries — and rather
 * than rename every column and every property — the map is derived from the
 * schema itself, so it cannot drift out of step with it.
 *
 * Aliases invented in a query (`AS "riderName"`) are quoted at the call site,
 * because nothing here can know about them.
 */
const columnNames = (schema: string): ReadonlyMap<string, string> => {
  const map = new Map<string, string>();
  for (const line of schema.split("\n")) {
    const m = /^\s{2,}("?)([A-Za-z_][A-Za-z0-9_]*)\1\s+(TEXT|INTEGER|REAL|BOOLEAN|NUMERIC|TIMESTAMP)/.exec(line);
    if (m?.[2]) map.set(m[2].toLowerCase(), m[2]);
  }
  return map;
};

const SCHEMA = readFileSync(join(here, "schema.sql"), "utf8");
const COLUMNS = columnNames(SCHEMA);

const restoreKeys = <T>(row: Record<string, unknown>): T => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[COLUMNS.get(k) ?? k] = v;
  return out as T;
};

/**
 * 3. PRAGMAs.
 *
 * Two SQLite directives that have no Postgres equivalent and need none: WAL is
 * SQLite's concurrency story, and foreign keys are always enforced here rather
 * than opted into.
 */
const forPostgres = (schema: string): string =>
  schema
    .split("\n")
    .filter((l) => !/^\s*PRAGMA\b/i.test(l))
    .join("\n");

export class Db {
  private readonly pool: pg.Pool;

  /**
   * The connection a transaction is running on.
   *
   * Without this, statements inside `transaction()` would each take their own
   * connection from the pool and the surrounding BEGIN would apply to none of
   * them — the seat-claiming compare-and-swap would still *look* correct and
   * would no longer be atomic. Async-local storage keeps the callers written
   * exactly as they were while the statements inside a transaction all land on
   * one connection.
   */
  private readonly tx = new AsyncLocalStorage<pg.PoolClient>();

  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      // Managed Postgres serves TLS with its own certificate chain; the
      // connection is encrypted, and the host is authenticated by the
      // connection string being a secret.
      ...(/\bsslmode=disable\b/.test(connectionString)
        ? {}
        : { ssl: { rejectUnauthorized: false } }),
      // A free tier allows few connections, and this app is not busy. Holding
      // a large pool open is how a small app exhausts a small database.
      max: Number(process.env["PGPOOL_MAX"] ?? 5),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    });
  }

  /** Create tables if they are not there. Safe to run on every boot. */
  async migrate(): Promise<void> {
    await this.pool.query(forPostgres(SCHEMA));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async query(sql: string, params: unknown[]): Promise<pg.QueryResult> {
    const client = this.tx.getStore();
    const text = toPositional(sql);
    return client ? client.query(text, params) : this.pool.query(text, params);
  }

  async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    const r = await this.query(sql, params);
    return r.rows.map((row) => restoreKeys<T>(row as Record<string, unknown>));
  }

  async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    const r = await this.query(sql, params);
    const row = r.rows[0];
    return row === undefined ? undefined : restoreKeys<T>(row as Record<string, unknown>);
  }

  async run(sql: string, ...params: unknown[]): Promise<{ changes: number }> {
    const r = await this.query(sql, params);
    return { changes: r.rowCount ?? 0 };
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    // Already inside one: join it rather than opening a nested transaction,
    // which Postgres does not have.
    if (this.tx.getStore()) return fn();

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const out = await this.tx.run(client, fn);
      await client.query("COMMIT");
      return out;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Claim seats on a ride, atomically.
   *
   * Returns false when the version has moved on. The caller re-reads and
   * retries once, then tells the colleague the seat went. There is no path
   * here that overwrites a concurrent booking.
   */
  async claimSeats(rideId: string, expectedVersion: number, seatsAfter: number): Promise<boolean> {
    const { changes } = await this.run(
      `UPDATE rides
          SET seatsAvailable = ?,
              status = CASE WHEN ? <= 0 THEN 'full' ELSE status END,
              rowVersion = rowVersion + 1
        WHERE id = ? AND rowVersion = ? AND seatsAvailable >= ?`,
      seatsAfter,
      seatsAfter,
      rideId,
      expectedVersion,
      // Guards against a negative claim even if the caller miscalculated.
      Math.max(0, seatsAfter),
    );
    return changes === 1;
  }

  async audit(
    actorId: string,
    entity: string,
    entityId: string,
    action: string,
    after?: unknown,
  ): Promise<void> {
    await this.run(
      `INSERT INTO audit_log (id, actorId, entity, entityId, action, after, at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      actorId,
      entity,
      entityId,
      action,
      after === undefined ? null : JSON.stringify(after),
      new Date().toISOString(),
    );
  }
}

export const newId = (): string => randomUUID();
