import { randomUUID } from "crypto";
import { handle } from "../lib/handler";
import {
  createProductSchema,
  productQuerySchema,
  updateProductSchema,
} from "../validations/product.validation";
import * as productService from "../services/product.service";
import { uploadToR2, deleteFromR2 } from "../lib/r2";

async function uploadImages(files: Express.Multer.File[], productId: string) {
  const images = files.filter((file) => file.mimetype.startsWith("image/"));
  const results = await Promise.allSettled(images.map((file) => uploadToR2(file, productId)));

  const succeeded = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");

  if (failed) {
    await deleteFromR2(succeeded.map((s) => s.key)).catch(() => {});
    throw failed.reason instanceof Error ? failed.reason : new Error("Image upload failed");
  }
  return succeeded;
}

function parseUrls(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
  if (typeof value === "string") return [value];
  return [];
}

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
  const result = await productService.listByCategory(req.params.categoryId as string, page, limit);
  res.json({ success: true, ...result });
});

export const createProduct = handle(async (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];
  const { images: _images, ...rest } = createProductSchema.parse(req.body);

  const productId = randomUUID();
  const uploaded = await uploadImages(files, productId);
  const uploadedKeys = uploaded.map((u) => u.key);
  const images = [...parseUrls(req.body.images), ...uploaded.map((u) => u.url)];

  try {
    const product = await productService.createProduct(
      { ...rest, images },
      { id: productId }
    );
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    await deleteFromR2(uploadedKeys).catch(() => {});
    throw err;
  }
});

export const updateProduct = handle(async (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];
  const productId = req.params.id as string;
  const uploaded = await uploadImages(files, productId);
  const uploadedKeys = uploaded.map((u) => u.key);
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
    await deleteFromR2(uploadedKeys).catch(() => {});
    throw err;
  }
});

export const deleteProduct = handle(async (req, res) => {
  await productService.deleteProduct(req.params.id as string);
  res.status(200).json({ success: true, message: "Product deleted successfully" });
});
