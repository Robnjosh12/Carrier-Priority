/**
 * CARRIER PRIORITY — Shipper Portal Routes
 * ===========================================
 * Shippers post loads, get verified via FMCSA/Middesk-style checks,
 * e-sign rate confirmations, and release payment — no broker involved.
 * Mounted separately so it can eventually live at shippers.carrierpriority.com
 * with its own auth context; for now it shares the same JWT auth.
 */

import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { shippers, shipperLoads, loads, introducedRelationships } from "../db/schema.js";
import { FMCSAService, ESignService } from "../services/index.js";
import { requireAuth } from "../middleware/auth.js";
import { ok, fail, asyncRoute } from "../utils/respond.js";

const router = Router();

const createShipperSchema = z.object({
  name: z.string().min(1),
  mcNumber: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

router.post("/shippers", asyncRoute(async (req, res) => {
  const parsed = createShipperSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, parsed.error.issues[0].message, 400);

  let fmcsaVerified = false;
  if (parsed.data.mcNumber) {
    const check = await FMCSAService.verify(parsed.data.mcNumber);
    fmcsaVerified = !!check.verified;
  }

  const [row] = await db.insert(shippers).values({ ...parsed.data, fmcsaVerified }).returning();
  return ok(res, row, 201);
}));

router.get("/shippers/:id", asyncRoute(async (req, res) => {
  const [row] = await db.select().from(shippers).where(eq(shippers.id, req.params.id)).limit(1);
  if (!row) return fail(res, "Shipper not found", 404);
  return ok(res, row);
}));

const postLoadSchema = z.object({
  shipperId: z.string().uuid(),
  originCity: z.string().min(1),
  destCity: z.string().min(1),
  miles: z.number().positive(),
  allInRate: z.number().positive(),
  equipmentType: z.enum(["dry_van", "reefer", "flatbed", "cargo_van", "step_deck", "tanker", "other"]),
  weight: z.number().optional(),
  commodity: z.string().optional(),
});

router.post("/loads", asyncRoute(async (req, res) => {
  const parsed = postLoadSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, parsed.error.issues[0].message, 400);
  const refCode = `RL-${Math.floor(1000 + Math.random() * 9000)}`;

  const [load] = await db.insert(loads).values({ ...parsed.data, refCode }).returning();
  await db.insert(shipperLoads).values({ shipperId: parsed.data.shipperId, loadId: load.id });

  return ok(res, load, 201);
}));

/**
 * POST /api/shipper/loads/:id/rate-confirmation — e-sign flow.
 * On completion, logs an introduced_relationships row starting the
 * 24-month / 8% off-platform-fee window between this carrier and shipper.
 */
router.post("/loads/:id/rate-confirmation", requireAuth, asyncRoute(async (req, res) => {
  const [load] = await db.select().from(loads).where(eq(loads.id, req.params.id)).limit(1);
  if (!load) return fail(res, "Load not found", 404);
  if (!load.carrierId) return fail(res, "Load has not been booked yet", 409);

  const envelope = await ESignService.sendRateConfirmation({
    booking: { loadId: load.id }, load, carrier: { id: load.carrierId }, shipper: { id: load.shipperId },
  });

  if (load.shipperId) {
    const introducedAt = new Date();
    const windowExpiresAt = new Date(introducedAt);
    windowExpiresAt.setMonth(windowExpiresAt.getMonth() + 24);
    await db.insert(introducedRelationships).values({
      carrierId: load.carrierId, shipperId: load.shipperId, loadId: load.id,
      introducedAt, windowExpiresAt,
    });
  }

  return ok(res, envelope, 201);
}));

export default router;
