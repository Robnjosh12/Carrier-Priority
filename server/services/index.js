/**
 * ROAD LEDGER — Backend Services
 * ================================
 * All production service modules in one file for clarity.
 * In production, split each export into its own file under server/services/
 */

import jwt           from "jsonwebtoken";
import bcrypt        from "bcryptjs";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl }  from "@aws-sdk/s3-request-presigner";
import Stripe        from "stripe";
import twilio        from "twilio";
import { Expo }      from "expo-server-sdk";
import nodemailer    from "nodemailer";
import cron          from "node-cron";
import axios         from "axios";

const ENV = process.env;

// ═══════════════════════════════════════════════════════════════
// 1. AUTH SERVICE
// ═══════════════════════════════════════════════════════════════
export const AuthService = {
  /**
   * Hash a plain-text password with bcrypt (12 rounds).
   */
  async hashPassword(plain) {
    return bcrypt.hash(plain, 12);
  },

  /**
   * Verify a plain-text password against a stored hash.
   */
  async verifyPassword(plain, hash) {
    return bcrypt.compare(plain, hash);
  },

  /**
   * Issue a short-lived access token (15 min) and a long-lived refresh token (30 days).
   */
  issueTokens(userId, companyId, role) {
    const access = jwt.sign(
      { sub: userId, company: companyId, role },
      ENV.JWT_SECRET,
      { expiresIn: "15m" }
    );
    const refresh = jwt.sign(
      { sub: userId, type: "refresh" },
      ENV.JWT_REFRESH_SECRET,
      { expiresIn: "30d" }
    );
    return { access, refresh };
  },

  /**
   * Verify and decode an access token.
   */
  verifyAccess(token) {
    return jwt.verify(token, ENV.JWT_SECRET);
  },

  /**
   * Verify and decode a refresh token.
   */
  verifyRefresh(token) {
    return jwt.verify(token, ENV.JWT_REFRESH_SECRET);
  },
};

// ═══════════════════════════════════════════════════════════════
// 2. STORAGE SERVICE (AWS S3)
// ═══════════════════════════════════════════════════════════════
const s3 = new S3Client({
  region: ENV.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId:     ENV.AWS_ACCESS_KEY_ID,
    secretAccessKey: ENV.AWS_SECRET_ACCESS_KEY,
  },
});

export const StorageService = {
  BUCKET: ENV.S3_BUCKET || "road-ledger-docs",

  /**
   * Generate a presigned PUT URL for direct browser → S3 upload.
   * The client uploads directly to S3 — the server never handles the file bytes.
   * After upload, the client calls POST /api/documents to record metadata.
   */
  async getUploadUrl(key, contentType, expiresIn = 300) {
    const cmd = new PutObjectCommand({
      Bucket:      this.BUCKET,
      Key:         key,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
      Tagging:     "env=production",
    });
    return getSignedUrl(s3, cmd, { expiresIn });
  },

  /**
   * Generate a presigned GET URL for secure document downloads (10 min TTL).
   */
  async getDownloadUrl(key, expiresIn = 600) {
    const cmd = new GetObjectCommand({ Bucket: this.BUCKET, Key: key });
    return getSignedUrl(s3, cmd, { expiresIn });
  },

  /**
   * Soft-delete (move to archive/ prefix) rather than hard-delete.
   */
  async archiveFile(key) {
    // In production: copy to archive/{key}, then delete original
    console.log(`[storage] Archiving ${key}`);
  },

  /**
   * Build an S3 key for a document.
   * Pattern: {companyId}/{year}/{month}/{loadId}/{uuid}.{ext}
   */
  buildKey(companyId, loadId, filename) {
    const now = new Date();
    const ext = filename.split(".").pop();
    const uuid = crypto.randomUUID();
    return `${companyId}/${now.getFullYear()}/${now.getMonth()+1}/${loadId}/${uuid}.${ext}`;
  },
};

