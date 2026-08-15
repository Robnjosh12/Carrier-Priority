/**
 * CARRIER PRIORITY — Compliance Routes
 * ======================================
 * GET /api/compliance — full dashboard of MC authority, insurance, CDL,
 * IFTA, IRP, BOC-3, med cards, drug consortium status, all in one place.
 */

import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { complianceItems, carriers } from "../db/schema.js";
import { FMCSAService } from "../services/index.js";
import { requireAuth } from "../middleware/auth.js";
import { ok, fail, asyncRoute } from "../utils/respond.js";

const router = Router();

router.get("/", requireAuth, asyncRoute(async (req, res) => {
  const rows = await db.select().from(complianceItems).where(eq(complianceItems.carrierId, req.user.company));

  const now = Date.now();
  const withStatus = rows.map((item) => {
    if (!item.expiresAt) return item;
    const daysLeft = Math.ceil((new Date(item.expiresAt).getTime() - now) / (1000 * 60 * 60 * 24));
    const status = daysLeft < 0 ? "expired" : daysLeft <= 60 ? "expiring" : "valid";
    return { ...item, daysLeft, status };
  });

  return ok(res, withStatus);
}));

router.post("/", requireAuth, asyncRoute(async (req, res) => {
  const { subjectType, subjectId, itemType, expiresAt } = req.body;
  if (!subjectType || !itemType) return fail(res, "subjectType and itemType are required", 400);

  const [row] = await db.insert(complianceItems).values({
    carrierId: req.user.company, subjectType, subjectId, itemType,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  }).returning();
  return ok(res, row, 201);
}));

router.patch("/:id", requireAuth, asyncRoute(async (req, res) => {
  const [row] = await db.update(complianceItems).set({ ...req.body, updatedAt: new Date() })
    .where(and(eq(complianceItems.id, req.params.id), eq(complianceItems.carrierId, req.user.company))).returning();
  if (!row) return fail(res, "Compliance item not found", 404);
  return ok(res, row);
}));

/**
 * POST /api/compliance/verify-mc — on-demand FMCSA SAFER lookup.
 */
router.post("/verify-mc", requireAuth, asyncRoute(async (req, res) => {
  const [carrier] = await db.select().from(carriers).where(eq(carriers.id, req.user.company)).limit(1);
  if (!carrier) return fail(res, "Carrier not found", 404);

  const result = await FMCSAService.verify(carrier.mcNumber);
  await db.update(carriers).set({ fmcsaVerified: !!result.verified }).where(eq(carriers.id, carrier.id));
  return ok(res, result);
}));

export default router;
