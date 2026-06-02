import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import {
  listSubCategories,
  getSubCategory,
  createSubCategory,
  updateSubCategory,
  deleteSubCategory,
} from "../controllers/subcategory.controller";

const subCategoryRoutes = Router();

subCategoryRoutes.get("/", listSubCategories);
subCategoryRoutes.get("/:id", getSubCategory);

subCategoryRoutes.post("/", requireAuth, requireRole("ADMIN", "SUBADMIN"), createSubCategory);
subCategoryRoutes.patch("/:id", requireAuth, requireRole("ADMIN", "SUBADMIN"), updateSubCategory);
subCategoryRoutes.delete("/:id", requireAuth, requireRole("ADMIN", "SUBADMIN"), deleteSubCategory);

export default subCategoryRoutes;
