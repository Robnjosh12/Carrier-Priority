/**
 * CARRIER PRIORITY — Database Seed
 * ==================================
 * Populates a fresh database with realistic demo data:
 * 1 carrier, 3 drivers, 3 trucks, 8 loads, 4 invoices, 3 fraud flags,
 * 3 introduced relationships, and compliance records for every driver/truck.
 *
 * Run with: npm run db:seed
 */

import "dotenv/config";
import { db, pool } from "./index.js";
import {
  carriers, users, drivers, trucks, trailers, shippers, loads,
  invoices, fraudFlags, complianceItems, introducedRelationships,
} from "./schema.js";
import { AuthService } from "../services/index.js";

async function seed() {
  console.log("[seed] Starting...");

  // ─── Carrier: Stewart Trucking LLC ─────────────────────────────
  const [carrier] = await db.insert(carriers).values({
    name: "Stewart Trucking LLC",
    mcNumber: "MC-847291",
    dotNumber: "DOT-3841029",
    ein: "84-7291000",
    plan: "fleet",
    truckCount: 3,
    phone: "614-555-0148",
    email: "dispatch@stewarttrucking.com",
    trustScore: 74,
    fmcsaVerified: true,
    einVerified: true,
  }).returning();
  console.log(`[seed] Carrier created: ${carrier.name} (${carrier.id})`);

  const passwordHash = await AuthService.hashPassword("ChangeMe123!");
  const [owner] = await db.insert(users).values({
    carrierId: carrier.id,
    email: "stewart@carrierpriority.com",
    passwordHash,
    role: "owner",
    firstName: "Stewart",
    lastName: "Gbenpelle",
    phone: "614-555-0148",
    phoneVerified: true,
  }).returning();
  console.log(`[seed] Owner user created: ${owner.email} (demo password: ChangeMe123!)`);

  // ─── Drivers ────────────────────────────────────────────────────
  const driverSeeds = [
    { firstName: "Marcus", lastName: "Webb", phone: "614-555-0201", cdlNumber: "OH-CDL-118823",
      cdlExpiresAt: daysFromNow(420), medCardExpiresAt: daysFromNow(300), eldDeviceId: "SAM-7712",
      onTimeRate: "96.50", loadsCompleted: 142 },
    { firstName: "Rosa", lastName: "Delgado", phone: "614-555-0202", cdlNumber: "OH-CDL-229914",
      cdlExpiresAt: daysFromNow(180), medCardExpiresAt: daysFromNow(60), eldDeviceId: "SAM-7713",
      onTimeRate: "98.10", loadsCompleted: 201 },
    { firstName: "James", lastName: "Okafor", phone: "614-555-0203", cdlNumber: "OH-CDL-330456",
      cdlExpiresAt: daysFromNow(730), medCardExpiresAt: daysFromNow(540), eldDeviceId: "MOT-4451",
      onTimeRate: "94.20", loadsCompleted: 88 },
  ];
  const insertedDrivers = [];
  for (const d of driverSeeds) {
    const [row] = await db.insert(drivers).values({ ...d, carrierId: carrier.id }).returning();
    insertedDrivers.push(row);
  }
  console.log(`[seed] ${insertedDrivers.length} drivers created`);

  // ─── Trucks ─────────────────────────────────────────────────────
  const truckSeeds = [
    { unitNumber: "T-101", make: "Kenworth", model: "T680", year: 2022, vin: "1XKAD49X8NJ123456",
      plate: "OH-TRK101", eldDeviceId: "SAM-7712", registrationExpiresAt: daysFromNow(200),
      inspectionExpiresAt: daysFromNow(90), mileage: 214500, nextPmDueMileage: 215000,
      assignedDriverId: insertedDrivers[0].id },
    { unitNumber: "T-102", make: "Peterbilt", model: "579", year: 2021, vin: "1XPBD49X1MD654321",
      plate: "OH-TRK102", eldDeviceId: "SAM-7713", registrationExpiresAt: daysFromNow(150),
      inspectionExpiresAt: daysFromNow(45), mileage: 298700, nextPmDueMileage: 300000,
      assignedDriverId: insertedDrivers[1].id },
    { unitNumber: "T-103", make: "Freightliner", model: "Cascadia", year: 2023, vin: "3AKJHHDR5PSAB7890",
      plate: "OH-TRK103", eldDeviceId: "MOT-4451", registrationExpiresAt: daysFromNow(300),
      inspectionExpiresAt: daysFromNow(120), mileage: 87200, nextPmDueMileage: 90000,
      assignedDriverId: insertedDrivers[2].id },
  ];
  const insertedTrucks = [];
  for (const t of truckSeeds) {
    const [row] = await db.insert(trucks).values({ ...t, carrierId: carrier.id }).returning();
    insertedTrucks.push(row);
  }
  console.log(`[seed] ${insertedTrucks.length} trucks created`);

  await db.insert(trailers).values([
    { carrierId: carrier.id, unitNumber: "TR-201", type: "dry_van", vin: "1DTV532N4",
      inspectionExpiresAt: daysFromNow(100), assignedTruckId: insertedTrucks[0].id },
    { carrierId: carrier.id, unitNumber: "TR-202", type: "reefer", vin: "1RFR991B2",
      inspectionExpiresAt: daysFromNow(75), assignedTruckId: insertedTrucks[1].id },
    { carrierId: carrier.id, unitNumber: "TR-203", type: "flatbed", vin: "1FLB447C8",
      inspectionExpiresAt: daysFromNow(140), assignedTruckId: insertedTrucks[2].id },
  ]);
  console.log("[seed] 3 trailers created");

  // ─── Shippers ───────────────────────────────────────────────────
  const shipperSeeds = [
    { name: "Acme Freight Inc", mcNumber: "MC-229310", grade: "A", fmcsaVerified: true, email: "ops@acmefreight.com" },
    { name: "Global Cold Chain", mcNumber: "MC-441820", grade: "B", fmcsaVerified: true, email: "dispatch@globalcoldchain.com" },
    { name: "MidSouth Logistics", mcNumber: "MC-558841", grade: "C", fmcsaVerified: false, email: "loads@midsouthlogistics.com" },
    { name: "NorthEast Freight Co", mcNumber: "MC-774412", grade: "A", fmcsaVerified: true, email: "book@nefreight.com" },
  ];
  const insertedShippers = [];
  for (const s of shipperSeeds) {
    const [row] = await db.insert(shippers).values(s).returning();
    insertedShippers.push(row);
  }
  console.log(`[seed] ${insertedShippers.length} shippers created`);

  // ─── Loads (8 total, mirrors the frontend mock set) ─────────────
  const loadSeeds = [
    { refCode: "RL-4412", shipperId: insertedShippers[0].id, carrierId: carrier.id, driverId: insertedDrivers[0].id,
      originCity: "Columbus, OH", destCity: "Atlanta, GA", miles: 587, deadheadMiles: 34,
      allInRate: "1491.00", equipmentType: "dry_van", weight: 42000, commodity: "Auto Parts",
      status: "in_transit", lockedMc: "MC-847291" },
    { refCode: "RL-4413", shipperId: insertedShippers[1].id, originCity: "Chicago, IL", destCity: "Dallas, TX",
      miles: 921, deadheadMiles: 67, allInRate: "2689.00", equipmentType: "reefer", weight: 38000,
      commodity: "Frozen Food", status: "posted" },
    { refCode: "RL-4414", shipperId: insertedShippers[2].id, originCity: "Memphis, TN", destCity: "Miami, FL",
      miles: 1098, deadheadMiles: 112, allInRate: "3052.00", equipmentType: "flatbed", weight: 44500,
      commodity: "Steel Coils", status: "posted" },
    { refCode: "RL-4415", shipperId: insertedShippers[0].id, carrierId: carrier.id, driverId: insertedDrivers[1].id,
      originCity: "Louisville, KY", destCity: "Charlotte, NC", miles: 432, deadheadMiles: 28,
      allInRate: "1127.00", equipmentType: "dry_van", weight: 39000, commodity: "Consumer Goods",
      status: "booked", lockedMc: "MC-847291" },
    { refCode: "RL-4416", shipperId: insertedShippers[1].id, carrierId: carrier.id, driverId: insertedDrivers[0].id,
      originCity: "Nashville, TN", destCity: "Philadelphia, PA", miles: 761, deadheadMiles: 52,
      allInRate: "2344.00", equipmentType: "reefer", weight: 36000, commodity: "Dairy Products",
      status: "delivered", lockedMc: "MC-847291" },
    { refCode: "RL-4417", shipperId: insertedShippers[3].id, originCity: "Indianapolis, IN", destCity: "Boston, MA",
      miles: 943, deadheadMiles: 41, allInRate: "2433.00", equipmentType: "dry_van", weight: 40000,
      commodity: "Electronics", status: "posted" },
    { refCode: "RL-4418", shipperId: insertedShippers[3].id, carrierId: carrier.id, driverId: insertedDrivers[2].id,
      originCity: "Cleveland, OH", destCity: "Richmond, VA", miles: 489, deadheadMiles: 22,
      allInRate: "1298.00", equipmentType: "dry_van", weight: 41000, commodity: "Building Materials",
      status: "delivered", lockedMc: "MC-847291" },
    { refCode: "RL-4419", shipperId: insertedShippers[2].id, originCity: "Kansas City, MO", destCity: "Denver, CO",
      miles: 605, deadheadMiles: 95, allInRate: "1150.00", equipmentType: "cargo_van", weight: 8000,
      commodity: "Retail Goods", status: "posted" },
  ];
  const insertedLoads = [];
  for (const l of loadSeeds) {
    const [row] = await db.insert(loads).values(l).returning();
    insertedLoads.push(row);
  }
  console.log(`[seed] ${insertedLoads.length} loads created`);

  // ─── Invoices (4) ────────────────────────────────────────────────
  const invoiceSeeds = [
    { loadId: insertedLoads[4].id, carrierId: carrier.id, amount: "2344.00", status: "paid",
      quickPay: true, quickPayFeePct: "2.00", quickPayFeeAmount: "46.88", netPayoutAmount: "2297.12",
      paidAt: daysFromNow(-3) },
    { loadId: insertedLoads[6].id, carrierId: carrier.id, amount: "1298.00", status: "approved" },
    { loadId: insertedLoads[0].id, carrierId: carrier.id, amount: "1491.00", status: "submitted" },
    { loadId: insertedLoads[3].id, carrierId: carrier.id, amount: "1127.00", status: "draft" },
  ];
  for (const i of invoiceSeeds) await db.insert(invoices).values(i);
  console.log("[seed] 4 invoices created");

  // ─── Fraud flags (3) ──────────────────────────────────────────────
  const fraudSeeds = [
    { loadId: insertedLoads[2].id, carrierId: null, layer: 1, reason: "Shipper MC not FMCSA-verified",
      severity: "medium", status: "open" },
    { loadId: insertedLoads[2].id, carrierId: null, layer: 2, reason: "High deadhead ratio flagged for reload risk",
      severity: "low", status: "open" },
    { loadId: insertedLoads[0].id, carrierId: carrier.id, layer: 4, reason: "ELD gap of 38 minutes detected mid-transit",
      severity: "medium", status: "resolved", resolvedAt: daysFromNow(-1) },
  ];
  for (const f of fraudSeeds) await db.insert(fraudFlags).values(f);
  console.log("[seed] 3 fraud flags created");

  // ─── Introduced relationships (3) ─────────────────────────────────
  for (let i = 0; i < 3; i++) {
    const introducedAt = daysFromNow(-30 * (i + 1));
    const windowExpiresAt = new Date(introducedAt);
    windowExpiresAt.setMonth(windowExpiresAt.getMonth() + 24);
    await db.insert(introducedRelationships).values({
      carrierId: carrier.id, shipperId: insertedShippers[i].id, loadId: insertedLoads[i].id,
      introducedAt, windowExpiresAt,
    });
  }
  console.log("[seed] 3 introduced relationships created");

  // ─── Compliance records for every driver + truck + the carrier ────
  const complianceRows = [
    { carrierId: carrier.id, subjectType: "carrier", subjectId: carrier.id, itemType: "mc_authority", expiresAt: daysFromNow(365) },
    { carrierId: carrier.id, subjectType: "carrier", subjectId: carrier.id, itemType: "insurance", expiresAt: daysFromNow(120) },
    { carrierId: carrier.id, subjectType: "carrier", subjectId: carrier.id, itemType: "ifta", expiresAt: daysFromNow(200) },
    { carrierId: carrier.id, subjectType: "carrier", subjectId: carrier.id, itemType: "irp", expiresAt: daysFromNow(250) },
    { carrierId: carrier.id, subjectType: "carrier", subjectId: carrier.id, itemType: "boc3", expiresAt: daysFromNow(400) },
    ...insertedDrivers.flatMap((d) => [
      { carrierId: carrier.id, subjectType: "driver", subjectId: d.id, itemType: "cdl", expiresAt: d.cdlExpiresAt },
      { carrierId: carrier.id, subjectType: "driver", subjectId: d.id, itemType: "med_card", expiresAt: d.medCardExpiresAt },
      { carrierId: carrier.id, subjectType: "driver", subjectId: d.id, itemType: "drug_test", expiresAt: daysFromNow(180) },
    ]),
    ...insertedTrucks.map((t) => (
      { carrierId: carrier.id, subjectType: "truck", subjectId: t.id, itemType: "insurance", expiresAt: t.registrationExpiresAt }
    )),
  ];
  for (const c of complianceRows) await db.insert(complianceItems).values(c);
  console.log(`[seed] ${complianceRows.length} compliance records created`);

  console.log("[seed] Done.");
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

seed()
  .catch((err) => {
    console.error("[seed] Failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
