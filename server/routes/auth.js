/**
 * CARRIER PRIORITY — Auth Routes
 * ================================
 * POST /api/auth/register  — create carrier + owner user, trigger FMCSA check, send welcome email
 * POST /api/auth/login     — return access (15m) + refresh (30d) tokens
 * POST /api/auth/refresh   — rotate refresh token, log IP + user agent
 * POST /api/auth/logout    — revoke refresh token
 * GET  /api/auth/me        — current user profile
 */

import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { db } from "../db/index.js";
import { carriers, users, refreshTokens } from "../db/schema.js";
import { AuthService, FMCSAService, NotifyService } from "../services/index.js";
import { requireAuth } from "../middleware/auth.js";
import { ok, fail, asyncRoute } from "../utils/respond.js";

const router = Router();

const registerSchema = z.object({
  companyName: z.string().min(2),
  mcNumber: z.string().min(3),
  dotNumber: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  plan: z.enum(["solo", "fleet", "enterprise"]).default("solo"),
});

router.post("/register", asyncRoute(async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, parsed.error.issues[0].message, 400);
  const input = parsed.data;

  const existing = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  if (existing.length) return fail(res, "An account with this email already exists", 409);

  const [carrier] = await db.insert(carriers).values({
    name: input.companyName,
    mcNumber: input.mcNumber,
    dotNumber: input.dotNumber,
    plan: input.plan,
    email: input.email,
    phone: input.phone,
  }).returning();

  const passwordHash = await AuthService.hashPassword(input.password);
  const [user] = await db.insert(users).values({
    carrierId: carrier.id,
    email: input.email,
    passwordHash,
    role: "owner",
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
  }).returning();

  // Fire-and-forget verification + welcome email — never block registration on third-party latency.
  FMCSAService.verify(input.mcNumber).catch((e) => console.error("[auth] FMCSA verify failed", e));
  NotifyService.email(input.email, "Welcome to Carrier Priority",
    `<p>Hi ${input.firstName}, your account is live. Real answers, no broker.</p>`
  ).catch((e) => console.error("[auth] welcome email failed", e));

  const tokens = AuthService.issueTokens(user.id, carrier.id, user.role);
  await storeRefreshToken(user.id, tokens.refresh, req);

  return ok(res, {
    carrier: { id: carrier.id, name: carrier.name, mcNumber: carrier.mcNumber, plan: carrier.plan },
    user: { id: user.id, email: user.email, role: user.role },
    tokens,
  }, 201);
}));

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", asyncRoute(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, parsed.error.issues[0].message, 400);
  const { email, password } = parsed.data;

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) return fail(res, "Invalid email or password", 401);

  const valid = await AuthService.verifyPassword(password, user.passwordHash);
  if (!valid) return fail(res, "Invalid email or password", 401);

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  const tokens = AuthService.issueTokens(user.id, user.carrierId, user.role);
  await storeRefreshToken(user.id, tokens.refresh, req);

  return ok(res, { user: { id: user.id, email: user.email, role: user.role }, tokens });
}));

const refreshSchema = z.object({ refreshToken: z.string().min(10) });

router.post("/refresh", asyncRoute(async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, "refreshToken is required", 400);

  let payload;
  try {
    payload = AuthService.verifyRefresh(parsed.data.refreshToken);
  } catch {
    return fail(res, "Invalid or expired refresh token", 401);
  }

  const tokenHash = hashToken(parsed.data.refreshToken);
  const [stored] = await db.select().from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash)).limit(1);

  if (!stored || stored.revoked) return fail(res, "Refresh token has been revoked", 401);

  const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
  if (!user) return fail(res, "User not found", 401);

  // Rotate: revoke the old token, issue a new pair.
  await db.update(refreshTokens).set({ revoked: true }).where(eq(refreshTokens.id, stored.id));
  const tokens = AuthService.issueTokens(user.id, user.carrierId, user.role);
  await storeRefreshToken(user.id, tokens.refresh, req);

  return ok(res, { tokens });
}));

router.post("/logout", requireAuth, asyncRoute(async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (parsed.success) {
    const tokenHash = hashToken(parsed.data.refreshToken);
    await db.update(refreshTokens).set({ revoked: true }).where(eq(refreshTokens.tokenHash, tokenHash));
  }
  return ok(res, { loggedOut: true });
}));

router.get("/me", requireAuth, asyncRoute(async (req, res) => {
  const [user] = await db.select().from(users).where(eq(users.id, req.user.sub)).limit(1);
  if (!user) return fail(res, "User not found", 404);
  const [carrier] = await db.select().from(carriers).where(eq(carriers.id, user.carrierId)).limit(1);
  return ok(res, {
    user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName },
    carrier,
  });
}));

// ─── helpers ────────────────────────────────────────────────────
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function storeRefreshToken(userId, refreshToken, req) {
  await db.insert(refreshTokens).values({
    userId,
    tokenHash: hashToken(refreshToken),
    ip: req.ip,
    userAgent: req.headers["user-agent"] || "",
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
}

export default router;