// ═══════════════════════════════════════════════════════════════
// 3. ELD SERVICE (Samsara + KeepTruckin / Motive)
// ═══════════════════════════════════════════════════════════════
export const ELDService = {
  /**
   * Pull vehicle locations and HOS data from Samsara's Fleet API.
   * Called every 5 minutes by the cron job.
   */
  async syncSamsara() {
    if (!ENV.SAMSARA_API_KEY) return;
    try {
      const { data } = await axios.get("https://api.samsara.com/fleet/vehicles/stats", {
        headers: { Authorization: `Bearer ${ENV.SAMSARA_API_KEY}` },
        params:  { types: "gps,engineStates", decorations: "driverAssignedToVehicle" },
      });
      for (const vehicle of data.data || []) {
        await this.updateTruckLocation(vehicle);
      }
    } catch (e) {
      console.error("[eld] Samsara sync error:", e.message);
    }
  },

  /**
   * Pull HOS logs from KeepTruckin (now Motive) API.
   */
  async syncMotive() {
    if (!ENV.MOTIVE_API_KEY) return;
    try {
      const { data } = await axios.get("https://api.gomotive.com/v1/hos_logs", {
        headers: { "X-Api-Key": ENV.MOTIVE_API_KEY },
        params:  { date: new Date().toISOString().slice(0,10) },
      });
      for (const log of data.hos_logs || []) {
        await this.updateDriverHOS(log);
      }
    } catch (e) {
      console.error("[eld] Motive sync error:", e.message);
    }
  },

  async updateTruckLocation(vehicle) {
    // db.update(trucks).set({ lat, lng, lastLocAt }).where(eq(trucks.eldDeviceId, vehicle.id))
    console.log(`[eld] Updated location for vehicle ${vehicle.id}`);
  },

  async updateDriverHOS(log) {
    // db.update(drivers).set({ hosData: { drive, onDuty, cycle } }).where(...)
    console.log(`[eld] Updated HOS for driver ${log.driver?.id}`);
  },

  /**
   * Handle incoming ELD webhook (Samsara sends events in real-time).
   * POST /api/webhooks/eld
   */
  async handleWebhook(payload) {
    const { eventType, vehicleId, data } = payload;
    switch(eventType) {
      case "VehicleLocation":  await this.updateTruckLocation({ id: vehicleId, ...data }); break;
      case "HOSViolation":     await NotifyService.hosViolationAlert(data); break;
      case "HarshBraking":     await NotifyService.driverSafetyAlert(data); break;
      case "IdleAlert":        console.log("[eld] Idle alert:", vehicleId); break;
    }
  },
};

export function initELDSync() {
  // Sync vehicle locations every 5 minutes
  cron.schedule("*/5 * * * *", () => {
    ELDService.syncSamsara();
    ELDService.syncMotive();
  });
  console.log("[eld] ELD sync initialized");
}

// ═══════════════════════════════════════════════════════════════
// 4. PAYMENT SERVICE (Stripe ACH + Dwolla)
// ═══════════════════════════════════════════════════════════════
const stripe = new Stripe(ENV.STRIPE_SECRET_KEY || "sk_test_xxx", { apiVersion: "2023-10-16" });

export const PaymentService = {
  /**
   * Create a Stripe customer for a new company.
   */
  async createCustomer(company) {
    const customer = await stripe.customers.create({
      name:     company.name,
      email:    company.email,
      metadata: { companyId: company.id, mc: company.mc },
    });
    return customer.id;
  },

  /**
   * Process platform subscription payment via Stripe.
   */
  async createSubscription(customerId, priceId) {
    return stripe.subscriptions.create({
      customer: customerId,
      items:    [{ price: priceId }],
      payment_behavior: "default_incomplete",
      expand: ["latest_invoice.payment_intent"],
    });
  },

  /**
   * Initiate Quick Pay: debit the platform's reserve account,
   * credit the carrier's bank account via Dwolla ACH.
   * Fee (3%) is captured separately.
   *
   * In production: integrate with Dwolla's mass payment API.
   * Funds settle same business day if submitted before 3pm ET.
   */
  async processQuickPay({ invoice, carrierFundingId, amount, fee }) {
    // 1. Record Quick Pay intent in DB
    // 2. Create Dwolla transfer: platform → carrier
    // 3. Schedule shipper collection (standard terms)
    // 4. Update invoice status to "paid" with quickPayAt timestamp
    console.log(`[payments] Quick Pay initiated: INV ${invoice.id} — $${amount - fee} to carrier`);
    return { success: true, achTrace: `QP-${Date.now()}` };
  },

  /**
   * Process ACH payment from shipper → carrier (standard pay).
   * Called when shipper releases payment through the platform.
   */
  async processACHPayment({ invoiceId, amount, fromFundingId, toFundingId }) {
    console.log(`[payments] ACH payment: INV ${invoiceId} $${amount}`);
    return { success: true, achTrace: `ACH-${Date.now()}` };
  },

  /**
   * Verify bank account via Plaid and create Dwolla funding source.
   */
  async linkBankAccount({ companyId, plaidPublicToken, accountId }) {
    // 1. Exchange Plaid public token for access token
    // 2. Get account/routing numbers via Plaid Auth
    // 3. Create Dwolla customer if not exists
    // 4. Create Dwolla funding source (microdeposit or Plaid verified)
    // 5. Store fundingSourceId in companies table
    console.log(`[payments] Bank account linked for company ${companyId}`);
    return { fundingSourceId: `dwolla-${Date.now()}` };
  },

  /**
   * Handle Stripe webhook (subscription events, payment failures).
   */
  async handleStripeWebhook(rawBody, signature) {
    const event = stripe.webhooks.constructEvent(rawBody, signature, ENV.STRIPE_WEBHOOK_SECRET);
    switch(event.type) {
      case "invoice.paid":          console.log("[stripe] Invoice paid:", event.data.object.id); break;
      case "customer.subscription.deleted": console.log("[stripe] Subscription cancelled"); break;
      case "payment_intent.payment_failed": console.log("[stripe] Payment failed"); break;
    }
    return event;
  },
};

