import { randomUUID } from "crypto";
import { handle } from "../lib/handler";
import {
  createProductSchema,
  productQuerySchema,
  updateProductSchema,
} from "../validations/product.validation";
import * as productService from "../services/product.service";
import { uploadToR2, deleteFromR2, getPresignedPutUrl } from "../lib/r2";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extracts the R2 object key from a public URL so we can delete the object if
 * the database write fails after images were already uploaded.
 * Returns null for URLs that don't belong to this R2 bucket.
 */
function extractR2Key(url: string): string | null {
  const base = process.env.R2_PUBLIC_URL;
  if (!base || !url.startsWith(`${base}/`)) return null;
  return url.slice(base.length + 1);
}

function parseUrls(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") return [value];
  return [];
}

/** Upload all image files to R2 concurrently. Cleans up on any single failure. */
async function uploadImageFiles(
  files: Express.Multer.File[],
  productId: string
): Promise<{ key: string; url: string }[]> {
  const imageFiles = files.filter((f) => f.mimetype.startsWith("image/"));
  if (imageFiles.length === 0) return [];

  const results = await Promise.allSettled(
    imageFiles.map((f) => uploadToR2(f, productId))
  );

  const succeeded = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const firstFailure = results.find((r): r is PromiseRejectedResult => r.status === "rejected");

  if (firstFailure) {
    // Roll back the files that did upload before failing
    await deleteFromR2(succeeded.map((s) => s.key)).catch(() => {});
    throw firstFailure.reason instanceof Error
      ? firstFailure.reason
      : new Error("Image upload to storage failed");
  }

  return succeeded;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

/**
 * POST /product/upload-url
 * Returns a short-lived presigned PUT URL so the mobile can upload an image
 * directly to R2 without routing binary data through this server.
 */
export const getUploadUrl = handle(async (req, res) => {
  const { filename = "image.jpg" } = req.body as { filename?: string };
  const result = await getPresignedPutUrl(filename);
  res.json({ success: true, data: result });
});

export const getProducts = handle(async (req, res) => {
  const query = productQuerySchema.parse(req.query);
  const result = await productService.listProducts(query);
  res.json({ success: true, ...result });
});

export const getProductById = handle(async (req, res) => {
  const product = await productService.getProduct(req.params.id as string);
  res.json({ success: true, data: product });
});

export const getProductsByCategory = handle(async (req, res) => {
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query["limit"]) || 20));
  const result = await productService.listByCategory(
    req.params.categoryId as string,
    page,
    limit
  );
  res.json({ success: true, ...result });
});

/**
 * POST /product
 * Expects a JSON body. Images must already be on R2 (uploaded via presigned URL).
 * If the database transaction fails, any R2 objects referenced in `images` are
 * deleted so storage stays consistent.
 */
export const createProduct = handle(async (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];
  const uploaded = await uploadImageFiles(files, randomUUID());
  const parsedImages = [...parseUrls(req.body.images), ...uploaded.map((u) => u.url)];
  const hasImages = req.body.images !== undefined || uploaded.length > 0;

  const body = createProductSchema.parse({
    ...req.body,
    ...(hasImages && { images: parsedImages }),
  });
  const images = body.images ?? [];

  // Identify which image URLs belong to our R2 bucket so we can clean up on failure
  const r2Keys = [
    ...uploaded.map((u) => u.key),
    ...images.map(extractR2Key).filter((k): k is string => k !== null),
  ];

  try {
    const product = await productService.createProduct(body, req.user?.userId);
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    // DB write failed — remove the already-uploaded R2 objects to avoid orphans
    await deleteFromR2(r2Keys).catch(() => {});
    throw err;
  }
});

/**
 * PUT /product/:id
 * Accepts multipart/form-data (for file uploads) or JSON.
 * New files are uploaded to R2; existing `images` URLs are preserved.
 * Cleans up newly uploaded R2 objects if the database write fails.
 */
export const updateProduct = handle(async (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];
  const productId = req.params.id as string;

  const uploaded = await uploadImageFiles(files, productId);
  const images = [...parseUrls(req.body.images), ...uploaded.map((u) => u.url)];
  const hasImages = req.body.images !== undefined || uploaded.length > 0;

  const body = updateProductSchema.parse({
    ...req.body,
    ...(hasImages && { images }),
  });

  try {
    const product = await productService.updateProduct(productId, body);
    res.json({ success: true, data: product });
  } catch (err) {
    await deleteFromR2(uploaded.map((u) => u.key)).catch(() => {});
    throw err;
  }
});

export const deleteProduct = handle(async (req, res) => {
  await productService.deleteProduct(req.params.id as string);
  res.status(200).json({ success: true, message: "Product deleted successfully" });
});
