/**
 * CARRIER PRIORITY — Fraud Guard Routes
 * ========================================
 * Exposes fraud flags raised by the 5-layer FraudPreventionService and
 * trust score history / current tier for the calling carrier.
 */

import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { fraudFlags, trustScores, carriers, drivers } from "../db/schema.js";
import { FraudPreventionService } from "../services/index.js";
import { requireAuth } from "../middleware/auth.js";
import { ok, fail, asyncRoute } from "../utils/respond.js";

const router = Router();

router.get("/flags", requireAuth, asyncRoute(async (req, res) => {
  const rows = await db.select().from(fraudFlags)
    .where(eq(fraudFlags.carrierId, req.user.company)).orderBy(desc(fraudFlags.createdAt));
  return ok(res, rows);
}));

router.patch("/flags/:id/resolve", requireAuth, asyncRoute(async (req, res) => {
  const [row] = await db.update(fraudFlags).set({ status: "resolved", resolvedAt: new Date() })
    .where(and(eq(fraudFlags.id, req.params.id), eq(fraudFlags.carrierId, req.user.company))).returning();
  if (!row) return fail(res, "Fraud flag not found", 404);
  return ok(res, row);
}));

/**
 * GET /api/fraud/trust-score — current trust score + tier + Quick Pay fee.
 */
router.get("/trust-score", requireAuth, asyncRoute(async (req, res) => {
  const [carrier] = await db.select().from(carriers).where(eq(carriers.id, req.user.company)).limit(1);
  if (!carrier) return fail(res, "Carrier not found", 404);

  const carrierDrivers = await db.select().from(drivers).where(eq(drivers.carrierId, req.user.company));
  const loadsCompleted = carrierDrivers.reduce((sum, d) => sum + (d.loadsCompleted || 0), 0);
  const avgOnTime = carrierDrivers.length
    ? carrierDrivers.reduce((sum, d) => sum + Number(d.onTimeRate || 100), 0) / carrierDrivers.length
    : 100;

  const score = FraudPreventionService.calculateTrustScore({
    loadsCompleted, onTimeRate: avgOnTime, eldGaps: 0, routeDeviations: 0, disputedDeliveries: 0,
  });
  const feePct = FraudPreventionService.getQuickPayFee(score);
  const tier = score >= 80 ? "elite" : score >= 70 ? "priority" : score >= 60 ? "verified" : "standard";

  await db.update(carriers).set({ trustScore: score }).where(eq(carriers.id, carrier.id));
  await db.insert(trustScores).values({
    carrierId: carrier.id, score, tier, quickPayFeePct: feePct,
    breakdown: { loadsCompleted, avgOnTime },
  });

  return ok(res, { score, tier, quickPayFeePct: feePct });
}));

router.get("/trust-score/history", requireAuth, asyncRoute(async (req, res) => {
  const rows = await db.select().from(trustScores)
    .where(eq(trustScores.carrierId, req.user.company)).orderBy(desc(trustScores.createdAt)).limit(50);
  return ok(res, rows);
}));

export default router;
