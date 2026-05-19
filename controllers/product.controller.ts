import { handle } from "../lib/handler";
import {
  createProductSchema,
  updateProductSchema,
  productQuerySchema,
} from "../validations/product.validation";
import * as productService from "../services/product.service";
import { uploadToR2 } from "../lib/r2";

async function uploadFiles(
  files: Express.Multer.File[],
  type: "image" | "video",
  productId: string
) {
  const filtered = files.filter((f) => f.mimetype.startsWith(`${type}/`));
  return Promise.all(filtered.map((f) => uploadToR2(f, productId, type)));
}

function parseUrls(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string");
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
  const result = await productService.listByCategory(
    req.params.categoryId as string,
    page,
    limit
  );
  res.json({ success: true, ...result });
});

export const createProduct = handle(async (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];

  // Parse without images/videos first — we'll set them after upload
  const { images: _i, videos: _v, ...rest } = createProductSchema.parse(req.body);
  const product = await productService.createProduct(rest as any);

  const [uploadedImages, uploadedVideos] = await Promise.all([
    uploadFiles(files, "image", product.id),
    uploadFiles(files, "video", product.id),
  ]);

  const images = [...parseUrls(req.body.images), ...uploadedImages];
  const videos = [...parseUrls(req.body.videos), ...uploadedVideos];

  const final = await productService.updateProduct(product.id, { images, videos });

  res.status(201).json({ success: true, data: final });
});

export const updateProduct = handle(async (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];
  const productId = req.params.id as string;

  const [uploadedImages, uploadedVideos] = await Promise.all([
    uploadFiles(files, "image", productId),
    uploadFiles(files, "video", productId),
  ]);

  const images = [...parseUrls(req.body.images), ...uploadedImages];
  const videos = [...parseUrls(req.body.videos), ...uploadedVideos];

  // Only overwrite images/videos if the client explicitly sent them or uploaded files
  const hasImages = req.body.images !== undefined || uploadedImages.length > 0;
  const hasVideos = req.body.videos !== undefined || uploadedVideos.length > 0;

  const body = updateProductSchema.parse({
    ...req.body,
    ...(hasImages && { images }),
    ...(hasVideos && { videos }),
  });

  const product = await productService.updateProduct(productId, body);
  res.json({ success: true, data: product });
});

export const deleteProduct = handle(async (req, res) => {
  await productService.deleteProduct(req.params.id as string);
  res.status(200).json({ success: true, message: "Product deleted successfully" });
});