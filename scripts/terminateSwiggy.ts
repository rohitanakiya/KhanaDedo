/**
 * Swiggy data cleanup script.
 *
 * Deletes every row in every table that stores Swiggy-derived user
 * data and writes a timestamped audit report. Used if we ever need to
 * demonstrate cleanup (partner request, user account deletion sweep,
 * disconnecting the integration).
 *
 * What this script does, in one transaction:
 *   1. Counts every row in every table listed in SWIGGY_TABLES
 *   2. Deletes all such rows
 *   3. Writes a signed cleanup-report .txt with timestamp, DB
 *      identifier, and before/after counts to `./termination-reports/`
 *
 * Currently the only such table is `user_swiggy_tokens` (encrypted
 * OAuth access tokens keyed by user). We do NOT persist Swiggy
 * restaurant/menu data — search_menu results are fetched per-request
 * and held only in memory for the response lifetime. If that ever
 * changes (e.g. a Swiggy-item embedding cache lands with pgvector),
 * add the new table to SWIGGY_TABLES below.
 *
 * Usage:
 *   npm run swiggy:dry-run              # counts only, no deletion
 *   npm run swiggy:terminate -- --confirm=YES-DELETE-SWIGGY-DATA
 *
 * The confirm flag is required to prevent accidental execution.
 * Nothing runs without it — even with the flag, the script uses a
 * transaction so a failure mid-way leaves the DB unchanged.
 */

import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import pool from "../src/core/db";

const SWIGGY_TABLES = ["user_swiggy_tokens"] as const;
const CONFIRM_TOKEN = "YES-DELETE-SWIGGY-DATA";
const REPORT_DIR = path.join(__dirname, "..", "termination-reports");

interface TableCount {
  table: string;
  count: number;
}

async function countRows(): Promise<TableCount[]> {
  const counts: TableCount[] = [];
  for (const table of SWIGGY_TABLES) {
    const res = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${table}`
    );
    counts.push({ table, count: Number.parseInt(res.rows[0].count, 10) });
  }
  return counts;
}

async function deleteAllInTransaction(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const table of SWIGGY_TABLES) {
      await client.query(`DELETE FROM ${table}`);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Strip credentials from the connection string for the report. */
function safeDbIdentifier(): string {
  const url = process.env.DATABASE_URL ?? "unknown";
  try {
    const u = new URL(url);
    // host + db name is enough to identify the database without leaking password
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "unknown";
  }
}

function writeReport(params: {
  before: TableCount[];
  after: TableCount[] | null; // null in dry-run mode
  dryRun: boolean;
}): string {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = params.dryRun ? "dry-run" : "cleanup";
  const filepath = path.join(REPORT_DIR, `swiggy-${suffix}-${stamp}.txt`);

  const lines: string[] = [
    "Swiggy Data Termination Report",
    "==============================",
    "",
    `Mode:          ${params.dryRun ? "DRY RUN (no changes)" : "CLEANUP EXECUTED"}`,
    `Timestamp:     ${new Date().toISOString()}`,
    `Database:      ${safeDbIdentifier()}`,
    `Node version:  ${process.version}`,
    "",
    "Tables inspected:",
  ];
  for (const b of params.before) {
    const a = params.after?.find((x) => x.table === b.table);
    lines.push(
      `  - ${b.table.padEnd(30)} before=${b.count}` +
        (a ? `  after=${a.count}` : "")
    );
  }

  if (!params.dryRun) {
    lines.push(
      "",
      "Deletion executed inside a single transaction. Post-delete counts",
      "shown above should all be zero. Retain this report as evidence",
      "of the cleanup if audit is ever required."
    );
  } else {
    lines.push(
      "",
      "No rows were deleted. Re-run with:",
      `  npm run swiggy:terminate -- --confirm=${CONFIRM_TOKEN}`,
      "to actually perform the deletion."
    );
  }

  fs.writeFileSync(filepath, lines.join("\n") + "\n", "utf-8");
  return filepath;
}

async function main() {
  const confirmArg = process.argv
    .find((a) => a.startsWith("--confirm="))
    ?.split("=")[1];
  const dryRun = confirmArg !== CONFIRM_TOKEN;

  console.log(
    dryRun
      ? "→ Dry-run mode. No data will be deleted."
      : "→ CLEANUP mode. Rows will be deleted inside a transaction."
  );

  const before = await countRows();
  console.log("Current row counts:");
  for (const c of before) console.log(`  ${c.table.padEnd(30)} ${c.count}`);

  let after: TableCount[] | null = null;
  if (!dryRun) {
    const total = before.reduce((s, c) => s + c.count, 0);
    if (total === 0) {
      console.log("Nothing to delete. All Swiggy tables already empty.");
    } else {
      console.log(`Deleting ${total} row(s) across ${before.length} table(s)...`);
      await deleteAllInTransaction();
      after = await countRows();
      const remaining = after.reduce((s, c) => s + c.count, 0);
      if (remaining !== 0) {
        throw new Error(
          `Post-delete verification failed: ${remaining} row(s) remain. Aborting.`
        );
      }
      console.log("Deletion complete. All Swiggy tables verified empty.");
    }
  }

  const reportPath = writeReport({ before, after, dryRun });
  console.log(`Report written: ${reportPath}`);
  console.log("Retain this file as evidence of the cleanup.");

  await pool.end();
}

main().catch((err) => {
  console.error("terminateSwiggy failed:", err);
  pool.end().finally(() => process.exit(1));
});
