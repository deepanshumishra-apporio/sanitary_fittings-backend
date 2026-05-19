import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/category.controller";

const categoryRoutes = Router();

categoryRoutes.get("/", listCategories);
categoryRoutes.get("/:id", getCategory);

categoryRoutes.post("/", requireAuth, requireRole("ADMIN", "SUBADMIN"), createCategory);
categoryRoutes.patch("/:id", requireAuth, requireRole("ADMIN", "SUBADMIN"), updateCategory);
categoryRoutes.delete("/:id", requireAuth, requireRole("ADMIN", "SUBADMIN"), deleteCategory);

export default categoryRoutes;
