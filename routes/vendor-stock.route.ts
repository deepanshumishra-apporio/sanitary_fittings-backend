import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import {
  createVendorStockBill,
  listVendorStockBills,
  listVendorStockHistory,
} from "../controllers/vendor-stock.controller";

const vendorStockRoutes = Router();
const adminOnly = [requireAuth, requireRole("ADMIN", "SUBADMIN")];

vendorStockRoutes.get("/bill", ...adminOnly, listVendorStockBills);
vendorStockRoutes.post("/bill", ...adminOnly, createVendorStockBill);
vendorStockRoutes.get("/history", ...adminOnly, listVendorStockHistory);

export default vendorStockRoutes;
