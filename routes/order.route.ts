import { Router } from "express";
import {
  getMyOrders,
  getMyOrderById,
  getOrders,
  getOrderById,
  createOrder,
  updateOrderStatus,
  updateOrderPaymentStatus,
  cancelOrder,
  createManualOrder,
  getPlacerAnalytics,
  getMyPlacerAnalytics,
} from "../controllers/order.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";

const orderRoutes = Router();

// Customer
orderRoutes.get("/my", requireAuth, getMyOrders);
orderRoutes.get("/my/:id", requireAuth, getMyOrderById);
orderRoutes.post("/", requireAuth, createOrder);
orderRoutes.patch("/my/:id/cancel", requireAuth, cancelOrder);

// Admin / SubAdmin
orderRoutes.post("/manual", requireAuth, requireRole("ADMIN", "SUBADMIN", "DEALER"), createManualOrder);
// Analytics (placed before "/:id" so they aren't captured by the param route)
orderRoutes.get("/analytics/placers", requireAuth, requireRole("ADMIN", "SUBADMIN"), getPlacerAnalytics);
orderRoutes.get("/analytics/me", requireAuth, requireRole("ADMIN", "SUBADMIN", "DEALER"), getMyPlacerAnalytics);
orderRoutes.get("/", requireAuth, requireRole("ADMIN", "SUBADMIN", "DEALER"), getOrders);
orderRoutes.get("/:id", requireAuth, requireRole("ADMIN", "SUBADMIN", "DEALER"), getOrderById);
orderRoutes.patch("/:id/status", requireAuth, requireRole("ADMIN", "SUBADMIN"), updateOrderStatus);
orderRoutes.patch("/:id/payment-status", requireAuth, requireRole("ADMIN", "SUBADMIN"), updateOrderPaymentStatus);

export default orderRoutes;
