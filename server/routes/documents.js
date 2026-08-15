/**
 * CARRIER PRIORITY — Document Hub Routes
 * ========================================
 * Server never handles file bytes — client uploads directly to S3 via
 * a presigned URL. This route only issues the URL and records metadata.
 */

import { Router } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { documents } from "../db/schema.js";
import { StorageService } from "../services/index.js";
import { requireAuth } from "../middleware/auth.js";
import { ok, fail, asyncRoute } from "../utils/respond.js";

const router = Router();

router.get("/", requireAuth, asyncRoute(async (req, res) => {
  const rows = await db.select().from(documents).where(eq(documents.carrierId, req.user.company));
  return ok(res, rows);
}));

const uploadUrlSchema = z.object({
  loadId: z.string().uuid().optional(),
  type: z.enum(["bol", "rate_con", "pod", "insurance", "w9", "other"]),
  filename: z.string().min(1),
  contentType: z.string().min(1),
});

/**
 * POST /api/documents/upload-url — issue a presigned S3 PUT URL.
 * Client uploads directly; then calls POST /api/documents to record it.
 */
router.post("/upload-url", requireAuth, asyncRoute(async (req, res) => {
  const parsed = uploadUrlSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, parsed.error.issues[0].message, 400);
  const { loadId, type, filename, contentType } = parsed.data;

  const key = StorageService.buildKey(req.user.company, loadId || "general", filename);
  const uploadUrl = await StorageService.getUploadUrl(key, contentType);

  return ok(res, { uploadUrl, key, type });
}));

const recordSchema = z.object({
  loadId: z.string().uuid().optional(),
  type: z.enum(["bol", "rate_con", "pod", "insurance", "w9", "other"]),
  s3Key: z.string().min(1),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().optional(),
  podGpsLat: z.number().optional(),
  podGpsLng: z.number().optional(),
});

router.post("/", requireAuth, asyncRoute(async (req, res) => {
  const parsed = recordSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, parsed.error.issues[0].message, 400);

  const [row] = await db.insert(documents).values({
    ...parsed.data,
    carrierId: req.user.company,
    uploadedByUserId: req.user.sub,
    virusScanStatus: "pending", // flipped to "clean"/"infected" by an async scan worker
  }).returning();

  return ok(res, row, 201);
}));

router.get("/:id/download-url", requireAuth, asyncRoute(async (req, res) => {
  const [row] = await db.select().from(documents)
    .where(and(eq(documents.id, req.params.id), eq(documents.carrierId, req.user.company))).limit(1);
  if (!row) return fail(res, "Document not found", 404);

  const downloadUrl = await StorageService.getDownloadUrl(row.s3Key);
  return ok(res, { downloadUrl });
}));

export default router;