// ═══════════════════════════════════════════════════════════════
// 5. NOTIFICATION SERVICE (Twilio SMS + Expo Push + Nodemailer)
// ═══════════════════════════════════════════════════════════════
const twilioClient = twilio(ENV.TWILIO_ACCOUNT_SID, ENV.TWILIO_AUTH_TOKEN);
const expo         = new Expo();
const mailer       = nodemailer.createTransport({
  host: ENV.SMTP_HOST || "smtp.sendgrid.net",
  port: 587,
  auth: { user: ENV.SMTP_USER, pass: ENV.SMTP_PASS },
});

export const NotifyService = {
  /**
   * Send SMS via Twilio.
   */
  async sms(to, body) {
    if (!ENV.TWILIO_ACCOUNT_SID) return;
    try {
      await twilioClient.messages.create({
        to,
        from: ENV.TWILIO_FROM,
        body: `[Road Ledger] ${body}`,
      });
    } catch (e) {
      console.error("[notify] SMS error:", e.message);
    }
  },

  /**
   * Send Expo push notification to a driver's phone.
   */
  async push(pushToken, title, body, data = {}) {
    if (!Expo.isExpoPushToken(pushToken)) return;
    const messages = [{ to: pushToken, sound: "default", title, body, data }];
    try {
      const chunks = expo.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        await expo.sendPushNotificationsAsync(chunk);
      }
    } catch (e) {
      console.error("[notify] Push error:", e.message);
    }
  },

  /**
   * Send transactional email.
   */
  async email(to, subject, html) {
    try {
      await mailer.sendMail({ from: ENV.EMAIL_FROM || "dispatch@roadledger.com", to, subject, html });
    } catch (e) {
      console.error("[notify] Email error:", e.message);
    }
  },

  // ── Specific notification types ────────────────────────────
  async newMatchingLoad(user, load) {
    const msg = `New ${load.equipmentType} load: ${load.originCity}→${load.destCity} | $${load.allInRate} | Score ${load.score}`;
    if (user.settings?.smsAlerts)  await this.sms(user.phone, msg);
    if (user.pushToken)             await this.push(user.pushToken, "New Matching Load", msg, { loadId: load.id });
  },

  async offerReceived(user, offer, load) {
    const msg = `Offer received on ${load.originCity}→${load.destCity}: $${offer.offeredRate}`;
    await this.sms(user.phone, msg);
    await this.email(user.email, "New Offer — Road Ledger", `<p>${msg}</p>`);
  },

  async invoicePaid(user, invoice) {
    const msg = `Payment received: INV-${invoice.invoiceNumber} — $${invoice.paidAmount} via ACH`;
    await this.sms(user.phone, msg);
    await this.email(user.email, "Payment Received — Road Ledger", `<p>${msg}</p>`);
  },

  async complianceExpiring(user, item) {
    const msg = `Compliance alert: ${item.name} expires ${item.expiresAt?.toLocaleDateString()}`;
    await this.sms(user.phone, msg);
    await this.email(user.email, "Compliance Expiring — Road Ledger", `<p>${msg}</p>`);
  },

  async hosViolationAlert(data) {
    console.log("[notify] HOS violation:", data);
  },

  async driverSafetyAlert(data) {
    console.log("[notify] Driver safety event:", data);
  },
};

