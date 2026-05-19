import { Router } from "express";
import {
  listVendors,
  getVendor,
  createVendor,
  updateVendor,
  deleteVendor,
  getProductVendors,
  addProductVendor,
  setActiveVendor,
  updateProductVendor,
  removeProductVendor,
} from "../controllers/vendor.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";

const vendorRoutes = Router();

const adminOnly = [requireAuth, requireRole("ADMIN", "SUBADMIN")];

vendorRoutes.get("/", ...adminOnly, listVendors);
vendorRoutes.get("/:id", ...adminOnly, getVendor);
vendorRoutes.post("/", ...adminOnly, createVendor);
vendorRoutes.patch("/:id", ...adminOnly, updateVendor);
vendorRoutes.delete("/:id", ...adminOnly, deleteVendor);

vendorRoutes.get("/product/:productId", ...adminOnly, getProductVendors);
vendorRoutes.post("/product/:productId", ...adminOnly, addProductVendor);
vendorRoutes.patch("/product/:productId/:vendorId/activate", ...adminOnly, setActiveVendor);
vendorRoutes.patch("/product/:productId/:vendorId", ...adminOnly, updateProductVendor);
vendorRoutes.delete("/product/:productId/:vendorId", ...adminOnly, removeProductVendor);

export default vendorRoutes;
