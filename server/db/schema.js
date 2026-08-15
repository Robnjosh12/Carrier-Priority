/**
 * CARRIER PRIORITY — Database Schema
 * ===================================
 * PostgreSQL via Drizzle ORM. 18 tables.
 * All primary keys are UUIDs. All tables carry created_at / updated_at.
 * Foreign keys enforced at the database level. Indexes on hot columns.
 */

import {
  pgTable, uuid, varchar, text, integer, numeric, boolean,
  timestamp, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

const timestamps = {
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
};

// ─── 1. CARRIERS ───────────────────────────────────────────────
export const carriers = pgTable("carriers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  mcNumber: varchar("mc_number", { length: 32 }).notNull(),
  dotNumber: varchar("dot_number", { length: 32 }).notNull(),
  ein: varchar("ein", { length: 32 }),
  plan: varchar("plan", { length: 32 }).notNull().default("solo"), // solo | fleet | enterprise
  truckCount: integer("truck_count").notNull().default(1),
  phone: varchar("phone", { length: 32 }),
  email: varchar("email", { length: 255 }),
  bankFundingId: varchar("bank_funding_id", { length: 128 }), // Dwolla funding source
  trustScore: integer("trust_score").notNull().default(50),
  fmcsaVerified: boolean("fmcsa_verified").notNull().default(false),
  einVerified: boolean("ein_verified").notNull().default(false),
  stripeCustomerId: varchar("stripe_customer_id", { length: 128 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 128 }),
  ...timestamps,
}, (t) => ({
  mcIdx: uniqueIndex("carriers_mc_idx").on(t.mcNumber),
}));

// ─── 2. USERS ───────────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  carrierId: uuid("carrier_id").notNull().references(() => carriers.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 32 }).notNull().default("owner"), // owner | dispatcher | driver
  firstName: varchar("first_name", { length: 128 }),
  lastName: varchar("last_name", { length: 128 }),
  phone: varchar("phone", { length: 32 }),
  phoneVerified: boolean("phone_verified").notNull().default(false),
  pushToken: varchar("push_token", { length: 255 }),
  lastLoginAt: timestamp("last_login_at"),
  ...timestamps,
}, (t) => ({
  emailIdx: uniqueIndex("users_email_idx").on(t.email),
  carrierIdx: index("users_carrier_idx").on(t.carrierId),
}));

// ─── 3. REFRESH TOKENS ─────────────────────────────────────────
export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 255 }).notNull(),
  ip: varchar("ip", { length: 64 }),
  userAgent: text("user_agent"),
  revoked: boolean("revoked").notNull().default(false),
  expiresAt: timestamp("expires_at").notNull(),
  ...timestamps,
}, (t) => ({
  userIdx: index("refresh_tokens_user_idx").on(t.userId),
}));

// ─── 4. SHIPPERS ───────────────────────────────────────────────
export const shippers = pgTable("shippers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  mcNumber: varchar("mc_number", { length: 32 }),
  grade: varchar("grade", { length: 1 }).notNull().default("C"), // A B C D F
  fmcsaVerified: boolean("fmcsa_verified").notNull().default(false),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 32 }),
  ...timestamps,
}, (t) => ({
  mcIdx: index("shippers_mc_idx").on(t.mcNumber),
}));

// ─── 5. LOADS ───────────────────────────────────────────────────
export const loads = pgTable("loads", {
  id: uuid("id").primaryKey().defaultRandom(),
  refCode: varchar("ref_code", { length: 32 }).notNull(), // e.g. RL-4412
  shipperId: uuid("shipper_id").references(() => shippers.id),
  carrierId: uuid("carrier_id").references(() => carriers.id), // null until booked
  driverId: uuid("driver_id"), // fk added below after drivers table (circular-safe via app logic)
  originCity: varchar("origin_city", { length: 128 }).notNull(),
  originLat: numeric("origin_lat", { precision: 9, scale: 6 }),
  originLng: numeric("origin_lng", { precision: 9, scale: 6 }),
  destCity: varchar("dest_city", { length: 128 }).notNull(),
  destLat: numeric("dest_lat", { precision: 9, scale: 6 }),
  destLng: numeric("dest_lng", { precision: 9, scale: 6 }),
  miles: integer("miles").notNull(),
  deadheadMiles: integer("deadhead_miles").notNull().default(0),
  allInRate: numeric("all_in_rate", { precision: 10, scale: 2 }).notNull(),
  equipmentType: varchar("equipment_type", { length: 32 }).notNull(), // dry_van | reefer | flatbed | cargo_van
  weight: integer("weight"),
  commodity: varchar("commodity", { length: 128 }),
  pickupAt: timestamp("pickup_at"),
  dropAt: timestamp("drop_at"),
  status: varchar("status", { length: 32 }).notNull().default("posted"), // posted|booked|in_transit|delivered|invoiced|paid|cancelled
  lockedMc: varchar("locked_mc", { length: 32 }), // double-brokering MC lock
  certificationHash: varchar("certification_hash", { length: 128 }),
  detentionTerms: varchar("detention_terms", { length: 128 }),
  postedAt: timestamp("posted_at").notNull().defaultNow(),
  ...timestamps,
}, (t) => ({
  statusIdx: index("loads_status_idx").on(t.status),
  carrierIdx: index("loads_carrier_idx").on(t.carrierId),
  refIdx: uniqueIndex("loads_ref_idx").on(t.refCode),
}));

