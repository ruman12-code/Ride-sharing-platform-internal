import { randomBytes } from "node:crypto";
import pg from "pg";
import { Db } from "./db.js";

/**
 * A throwaway Postgres database for one test file.
 *
 * These tests run against real Postgres rather than a stand-in, because the
 * things most worth testing here are precisely the things a stand-in gets
 * wrong: the atomic seat claim, what a conditional UPDATE reports when it
 * changes nothing, and how the driver hands back column names and integers.
 *
 * A whole database per test file rather than a shared one with cleanup between
 * cases: tests run in parallel, and shared state is how a suite starts failing
 * only when the machine is busy.
 *
 * Point TEST_DATABASE_URL at any Postgres. Without it these tests skip rather
 * than fail, so a checkout with no database still runs everything else.
 */
export const TEST_URL = process.env["TEST_DATABASE_URL"] ?? "";
export const hasPostgres = TEST_URL !== "";

export interface TestDb {
  readonly db: Db;
  drop(): Promise<void>;
}

export const freshDb = async (): Promise<TestDb> => {
  const name = `ekpothe_test_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Client({ connectionString: TEST_URL });
  await admin.connect();
  // The name is hex from randomBytes, so there is nothing here to inject; it is
  // quoted anyway because CREATE DATABASE cannot take a parameter and the habit
  // is worth more than the exception.
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();

  const url = new URL(TEST_URL);
  url.pathname = `/${name}`;
  const db = new Db(url.toString());
  await db.migrate();

  return {
    db,
    async drop() {
      await db.close();
      const cleaner = new pg.Client({ connectionString: TEST_URL });
      await cleaner.connect();
      await cleaner.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await cleaner.end();
    },
  };
};
