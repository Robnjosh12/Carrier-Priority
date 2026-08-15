import { Router } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { drivers } from "../db/schema.js";
import { FraudPreventionService } from "../services/index.js";
import { requireAuth } from "../middleware/auth.js";
import { ok, fail, asyncRoute } from "../utils/respond.js";

const router = Router();

router.get("/", requireAuth, asyncRoute(async (req, res) => {
  const rows = await db.select().from(drivers).where(eq(drivers.carrierId, req.user.company));
  return ok(res, rows);
}));

router.get("/:id", requireAuth, asyncRoute(async (req, res) => {
  const [row] = await db.select().from(drivers)
    .where(and(eq(drivers.id, req.params.id), eq(drivers.carrierId, req.user.company))).limit(1);
  if (!row) return fail(res, "Driver not found", 404);
  return ok(res, row);
}));

const createSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  cdlNumber: z.string().optional(),
  cdlExpiresAt: z.string().datetime().optional(),
  medCardExpiresAt: z.string().datetime().optional(),
  eldDeviceId: z.string().optional(),
});

router.post("/", requireAuth, asyncRoute(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, parsed.error.issues[0].message, 400);
  const [row] = await db.insert(drivers).values({
    ...parsed.data,
    carrierId: req.user.company,
  }).returning();
  return ok(res, row, 201);
}));

router.patch("/:id", requireAuth, asyncRoute(async (req, res) => {
  const [row] = await db.update(drivers).set({ ...req.body, updatedAt: new Date() })
    .where(and(eq(drivers.id, req.params.id), eq(drivers.carrierId, req.user.company))).returning();
  if (!row) return fail(res, "Driver not found", 404);
  return ok(res, row);
}));

/**
 * POST /api/drivers/:id/verify — Layer 2 fraud check at load acceptance.
 */
router.post("/:id/verify", requireAuth, asyncRoute(async (req, res) => {
  const { loadId } = req.body;
  const [row] = await db.select().from(drivers)
    .where(and(eq(drivers.id, req.params.id), eq(drivers.carrierId, req.user.company))).limit(1);
  if (!row) return fail(res, "Driver not found", 404);

  const result = await FraudPreventionService.verifyDriver({
    driverId: row.id, cdlNumber: row.cdlNumber, cdlExpiry: row.cdlExpiresAt,
    medCardExpiry: row.medCardExpiresAt, loadId,
  });
  return ok(res, result);
}));

export default router;
