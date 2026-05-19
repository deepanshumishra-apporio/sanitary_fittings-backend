import { Router } from "express";
import { upload } from "../middleware/upload.middleware";
import {
  getProducts,
  getProductById,
  getProductsByCategory,
  createProduct,
  updateProduct,
  deleteProduct,
} from "../controllers/product.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";

const productRoutes = Router();

productRoutes.get("/", getProducts);
productRoutes.get("/category/:categoryId", getProductsByCategory);
productRoutes.get("/:id", getProductById);

productRoutes.post("/", requireAuth, requireRole("ADMIN", "SUBADMIN"), upload.array("files"), createProduct);
productRoutes.put("/:id", requireAuth, requireRole("ADMIN", "SUBADMIN"), upload.array("files"), updateProduct);
productRoutes.delete("/:id", requireAuth, requireRole("ADMIN", "SUBADMIN"), deleteProduct);

export default productRoutes;
