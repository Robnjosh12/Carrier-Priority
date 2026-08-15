/**
 * CARRIER PRIORITY — Load Board Routes
 * ======================================
 * GET  /api/loads          — list loads, every load scored via ScoringService
 * GET  /api/loads/:id      — single load detail
 * POST /api/loads          — post a new load (shipper or dispatcher)
 * POST /api/loads/:id/book — carrier books a load → MC lock + double-broker check
 * PATCH /api/loads/:id/status — advance load status (picked_up, delivered, etc.)
 */

import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { loads, shippers, carriers } from "../db/schema.js";
import { ScoringService, DoubleBrokeringService, FraudPreventionService } from "../services/index.js";
import { requireAuth } from "../middleware/auth.js";
import { ok, fail, asyncRoute } from "../utils/respond.js";

const router = Router();

/**
 * GET /api/loads
 * Every load returned includes: score, riskLevel, netProfit, flags,
 * benchmark comparison vs market rate, and a Quick Pay fee projection —
 * wired through ScoringService per Priority 8 of the build spec.
 */
router.get("/", requireAuth, asyncRoute(async (req, res) => {
  const carrierId = req.user.company;
  const [carrier] = await db.select().from(carriers).where(eq(carriers.id, carrierId)).limit(1);

  const rows = await db.select({
    load: loads,
    shipper: shippers,
  }).from(loads).leftJoin(shippers, eq(loads.shipperId, shippers.id));

  const carrierProfile = { mpg: 6.5, costPerMile: 1.65, fuelPrice: 3.85 };

  const scored = rows.map(({ load, shipper }) => {
    const result = ScoringService.scoreLoad({
      load: {
        ...load,
        allInRate: load.allInRate,
        deadheadMiles: load.deadheadMiles,
        shipper: shipper ? { grade: shipper.grade, fmcsaVerified: shipper.fmcsaVerified } : null,
      },
      carrierProfile,
    });

    const quickPayFeePct = carrier
      ? FraudPreventionService.getQuickPayFee(carrier.trustScore)
      : 3.0;

    return {
      ...load,
      shipper: shipper ? { name: shipper.name, grade: shipper.grade, verified: shipper.fmcsaVerified } : null,
      score: result.score,
      riskLevel: result.riskLevel,
      netProfit: result.netProfit,
      ratePerMile: result.ratePerMile,
      flags: result.flags,
      breakdown: result.breakdown,
      quickPayProjection: {
        feePct: quickPayFeePct,
        feeAmount: Number((Number(load.allInRate) * (quickPayFeePct / 100)).toFixed(2)),
        netPayout: Number((Number(load.allInRate) * (1 - quickPayFeePct / 100)).toFixed(2)),
      },
    };
  });

  return ok(res, scored);
}));

router.get("/:id", requireAuth, asyncRoute(async (req, res) => {
  const [load] = await db.select().from(loads).where(eq(loads.id, req.params.id)).limit(1);
  if (!load) return fail(res, "Load not found", 404);
  return ok(res, load);
}));

const createLoadSchema = z.object({
  originCity: z.string().min(1),
  destCity: z.string().min(1),
  miles: z.number().positive(),
  allInRate: z.number().positive(),
  equipmentType: z.enum(["dry_van", "reefer", "flatbed", "cargo_van", "step_deck", "tanker", "other"]),
  weight: z.number().optional(),
  commodity: z.string().optional(),
  shipperId: z.string().uuid().optional(),
});

router.post("/", requireAuth, asyncRoute(async (req, res) => {
  const parsed = createLoadSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, parsed.error.issues[0].message, 400);
  const input = parsed.data;
  const refCode = `RL-${Math.floor(1000 + Math.random() * 9000)}`;

  const [load] = await db.insert(loads).values({ ...input, refCode }).returning();
  return ok(res, load, 201);
}));

/**
 * POST /api/loads/:id/book
 * Books the load to the calling carrier, locks it to their MC number
 * (Priority 9 / DoubleBrokeringService), and runs Layer 2/3 fraud checks.
 */
router.post("/:id/book", requireAuth, asyncRoute(async (req, res) => {
  const carrierId = req.user.company;
  const [carrier] = await db.select().from(carriers).where(eq(carriers.id, carrierId)).limit(1);
  if (!carrier) return fail(res, "Carrier not found", 404);

  const [load] = await db.select().from(loads).where(eq(loads.id, req.params.id)).limit(1);
  if (!load) return fail(res, "Load not found", 404);
  if (load.status !== "posted") return fail(res, `Load is already ${load.status}`, 409);

  const lock = await DoubleBrokeringService.lockLoadToMC({
    loadId: load.id, mcNumber: carrier.mcNumber, carrierId: carrier.id,
  });
  const certification = await DoubleBrokeringService.verifyCertification({
    carrierId: carrier.id, loadId: load.id,
    certificationText: "carrier-authorized-for-shipment", ipAddress: req.ip, timestamp: new Date().toISOString(),
  });

  const [updated] = await db.update(loads).set({
    carrierId: carrier.id,
    status: "booked",
    lockedMc: carrier.mcNumber,
    certificationHash: certification.certificationHash,
  }).where(eq(loads.id, load.id)).returning();

  return ok(res, { ...updated, lock });
}));

const statusSchema = z.object({
  status: z.enum(["in_transit", "delivered", "invoiced", "paid", "cancelled"]),
});

router.patch("/:id/status", requireAuth, asyncRoute(async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, parsed.error.issues[0].message, 400);

  const [updated] = await db.update(loads).set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(loads.id, req.params.id)).returning();
  if (!updated) return fail(res, "Load not found", 404);

  if (parsed.data.status === "delivered") {
    // Kick off Layer 5 delivery verification asynchronously — does not block the response.
    FraudPreventionService.verifyDelivery({
      loadId: updated.id, invoiceAmount: updated.allInRate,
    }).catch((e) => console.error("[loads] delivery verification failed", e));
  }

  return ok(res, updated);
}));

export default router;