// ─── 6. LOAD EVENTS (audit trail / timeline per load) ─────────
export const loadEvents = pgTable("load_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  loadId: uuid("load_id").notNull().references(() => loads.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 64 }).notNull(), // posted|booked|picked_up|eld_gap|deviation|delivered|pod_uploaded|paid
  data: jsonb("data"),
  actorUserId: uuid("actor_user_id"),
  ...timestamps,
}, (t) => ({
  loadIdx: index("load_events_load_idx").on(t.loadId),
}));

// ─── 7. DRIVERS ─────────────────────────────────────────────────
export const drivers = pgTable("drivers", {
  id: uuid("id").primaryKey().defaultRandom(),
  carrierId: uuid("carrier_id").notNull().references(() => carriers.id, { onDelete: "cascade" }),
  firstName: varchar("first_name", { length: 128 }).notNull(),
  lastName: varchar("last_name", { length: 128 }).notNull(),
  phone: varchar("phone", { length: 32 }),
  cdlNumber: varchar("cdl_number", { length: 64 }),
  cdlExpiresAt: timestamp("cdl_expires_at"),
  medCardExpiresAt: timestamp("med_card_expires_at"),
  drugConsortiumStatus: varchar("drug_consortium_status", { length: 32 }).default("active"),
  eldDeviceId: varchar("eld_device_id", { length: 64 }),
  status: varchar("status", { length: 32 }).notNull().default("active"), // active|on_load|off_duty|inactive
  hosRemainingMinutes: integer("hos_remaining_minutes").default(660),
  onTimeRate: numeric("on_time_rate", { precision: 5, scale: 2 }).default("100"),
  loadsCompleted: integer("loads_completed").default(0),
  ...timestamps,
}, (t) => ({
  carrierIdx: index("drivers_carrier_idx").on(t.carrierId),
}));

// ─── 8. TRUCKS ──────────────────────────────────────────────────
export const trucks = pgTable("trucks", {
  id: uuid("id").primaryKey().defaultRandom(),
  carrierId: uuid("carrier_id").notNull().references(() => carriers.id, { onDelete: "cascade" }),
  unitNumber: varchar("unit_number", { length: 32 }).notNull(),
  make: varchar("make", { length: 64 }),
  model: varchar("model", { length: 64 }),
  year: integer("year"),
  vin: varchar("vin", { length: 32 }),
  plate: varchar("plate", { length: 32 }),
  eldDeviceId: varchar("eld_device_id", { length: 64 }),
  registrationExpiresAt: timestamp("registration_expires_at"),
  inspectionExpiresAt: timestamp("inspection_expires_at"),
  mileage: integer("mileage").default(0),
  nextPmDueMileage: integer("next_pm_due_mileage"),
  assignedDriverId: uuid("assigned_driver_id").references(() => drivers.id),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  ...timestamps,
}, (t) => ({
  carrierIdx: index("trucks_carrier_idx").on(t.carrierId),
  vinIdx: index("trucks_vin_idx").on(t.vin),
}));

// ─── 9. TRAILERS ────────────────────────────────────────────────
export const trailers = pgTable("trailers", {
  id: uuid("id").primaryKey().defaultRandom(),
  carrierId: uuid("carrier_id").notNull().references(() => carriers.id, { onDelete: "cascade" }),
  unitNumber: varchar("unit_number", { length: 32 }).notNull(),
  type: varchar("type", { length: 32 }), // dry_van | reefer | flatbed
  vin: varchar("vin", { length: 32 }),
  inspectionExpiresAt: timestamp("inspection_expires_at"),
  assignedTruckId: uuid("assigned_truck_id").references(() => trucks.id),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  ...timestamps,
}, (t) => ({
  carrierIdx: index("trailers_carrier_idx").on(t.carrierId),
}));

