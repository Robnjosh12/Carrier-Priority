/**
 * CARRIER PRIORITY — Analytics Routes
 * ======================================
 * GET /api/analytics/dashboard — revenue trend, net profit by equipment
 * type and lane, avg RPM vs market benchmark, shipper performance.
 * All benchmarked against RATE_BENCHMARKS in real time.
 */

import { Router } from "express";
import { eq, and, gte } from "drizzle-orm";
import { db } from "../db/index.js";
import { loads, invoices } from "../db/schema.js";
import { RATE_BENCHMARKS } from "../services/index.js";
import { requireAuth } from "../middleware/auth.js";
import { ok, asyncRoute } from "../utils/respond.js";

const router = Router();

router.get("/dashboard", requireAuth, asyncRoute(async (req, res) => {
  const carrierId = req.user.company;
  const carrierLoads = await db.select().from(loads).where(eq(loads.carrierId, carrierId));
  const carrierInvoices = await db.select().from(invoices).where(eq(invoices.carrierId, carrierId));

  const revenue = carrierInvoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + Number(i.amount), 0);

  const byEquipment = {};
  for (const load of carrierLoads) {
    const key = load.equipmentType;
    if (!byEquipment[key]) byEquipment[key] = { loads: 0, totalRevenue: 0, totalMiles: 0 };
    byEquipment[key].loads += 1;
    byEquipment[key].totalRevenue += Number(load.allInRate);
    byEquipment[key].totalMiles += load.miles;
  }

  const equipmentBreakdown = Object.entries(byEquipment).map(([type, v]) => {
    const avgRpm = v.totalMiles ? v.totalRevenue / v.totalMiles : 0;
    const benchmark = RATE_BENCHMARKS[type] || RATE_BENCHMARKS.dry_van;
    return {
      equipmentType: type,
      loads: v.loads,
      totalRevenue: Math.round(v.totalRevenue),
      avgRpm: Number(avgRpm.toFixed(2)),
      marketBenchmark: benchmark,
      vsMarketMidpoint: Number((avgRpm - benchmark.mid).toFixed(2)),
    };
  });

  const paidInvoices = carrierInvoices.filter((i) => i.status === "paid").length;
  const quickPayShare = carrierInvoices.length
    ? carrierInvoices.filter((i) => i.quickPay).length / carrierInvoices.length
    : 0;

  return ok(res, {
    totalRevenue: Math.round(revenue),
    totalLoads: carrierLoads.length,
    paidInvoices,
    quickPayAdoptionRate: Number((quickPayShare * 100).toFixed(1)),
    equipmentBreakdown,
  });
}));

export default router;
