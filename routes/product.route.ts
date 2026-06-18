import { Router } from "express";
import { upload } from "../middleware/upload.middleware";
import {
  getProducts,
  getProductById,
  getProductsByCategory,
  getUploadUrl,
  cleanupUploads,
  createProduct,
  updateProduct,
  deleteProduct,
} from "../controllers/product.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";

const productRoutes = Router();

// ─── Public ───────────────────────────────────────────────────────────────────
productRoutes.get("/", getProducts);
productRoutes.get("/category/:categoryId", getProductsByCategory);
productRoutes.get("/:id", getProductById);

// ─── Admin / Subadmin ────────────────────────────────────────────────────────

// Returns a presigned R2 PUT URL; mobile uploads the image directly to R2
productRoutes.post("/upload-url", requireAuth, requireRole("ADMIN", "SUBADMIN"), getUploadUrl);

// Removes orphaned presigned uploads when a create/update fails after upload
productRoutes.post("/cleanup-uploads", requireAuth, requireRole("ADMIN", "SUBADMIN"), cleanupUploads);

// JSON body only — images must already be on R2 via presigned upload
productRoutes.post("/", requireAuth, requireRole("ADMIN", "SUBADMIN"), upload.array("files"), createProduct);

// Accepts multipart/form-data (file uploads) or JSON
productRoutes.put("/:id", requireAuth, requireRole("ADMIN", "SUBADMIN"), upload.array("files"), updateProduct);

productRoutes.delete("/:id", requireAuth, requireRole("ADMIN", "SUBADMIN"), deleteProduct);

export default productRoutes;