// ─── 10. INVOICES ───────────────────────────────────────────────
export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  loadId: uuid("load_id").notNull().references(() => loads.id),
  carrierId: uuid("carrier_id").notNull().references(() => carriers.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("draft"), // draft|submitted|approved|paid|disputed
  quickPay: boolean("quick_pay").notNull().default(false),
  quickPayFeePct: numeric("quick_pay_fee_pct", { precision: 4, scale: 2 }),
  quickPayFeeAmount: numeric("quick_pay_fee_amount", { precision: 10, scale: 2 }),
  netPayoutAmount: numeric("net_payout_amount", { precision: 10, scale: 2 }),
  podUploadedAt: timestamp("pod_uploaded_at"),
  paymentHoldUntil: timestamp("payment_hold_until"), // 2-hour hold
  disputeWindowUntil: timestamp("dispute_window_until"), // 4-hour shipper window
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  paidAt: timestamp("paid_at"),
  ...timestamps,
}, (t) => ({
  loadIdx: index("invoices_load_idx").on(t.loadId),
  carrierIdx: index("invoices_carrier_idx").on(t.carrierId),
  statusIdx: index("invoices_status_idx").on(t.status),
}));

// ─── 11. INVOICE PAYMENTS ──────────────────────────────────────
export const invoicePayments = pgTable("invoice_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  method: varchar("method", { length: 32 }).notNull(), // ach_quickpay | ach_standard | factoring
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  dwollaTransferId: varchar("dwolla_transfer_id", { length: 128 }),
  status: varchar("status", { length: 32 }).notNull().default("pending"), // pending|processing|completed|failed
  ...timestamps,
}, (t) => ({
  invoiceIdx: index("invoice_payments_invoice_idx").on(t.invoiceId),
}));

// ─── 12. DOCUMENTS ──────────────────────────────────────────────
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  carrierId: uuid("carrier_id").notNull().references(() => carriers.id, { onDelete: "cascade" }),
  loadId: uuid("load_id").references(() => loads.id),
  type: varchar("type", { length: 32 }).notNull(), // bol|rate_con|pod|insurance|w9|other
  s3Key: varchar("s3_key", { length: 512 }).notNull(),
  filename: varchar("filename", { length: 255 }),
  mimeType: varchar("mime_type", { length: 128 }),
  sizeBytes: integer("size_bytes"),
  virusScanStatus: varchar("virus_scan_status", { length: 32 }).default("pending"),
  podGpsLat: numeric("pod_gps_lat", { precision: 9, scale: 6 }),
  podGpsLng: numeric("pod_gps_lng", { precision: 9, scale: 6 }),
  uploadedByUserId: uuid("uploaded_by_user_id"),
  ...timestamps,
}, (t) => ({
  carrierIdx: index("documents_carrier_idx").on(t.carrierId),
  loadIdx: index("documents_load_idx").on(t.loadId),
}));

// ─── 13. COMPLIANCE ITEMS ───────────────────────────────────────
export const complianceItems = pgTable("compliance_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  carrierId: uuid("carrier_id").notNull().references(() => carriers.id, { onDelete: "cascade" }),
  subjectType: varchar("subject_type", { length: 32 }).notNull(), // carrier|driver|truck
  subjectId: uuid("subject_id"),
  itemType: varchar("item_type", { length: 64 }).notNull(), // mc_authority|insurance|cdl|med_card|ifta|irp|boc3|drug_test
  expiresAt: timestamp("expires_at"),
  status: varchar("status", { length: 32 }).notNull().default("valid"), // valid|expiring|expired
  lastAlertSentAt: timestamp("last_alert_sent_at"),
  ...timestamps,
}, (t) => ({
  carrierIdx: index("compliance_carrier_idx").on(t.carrierId),
  expiresIdx: index("compliance_expires_idx").on(t.expiresAt),
}));

// ─── 14. ELD EVENTS ──────────────────────────────────────────────
export const eldEvents = pgTable("eld_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  loadId: uuid("load_id").references(() => loads.id),
  driverId: uuid("driver_id").references(() => drivers.id),
  truckId: uuid("truck_id").references(() => trucks.id),
  provider: varchar("provider", { length: 32 }), // samsara | motive
  type: varchar("type", { length: 32 }).notNull(), // location|hos|gap|deviation
  lat: numeric("lat", { precision: 9, scale: 6 }),
  lng: numeric("lng", { precision: 9, scale: 6 }),
  hosRemainingMinutes: integer("hos_remaining_minutes"),
  gapMinutes: integer("gap_minutes"),
  deviationMiles: numeric("deviation_miles", { precision: 6, scale: 2 }),
  raw: jsonb("raw"),
  ...timestamps,
}, (t) => ({
  loadIdx: index("eld_events_load_idx").on(t.loadId),
  driverIdx: index("eld_events_driver_idx").on(t.driverId),
}));

