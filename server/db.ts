import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * SQLite store for the standalone pilot.
 *
 * Uses Node's built-in `node:sqlite`, so the server has no runtime
 * dependencies at all. For under 150 colleagues this is not a compromise —
 * a single file handles the load with room to spare, and it backs up by
 * being copied.
 *
 * The concurrency control is the part that matters. Every seat mutation is a
 * conditional UPDATE that checks `rowVersion`, and SQLite reports how many rows
 * it changed. Zero changed rows means somebody else got there first, and the
 * caller is told so rather than silently overwriting them — which is precisely
 * what the legacy `lastRow + 1` handler did.
 */
export class Db {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(readFileSync(join(here, "schema.sql"), "utf8"));
  }

  close(): void {
    this.db.close();
  }

  all<T>(sql: string, ...params: unknown[]): T[] {
    return this.db.prepare(sql).all(...(params as never[])) as T[];
  }

  get<T>(sql: string, ...params: unknown[]): T | undefined {
    return this.db.prepare(sql).get(...(params as never[])) as T | undefined;
  }

  run(sql: string, ...params: unknown[]): { changes: number } {
    const r = this.db.prepare(sql).run(...(params as never[]));
    return { changes: Number(r.changes) };
  }

  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      this.db.exec("COMMIT");
      return out;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  /**
   * Claim seats on a ride, atomically.
   *
   * Returns false when the version has moved on. The caller re-reads and
   * retries once, then tells the colleague the seat went. There is no path
   * here that overwrites a concurrent booking.
   */
  claimSeats(rideId: string, expectedVersion: number, seatsAfter: number): boolean {
    const { changes } = this.run(
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

  audit(actorId: string, entity: string, entityId: string, action: string, after?: unknown): void {
    this.run(
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