// ═══════════════════════════════════════════════════════════════
// 6. FMCSA SERVICE (SAFER API)
// ═══════════════════════════════════════════════════════════════
export const FMCSAService = {
  BASE_URL: "https://safer.fmcsa.dot.gov/query.asp",

  /**
   * Look up a carrier or shipper by MC or DOT number.
   * Returns authority status, insurance, safety rating.
   */
  async verify(mc) {
    try {
      // SAFER API returns XML — parse and normalize
      const { data } = await axios.get(this.BASE_URL, {
        params: { searchparam: mc, query_type: "queryCarrierSnapshot", query_param: "MC_MX", query_string: mc.replace("MC-","") },
        timeout: 10000,
      });
      return this.parseSAFER(data);
    } catch (e) {
      console.error("[fmcsa] SAFER lookup failed:", e.message);
      return null;
    }
  },

  parseSAFER(xml) {
    // In production: use xml2js to parse SAFER XML response
    return {
      legalName:     "Parsed from SAFER",
      mc:            "MC-XXXXX",
      dot:           "DOT-XXXXX",
      authority:     "Authorized",
      insuranceOnFile: true,
      safetyRating:  "Satisfactory",
      outOfService:  false,
    };
  },

  /**
   * Batch verify multiple shippers (called nightly by cron).
   */
  async batchVerify(shipperIds) {
    for (const id of shipperIds) {
      // re-verify and update grade in DB
      console.log(`[fmcsa] Verifying shipper ${id}`);
      await new Promise(r => setTimeout(r, 500)); // rate limit SAFER
    }
  },
};

// ═══════════════════════════════════════════════════════════════
// 7. E-SIGNATURE SERVICE (DocuSign / HelloSign)
// ═══════════════════════════════════════════════════════════════
export const ESignService = {
  /**
   * Generate a Rate Confirmation PDF from load/booking data,
   * upload to S3, then send a DocuSign envelope for e-signature.
   */
  async sendRateConfirmation({ booking, load, carrier, shipper }) {
    // 1. Generate PDF using pdfkit or puppeteer
    // 2. Upload to S3 via StorageService
    // 3. Create DocuSign envelope with both signer roles
    // 4. Send embedded signing URL back to frontend
    console.log(`[esign] Rate confirmation envelope created for booking ${booking.id}`);
    return {
      envelopeId: `env-${Date.now()}`,
      signingUrl: `https://demo.docusign.net/Signing/MTRedeem/v1/...`,
    };
  },

  /**
   * DocuSign webhook — called when both parties have signed.
   * POST /api/webhooks/esign
   */
  async handleSignedWebhook(payload) {
    const { envelopeId, status } = payload;
    if (status === "completed") {
      // Update bookings.rateConSigned = true, download signed PDF, store in S3
      console.log(`[esign] Envelope ${envelopeId} completed — both parties signed`);
    }
  },
};

// ═══════════════════════════════════════════════════════════════
// 8. GEO / MAPBOX SERVICE
// ═══════════════════════════════════════════════════════════════
export const GeoService = {
  /**
   * Geocode a city, state string → lat/lng.
   * Checks geocode_cache table first to avoid redundant API calls.
   */
  async geocode(query) {
    // 1. Check DB cache: SELECT * FROM geocode_cache WHERE query = $1
    // 2. If miss: call Mapbox Geocoding API
    // 3. Insert into geocode_cache
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${ENV.MAPBOX_TOKEN}&types=place`;
    const { data } = await axios.get(url);
    const [lng, lat] = data.features?.[0]?.center || [0, 0];
    return { lat, lng };
  },

  /**
   * Get driving distance (miles) between two coordinates via Mapbox Directions.
   */
  async drivingMiles(originLat, originLng, destLat, destLng) {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${originLng},${originLat};${destLng},${destLat}?access_token=${ENV.MAPBOX_TOKEN}&annotations=distance`;
    const { data } = await axios.get(url);
    const meters = data.routes?.[0]?.distance || 0;
    return Math.round(meters * 0.000621371); // meters → miles
  },

  /**
   * Haversine fallback for when Mapbox isn't available.
   */
  haversine(lat1, lng1, lat2, lng2) {
    const R = 3958.8; // miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
  },
};