// ─── 15. SHIPPER LOADS (shipper portal postings, pre-carrier-match) ──
export const shipperLoads = pgTable("shipper_loads", {
  id: uuid("id").primaryKey().defaultRandom(),
  shipperId: uuid("shipper_id").notNull().references(() => shippers.id, { onDelete: "cascade" }),
  loadId: uuid("load_id").references(() => loads.id),
  postedByUserEmail: varchar("posted_by_user_email", { length: 255 }),
  status: varchar("status", { length: 32 }).notNull().default("open"), // open|matched|closed
  ...timestamps,
}, (t) => ({
  shipperIdx: index("shipper_loads_shipper_idx").on(t.shipperId),
}));

// ─── 16. FRAUD FLAGS ─────────────────────────────────────────────
export const fraudFlags = pgTable("fraud_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  loadId: uuid("load_id").references(() => loads.id),
  carrierId: uuid("carrier_id").references(() => carriers.id),
  layer: integer("layer").notNull(), // 1-5
  reason: varchar("reason", { length: 255 }).notNull(),
  severity: varchar("severity", { length: 16 }).notNull().default("medium"), // low|medium|high|critical
  status: varchar("status", { length: 32 }).notNull().default("open"), // open|reviewing|resolved|escalated
  data: jsonb("data"),
  resolvedAt: timestamp("resolved_at"),
  ...timestamps,
}, (t) => ({
  loadIdx: index("fraud_flags_load_idx").on(t.loadId),
  carrierIdx: index("fraud_flags_carrier_idx").on(t.carrierId),
}));

// ─── 17. TRUST SCORES (historical snapshots) ─────────────────────
export const trustScores = pgTable("trust_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  carrierId: uuid("carrier_id").notNull().references(() => carriers.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  tier: varchar("tier", { length: 32 }).notNull(), // elite|priority|verified|standard
  quickPayFeePct: numeric("quick_pay_fee_pct", { precision: 4, scale: 2 }).notNull(),
  breakdown: jsonb("breakdown"),
  ...timestamps,
}, (t) => ({
  carrierIdx: index("trust_scores_carrier_idx").on(t.carrierId),
}));

// ─── 18. INTRODUCED RELATIONSHIPS ────────────────────────────────
export const introducedRelationships = pgTable("introduced_relationships", {
  id: uuid("id").primaryKey().defaultRandom(),
  carrierId: uuid("carrier_id").notNull().references(() => carriers.id, { onDelete: "cascade" }),
  shipperId: uuid("shipper_id").notNull().references(() => shippers.id, { onDelete: "cascade" }),
  loadId: uuid("load_id").references(() => loads.id),
  introducedAt: timestamp("introduced_at").notNull().defaultNow(),
  windowExpiresAt: timestamp("window_expires_at").notNull(), // introducedAt + 24 months
  offPlatformDetected: boolean("off_platform_detected").notNull().default(false),
  feeInvoiceId: uuid("fee_invoice_id"),
  ...timestamps,
}, (t) => ({
  carrierShipperIdx: index("introduced_carrier_shipper_idx").on(t.carrierId, t.shipperId),
}));

// ─── RELATIONS ────────────────────────────────────────────────────
export const carriersRelations = relations(carriers, ({ many }) => ({
  users: many(users),
  drivers: many(drivers),
  trucks: many(trucks),
  loads: many(loads),
  invoices: many(invoices),
}));

export const loadsRelations = relations(loads, ({ one, many }) => ({
  shipper: one(shippers, { fields: [loads.shipperId], references: [shippers.id] }),
  carrier: one(carriers, { fields: [loads.carrierId], references: [carriers.id] }),
  events: many(loadEvents),
  invoices: many(invoices),
  documents: many(documents),
  fraudFlags: many(fraudFlags),
}));

export const driversRelations = relations(drivers, ({ one }) => ({
  carrier: one(carriers, { fields: [drivers.carrierId], references: [carriers.id] }),
}));

export const trucksRelations = relations(trucks, ({ one }) => ({
  carrier: one(carriers, { fields: [trucks.carrierId], references: [carriers.id] }),
  assignedDriver: one(drivers, { fields: [trucks.assignedDriverId], references: [drivers.id] }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  load: one(loads, { fields: [invoices.loadId], references: [loads.id] }),
  carrier: one(carriers, { fields: [invoices.carrierId], references: [carriers.id] }),
  payments: many(invoicePayments),
}));
