/**
 * CARRIER PRIORITY — Database Connection Layer
 * ===============================================
 * Priority 1. Connects PostgreSQL via Drizzle ORM using pg Pool.
 * All credentials come from environment variables — never hardcoded.
 */

import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  // Fail loudly at boot rather than silently querying an undefined connection.
  console.error("[db] FATAL: DATABASE_URL is not set. Copy .env.example to .env and configure it.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

pool.on("error", (err) => {
  // Unexpected errors on idle clients — log, do not crash the process.
  console.error("[db] Unexpected error on idle client", err);
});

export const db = drizzle(pool, { schema });

/**
 * Simple connectivity check used by GET /health.
 * Returns { ok: boolean, latencyMs, error? }
 */
export async function checkDbHealth() {
  const start = Date.now();
  try {
    await pool.query("SELECT 1");
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  }
}

/**
 * Graceful shutdown — call from process signal handlers in server/index.js.
 */
export async function closeDb() {
  await pool.end();
}