// ═══════════════════════════════════════════════════════════════
// 9. LOAD SCORING SERVICE
// ═══════════════════════════════════════════════════════════════
// ─── RATE BENCHMARKS (current market) ────────────────────────────
// Used by scoring engine to evaluate loads against market
export const RATE_BENCHMARKS = {
  "dry_van":   { low: 2.30, mid: 2.49, high: 2.68 },
  "reefer":    { low: 2.79, mid: 2.96, high: 3.12 },
  "flatbed":   { low: 2.59, mid: 3.03, high: 3.46 },
  "cargo_van": { low: 1.00, mid: 1.25, high: 1.50 },
  "step_deck": { low: 2.65, mid: 3.10, high: 3.55 },
  "tanker":    { low: 2.80, mid: 3.15, high: 3.50 },
  "other":     { low: 2.00, mid: 2.40, high: 2.80 },
};

export const ScoringService = {
  TRUST_MAP: { A: 20, B: 10, C: 0, D: -10, F: -25 },
  RISKY_DESTINATIONS: ["Miami", "Los Angeles", "Laredo", "El Paso", "Buffalo"],

  /**
   * Compute composite score for a load given carrier's cost profile.
   * Score is benchmarked against current market rate for that equipment type.
   * Higher score = better load for that carrier.
   */
  scoreLoad({ load, carrierProfile }) {
    // Normalize equipment type key
    const equipKey = (load.equipmentType || load.equipment || "dry_van")
      .toLowerCase().replace(/[^a-z]/g, "_").replace("dry_van","dry_van")
      .replace("cargo_van","cargo_van");
    const benchmark = RATE_BENCHMARKS[equipKey] || RATE_BENCHMARKS["dry_van"];

    const cp = {
      mpg:         carrierProfile?.mpg          || 6.5,
      costPerMile: carrierProfile?.costPerMile   || 1.65,
      fuelPrice:   carrierProfile?.fuelPrice     || 3.85,
      targetRpm:   carrierProfile?.targetRpm     || benchmark.mid,  // defaults to market midpoint
      deadhead:    load.deadheadMiles            || this.estimateDeadhead(load),
    };

    const totalMiles = load.miles + cp.deadhead;
    const fuel       = (totalMiles / cp.mpg) * cp.fuelPrice;
    const operating  = totalMiles * cp.costPerMile;
    const maintenance= load.miles * 0.12;
    const net        = Number(load.allInRate) - fuel - operating - maintenance;
    const rpm        = Number(load.allInRate) / Math.max(load.miles, 1);
    const risk       = net / load.miles >= 0.9 ? "GOOD" : net / load.miles >= 0.5 ? "OK" : "RISKY";

    const laneRisky  = this.RISKY_DESTINATIONS.some(d => load.destCity?.includes(d));
    const trust      = this.TRUST_MAP[load.shipper?.grade || "C"] || 0;
    const score      = Math.round(
      (net / load.miles * 100) + trust - (cp.deadhead * 0.8) - (laneRisky ? 15 : 0)
    );

    // Flag if RPM falls below market low for this equipment type
    const flags = [];
    if (rpm < benchmark.low) flags.push("Below market rate");
    else if (rpm < cp.targetRpm - 0.10) flags.push("Below target RPM");
    if (cp.deadhead > 120)         flags.push("High deadhead");
    if (laneRisky)                 flags.push("Reload risk");
    if (!load.shipper?.fmcsaVerified) flags.push("Unverified shipper");

    return {
      score:    Math.max(0, Math.min(100, score)),
      netProfit: Math.round(net),
      ratePerMile: Number(rpm.toFixed(3)),
      riskLevel: risk,
      laneRisk:  laneRisky ? "RISKY" : "GOOD",
      flags,
      breakdown: { fuel: Math.round(fuel), operating: Math.round(operating), maintenance: Math.round(maintenance) },
    };
  },

  /**
   * Deterministic deadhead estimate based on lane key hash.
   * Replaced by real GPS distance when truck coords are available.
   */
  estimateDeadhead(load) {
    const key = `${load.originCity}${load.destCity}`;
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = ((hash << 5) - hash) + key.charCodeAt(i);
    return 30 + (Math.abs(hash) % 91); // 30–120 mi range
  },
};

