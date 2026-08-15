import { Router } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { trucks, trailers } from "../db/schema.js";
import { FraudPreventionService } from "../services/index.js";
import { requireAuth } from "../middleware/auth.js";
import { ok, fail, asyncRoute } from "../utils/respond.js";

const router = Router();

router.get("/", requireAuth, asyncRoute(async (req, res) => {
  const rows = await db.select().from(trucks).where(eq(trucks.carrierId, req.user.company));
  return ok(res, rows);
}));

router.get("/trailers", requireAuth, asyncRoute(async (req, res) => {
  const rows = await db.select().from(trailers).where(eq(trailers.carrierId, req.user.company));
  return ok(res, rows);
}));

const createSchema = z.object({
  unitNumber: z.string().min(1),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number().optional(),
  vin: z.string().optional(),
  plate: z.string().optional(),
  eldDeviceId: z.string().optional(),
  registrationExpiresAt: z.string().datetime().optional(),
  inspectionExpiresAt: z.string().datetime().optional(),
  mileage: z.number().optional(),
  nextPmDueMileage: z.number().optional(),
});

router.post("/", requireAuth, asyncRoute(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, parsed.error.issues[0].message, 400);
  const [row] = await db.insert(trucks).values({ ...parsed.data, carrierId: req.user.company }).returning();
  return ok(res, row, 201);
}));

router.patch("/:id", requireAuth, asyncRoute(async (req, res) => {
  const [row] = await db.update(trucks).set({ ...req.body, updatedAt: new Date() })
    .where(and(eq(trucks.id, req.params.id), eq(trucks.carrierId, req.user.company))).returning();
  if (!row) return fail(res, "Truck not found", 404);

  // PM due warning fires when mileage crosses within 1,000 mi of the next service interval.
  if (row.nextPmDueMileage && row.mileage >= row.nextPmDueMileage - 1000) {
    row._pmWarning = `PM service due within ${row.nextPmDueMileage - row.mileage} miles`;
  }
  return ok(res, row);
}));

/**
 * POST /api/trucks/:id/verify — Layer 3 equipment verification at dispatch.
 */
router.post("/:id/verify", requireAuth, asyncRoute(async (req, res) => {
  const { loadId, plate } = req.body;
  const [row] = await db.select().from(trucks)
    .where(and(eq(trucks.id, req.params.id), eq(trucks.carrierId, req.user.company))).limit(1);
  if (!row) return fail(res, "Truck not found", 404);

  const result = await FraudPreventionService.verifyEquipment({
    vin: row.vin, plate: plate || row.plate, eldDeviceId: row.eldDeviceId, loadId,
  });
  return ok(res, result);
}));

export default router;
