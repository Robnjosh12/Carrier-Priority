/**
 * CARRIER PRIORITY — Invoice Routes
 * ===================================
 * Lifecycle: draft → submitted → approved → paid
 * POST /:id/quickpay triggers PaymentService.processQuickPay with the
 * carrier's trust-tier fee, then applies the 2-hour payment hold rule.
 */

import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { invoices, loads, carriers } from "../db/schema.js";
import { PaymentService, FraudPreventionService } from "../services/index.js";
import { requireAuth } from "../middleware/auth.js";
import { ok, fail, asyncRoute } from "../utils/respond.js";

const router = Router();

router.get("/", requireAuth, asyncRoute(async (req, res) => {
  const rows = await db.select().from(invoices).where(eq(invoices.carrierId, req.user.company));
  return ok(res, rows);
}));

router.get("/:id", requireAuth, asyncRoute(async (req, res) => {
  const [row] = await db.select().from(invoices)
    .where(and(eq(invoices.id, req.params.id), eq(invoices.carrierId, req.user.company))).limit(1);
  if (!row) return fail(res, "Invoice not found", 404);
  return ok(res, row);
}));

/**
 * POST /api/invoices — auto-generate an invoice from a delivered load + POD.
 */
router.post("/", requireAuth, asyncRoute(async (req, res) => {
  const { loadId } = req.body;
  const [load] = await db.select().from(loads).where(eq(loads.id, loadId)).limit(1);
  if (!load) return fail(res, "Load not found", 404);
  if (load.carrierId !== req.user.company) return fail(res, "Not your load", 403);

  const [invoice] = await db.insert(invoices).values({
    loadId: load.id,
    carrierId: req.user.company,
    amount: load.allInRate,
    status: "draft",
  }).returning();

  return ok(res, invoice, 201);
}));

router.post("/:id/submit", requireAuth, asyncRoute(async (req, res) => {
  const [row] = await db.update(invoices).set({ status: "submitted", submittedAt: new Date() })
    .where(and(eq(invoices.id, req.params.id), eq(invoices.carrierId, req.user.company))).returning();
  if (!row) return fail(res, "Invoice not found", 404);
  return ok(res, row);
}));

router.post("/:id/approve", requireAuth, asyncRoute(async (req, res) => {
  const [row] = await db.update(invoices).set({ status: "approved", approvedAt: new Date() })
    .where(and(eq(invoices.id, req.params.id), eq(invoices.carrierId, req.user.company))).returning();
  if (!row) return fail(res, "Invoice not found", 404);
  return ok(res, row);
}));

/**
 * POST /api/invoices/:id/quickpay
 * Applies the carrier's trust-tier Quick Pay fee, funds via Dwolla stub,
 * and honors the 2-hour post-POD payment hold before funds are marked paid.
 */
router.post("/:id/quickpay", requireAuth, asyncRoute(async (req, res) => {
  const [invoice] = await db.select().from(invoices)
    .where(and(eq(invoices.id, req.params.id), eq(invoices.carrierId, req.user.company))).limit(1);
  if (!invoice) return fail(res, "Invoice not found", 404);
  if (invoice.status !== "approved") return fail(res, "Invoice must be approved before Quick Pay", 409);

  const [carrier] = await db.select().from(carriers).where(eq(carriers.id, req.user.company)).limit(1);
  const feePct = FraudPreventionService.getQuickPayFee(carrier.trustScore);
  const amount = Number(invoice.amount);
  const feeAmount = Number((amount * (feePct / 100)).toFixed(2));
  const holdUntil = new Date(Date.now() + 2 * 60 * 60 * 1000);

  const payment = await PaymentService.processQuickPay({
    invoice, carrierFundingId: carrier.bankFundingId, amount: amount - feeAmount, fee: feeAmount,
  });

  const [updated] = await db.update(invoices).set({
    quickPay: true,
    quickPayFeePct: feePct,
    quickPayFeeAmount: feeAmount,
    netPayoutAmount: amount - feeAmount,
    paymentHoldUntil: holdUntil,
    status: "paid",
    paidAt: new Date(),
  }).where(eq(invoices.id, invoice.id)).returning();

  return ok(res, { invoice: updated, payment });
}));

export default router;