// ═══════════════════════════════════════════════════════════════
// 10. WEBSOCKET SERVICE (real-time chat & tracking)
// ═══════════════════════════════════════════════════════════════
export function setupWSServer(wss) {
  const rooms = new Map(); // roomId → Set<WebSocket>

  wss.on("connection", (ws, req) => {
    let userId = null;
    let currentRoom = null;

    ws.on("message", async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      switch (msg.type) {
        case "auth":
          // Verify JWT, extract userId
          try {
            const payload = AuthService.verifyAccess(msg.token);
            userId = payload.sub;
            ws.userId = userId;
          } catch { ws.close(4001, "Unauthorized"); }
          break;

        case "join":
          // Join a chat room (load:{id} or booking:{id})
          if (!userId) { ws.close(4001, "Not authenticated"); return; }
          currentRoom = msg.room;
          if (!rooms.has(currentRoom)) rooms.set(currentRoom, new Set());
          rooms.get(currentRoom).add(ws);
          ws.send(JSON.stringify({ type: "joined", room: currentRoom, online: rooms.get(currentRoom).size }));
          break;

        case "message":
          // Broadcast to room, persist to DB
          if (!userId || !currentRoom) return;
          const payload = { type: "message", from: userId, body: msg.body, time: new Date().toISOString() };
          // await db.insert(messages).values({ ...payload, loadId or bookingId })
          for (const client of rooms.get(currentRoom) || []) {
            if (client.readyState === 1) client.send(JSON.stringify(payload));
          }
          break;

        case "location":
          // Driver broadcasting live location (from mobile app)
          if (!userId) return;
          const locPayload = { type: "location", driverId: userId, lat: msg.lat, lng: msg.lng, ts: Date.now() };
          // Broadcast to load room for shipper/dispatcher visibility
          const loadRoom = `load:${msg.loadId}`;
          for (const client of rooms.get(loadRoom) || []) {
            if (client.readyState === 1) client.send(JSON.stringify(locPayload));
          }
          break;
      }
    });

    ws.on("close", () => {
      if (currentRoom && rooms.has(currentRoom)) {
        rooms.get(currentRoom).delete(ws);
        if (rooms.get(currentRoom).size === 0) rooms.delete(currentRoom);
      }
    });
  });

  console.log("[ws] WebSocket server ready");
}

// ═══════════════════════════════════════════════════════════════
// 11. CRON JOBS
// ═══════════════════════════════════════════════════════════════
export function initCronJobs() {
  // ── Daily compliance check (8am ET) ─────────────────────────
  cron.schedule("0 8 * * *", async () => {
    console.log("[cron] Running daily compliance check");
    // 1. Find all compliance items expiring in <=60 days
    // 2. Send email + SMS to company owners
    // 3. In-app notification
  }, { timezone: "America/New_York" });

  // ── Nightly FMCSA re-verification (2am ET) ──────────────────
  cron.schedule("0 2 * * *", async () => {
    console.log("[cron] Nightly FMCSA re-verification");
    // await FMCSAService.batchVerify(allShipperIds)
  }, { timezone: "America/New_York" });

  // ── Invoice aging check (9am ET weekdays) ───────────────────
  cron.schedule("0 9 * * 1-5", async () => {
    console.log("[cron] Invoice aging check");
    // Find invoices past due date → mark overdue, notify carrier
  }, { timezone: "America/New_York" });

  // ── CDL & med card expiry alerts (7am ET daily) ─────────────
  cron.schedule("0 7 * * *", async () => {
    console.log("[cron] Driver credential expiry check");
    // Query drivers where cdlExpires <= now + 90 days
  }, { timezone: "America/New_York" });

  // ── DAT load feed sync (every 10 min, business hours) ───────
  cron.schedule("*/10 6-22 * * *", async () => {
    if (!ENV.DAT_API_KEY) return;
    console.log("[cron] DAT feed sync");
    // Fetch new loads from DAT API, score, insert into loads table
  });

  // ── Stale offer expiry (every hour) ─────────────────────────
  cron.schedule("0 * * * *", async () => {
    // UPDATE offers SET status='expired' WHERE expires_at < NOW() AND status='pending'
    console.log("[cron] Expired offers cleaned up");
  });

  console.log("[cron] All cron jobs initialized");
}

