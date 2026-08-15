/**
 * CARRIER PRIORITY — Server Entry Point
 * ========================================
 * Wires the database, all route modules, auth middleware, rate limiting,
 * the WebSocket server, and scheduled cron jobs into a single Express app.
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import http from "http";
import { WebSocketServer } from "ws";

import { checkDbHealth, closeDb } from "./db/index.js";
import { setupWSServer, initCronJobs } from "./services/index.js";
import { requireAuth } from "./middleware/auth.js";

import authRoutes from "./routes/auth.js";
import loadsRoutes from "./routes/loads.js";
import driversRoutes from "./routes/drivers.js";
import trucksRoutes from "./routes/trucks.js";
import invoicesRoutes from "./routes/invoices.js";
import documentsRoutes from "./routes/documents.js";
import complianceRoutes from "./routes/compliance.js";
import shipperRoutes from "./routes/shipper.js";
import fraudRoutes from "./routes/fraud.js";
import analyticsRoutes from "./routes/analytics.js";

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Global middleware ─────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "10mb" }));

// 100 requests / 15 min per IP on auth routes — brute-force protection.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests, try again later.", code: 429 },
});

// ─── Health check (public, no auth) ────────────────────────────
app.get("/health", async (req, res) => {
  const db = await checkDbHealth();
  const status = db.ok ? 200 : 503;
  res.status(status).json({
    success: db.ok,
    data: { service: "carrier-priority-api", db, uptimeSeconds: Math.round(process.uptime()) },
  });
});

// ─── Route mounting ─────────────────────────────────────────────
// Public: POST /api/auth/login, POST /api/auth/register (rate limited).
// Everything else under these routers requires a valid JWT (enforced per-route via requireAuth).
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/loads", loadsRoutes);
app.use("/api/drivers", driversRoutes);
app.use("/api/trucks", trucksRoutes);
app.use("/api/invoices", invoicesRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/compliance", complianceRoutes);
app.use("/api/shipper", shipperRoutes);
app.use("/api/fraud", fraudRoutes);
app.use("/api/analytics", analyticsRoutes);

// ─── 404 + error handling ──────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Not found", code: 404 });
});

// Never leak stack traces in production responses.
app.use((err, req, res, next) => {
  console.error("[error]", err);
  const isProd = process.env.NODE_ENV === "production";
  res.status(err.status || 500).json({
    success: false,
    error: isProd ? "Internal server error" : err.message,
    code: err.status || 500,
  });
});

// ─── HTTP + WebSocket server ────────────────────────────────────
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
setupWSServer(wss);

// ─── Cron jobs (compliance alerts, FMCSA re-verify, invoice aging, etc.) ──
if (process.env.ENABLE_CRON !== "false") {
  initCronJobs();
}

server.listen(PORT, () => {
  console.log(`[server] Carrier Priority API listening on :${PORT}`);
  console.log(`[server] WebSocket ready at ws://localhost:${PORT}/ws`);
});

// ─── Graceful shutdown ───────────────────────────────────────────
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    console.log(`[server] ${signal} received, shutting down...`);
    server.close(async () => {
      await closeDb();
      process.exit(0);
    });
  });
}

export default app;
