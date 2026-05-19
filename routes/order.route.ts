import { Router } from "express";
import {
  getMyOrders,
  getMyOrderById,
  getOrders,
  getOrderById,
  createOrder,
  updateOrderStatus,
  cancelOrder,
  createManualOrder,
} from "../controllers/order.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";

const orderRoutes = Router();

// Customer
orderRoutes.get("/my", requireAuth, getMyOrders);
orderRoutes.get("/my/:id", requireAuth, getMyOrderById);
orderRoutes.post("/", requireAuth, createOrder);
orderRoutes.patch("/my/:id/cancel", requireAuth, cancelOrder);

// Admin / SubAdmin
orderRoutes.post("/manual", requireAuth, requireRole("ADMIN", "SUBADMIN"), createManualOrder);
orderRoutes.get("/", requireAuth, requireRole("ADMIN", "SUBADMIN"), getOrders);
orderRoutes.get("/:id", requireAuth, requireRole("ADMIN", "SUBADMIN"), getOrderById);
orderRoutes.patch("/:id/status", requireAuth, requireRole("ADMIN", "SUBADMIN"), updateOrderStatus);

export default orderRoutes;