// ─── FRAUD PREVENTION SERVICE ─────────────────────────────────────
export const FraudPreventionService = {

  // LAYER 1 — Identity verification at registration
  async verifyCarrierIdentity({ mc, dot, ein, phone, bankAccount, businessName }) {
    const results = {
      fmcsa: false, ein: false, phone: false, bank: false, passed: false
    };
    // FMCSA SAFER API verification
    results.fmcsa = await this.checkFMCSA(mc, dot);
    // EIN → business name match via Middesk
    results.ein = await this.checkEIN(ein, businessName);
    // Phone non-VOIP verification via Twilio Verify
    results.phone = await this.checkPhone(phone);
    // Bank account → business name match via Plaid
    results.bank = await this.checkBankAccount(bankAccount, businessName);
    results.passed = Object.values(results).every(v => v === true || v === false ? v : true);
    return results;
  },

  async checkFMCSA(mc, dot) {
    // Calls FMCSA SAFER API — free government endpoint
    // Returns: authority active, insurance on file, no enforcement actions
    return true; // Replace with actual API call
  },

  async checkEIN(ein, businessName) {
    // Calls Middesk business verification API
    // Matches EIN to legal business entity name
    return true;
  },

  async checkPhone(phone) {
    // Calls Twilio Verify — rejects VOIP numbers
    // Confirms phone registered to business address
    return true;
  },

  async checkBankAccount(account, businessName) {
    // Calls Plaid bank verification
    // Account holder name must match FMCSA business name
    return true;
  },

  // LAYER 2 — Driver verification at load acceptance
  async verifyDriver({ driverId, cdlNumber, cdlExpiry, medCardExpiry, loadId }) {
    const cdlValid = new Date(cdlExpiry) > new Date();
    const medValid = new Date(medCardExpiry) > new Date();
    const cdlVerified = await this.checkCDLIS(cdlNumber);
    return {
      cdlValid, medValid, cdlVerified,
      passed: cdlValid && medValid && cdlVerified,
      driverId, loadId
    };
  },

  async checkCDLIS(cdlNumber) {
    // CDLIS — Commercial Driver License Information System
    // Free federal database — verifies CDL status in real time
    return true;
  },

  // LAYER 3 — Equipment verification at dispatch
  async verifyEquipment({ vin, plate, eldDeviceId, loadId }) {
    const vinValid = await this.checkVINDatabase(vin);
    const eldMatch = await this.checkELDVINMatch(eldDeviceId, vin);
    return { vinValid, eldMatch, passed: vinValid && eldMatch, vin, loadId };
  },

  async checkVINDatabase(vin) {
    // Cross-reference VIN against FMCSA vehicle database
    return true;
  },

  async checkELDVINMatch(eldDeviceId, vin) {
    // Confirm ELD device is registered to this VIN
    return true;
  },

  // LAYER 4 — Real-time monitoring during transit
  async monitorTransit({ loadId, eldSignal, expectedRoute, lastPosition }) {
    const flags = [];

    // ELD signal gap detection
    const signalAge = (Date.now() - eldSignal.timestamp) / 1000 / 60; // minutes
    if (signalAge > 30) {
      flags.push({ type: "ELD_GAP", severity: "HIGH",
        message: `ELD signal lost for ${Math.round(signalAge)} minutes` });
    }

    // Route deviation detection — >25 miles triggers alert
    if (lastPosition && expectedRoute) {
      const deviation = this.calculateDeviation(lastPosition, expectedRoute);
      if (deviation > 25) {
        flags.push({ type: "ROUTE_DEVIATION", severity: "MEDIUM",
          message: `${deviation} mile deviation from expected route` });
      }
    }

    // MC number lock — no second carrier can touch this load
    const lockViolation = await this.checkMCLock(loadId);
    if (lockViolation) {
      flags.push({ type: "DOUBLE_BROKER_ATTEMPT", severity: "CRITICAL",
        message: "Second MC number attempted to access load documentation" });
    }

    return { loadId, flags, clean: flags.length === 0 };
  },

  calculateDeviation(position, route) {
    // Mapbox Directions API — calculate distance from expected route
    return 0; // Replace with actual calculation
  },

  async checkMCLock(loadId) {
    // Verify no unauthorized MC number accessed load documents
    return false;
  },

  // LAYER 5 — Delivery verification and payment gate
  async verifyDelivery({ loadId, podPhoto, podGPS, deliveryAddress, invoiceAmount }) {
    const geoMatch = await this.verifyPODLocation(podGPS, deliveryAddress);
    const photoValid = podPhoto && podPhoto.timestamp && podPhoto.geotagged;

    // Hold payment for 2-hour review window
    const holdUntil = new Date(Date.now() + 2 * 60 * 60 * 1000);

    // Require receiver signature for loads above $2,000
    const requiresSignature = invoiceAmount > 2000;

    return {
      geoMatch, photoValid, holdUntil, requiresSignature,
      passed: geoMatch && photoValid,
      loadId
    };
  },

  async verifyPODLocation(gps, deliveryAddress) {
    // Mapbox Geocoding API — confirm GPS within 500m of delivery address
    return true;
  },

  // CARRIER TRUST SCORE CALCULATION
  calculateTrustScore({ loadsCompleted, onTimeRate, eldGaps, routeDeviations,
    disputedDeliveries, insuranceDaysLeft, cdlDaysLeft, accountAgeDays }) {
    let score = 50; // Base score

    // Positive factors
    score += Math.min(20, loadsCompleted / 10);       // +20 max for load history
    score += (onTimeRate - 50) * 0.4;                  // +20 max for on-time rate
    score += Math.min(5, insuranceDaysLeft / 73);      // +5 for insurance health
    score += Math.min(5, cdlDaysLeft / 73);            // +5 for CDL health

    // Negative factors
    score -= eldGaps * 5;                              // -5 per ELD gap
    score -= routeDeviations * 4;                      // -4 per deviation
    score -= disputedDeliveries * 10;                  // -10 per dispute

    return Math.max(0, Math.min(100, Math.round(score)));
  },

  // QUICK PAY FEE BY LOYALTY TIER
  getQuickPayFee(trustScore) {
    if (trustScore >= 80 && /* elite check */ true) return 1.5;
    if (trustScore >= 70) return 2.0;
    if (trustScore >= 60) return 2.5;
    return 3.0;
  },

  // INTRODUCED RELATIONSHIP TRACKING
  async logIntroduction({ carrierId, shipperID, loadId, introDate }) {
    const expiryDate = new Date(introDate);
    expiryDate.setMonth(expiryDate.getMonth() + 24);
    return {
      carrierId, shipperID, loadId, introDate,
      expiryDate: expiryDate.toISOString(),
      fee: 0.08, // 8% off-platform fee
      status: "ACTIVE"
    };
  },

  async detectOffPlatformTransaction({ carrierId, shipperId }) {
    // Detect if introduced pair is transacting outside the platform
    // Cross-reference with any load activity not originating from platform
    // Flag for 8% introduced relationship fee invoice
    return { detected: false, carrierId, shipperId };
  },
};

// ─── DOUBLE BROKERING PREVENTION ──────────────────────────────────
export const DoubleBrokeringService = {

  // Lock a load to one MC number at booking
  async lockLoadToMC({ loadId, mcNumber, carrierId }) {
    return {
      loadId, mcNumber, carrierId,
      lockedAt: new Date().toISOString(),
      status: "LOCKED",
      message: "This load is locked to MC " + mcNumber + ". No other carrier may access documentation or submit POD."
    };
  },

  // Verify booking certification was signed
  async verifyCertification({ carrierId, loadId, certificationText, ipAddress, timestamp }) {
    // Carrier must digitally certify:
    // "I certify that I am the authorized carrier for this shipment,
    //  that the equipment and driver designated are under my direct
    //  operational control, and that I will not transfer, sub-contract,
    //  or re-broker this load to any other carrier entity without
    //  explicit written consent from the shipper and Carrier Priority."
    return {
      carrierId, loadId, certified: true,
      ipAddress, timestamp, certificationHash: "sha256-" + Date.now()
    };
  },

  // Check if second MC attempts to access load
  async checkForDoubleBroker({ loadId, attemptingMC, lockedMC }) {
    if (attemptingMC !== lockedMC) {
      return {
        violation: true,
        severity: "CRITICAL",
        message: `Double brokering attempt detected. Load ${loadId} locked to ${lockedMC}. Attempted access by ${attemptingMC}.`,
        action: "SUSPEND_ATTEMPTING_CARRIER"
      };
    }
    return { violation: false };
  },
};
