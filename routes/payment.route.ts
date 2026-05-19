import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import {
  createOrder,
  verifyPayment,
  getMyPayments,
  getMyPaymentById,
  getAllPayments,
  refundPayment,
} from "../controllers/payment.controlller";

const paymentRoutes = Router();

// Admin routes — must be registered before /:id to avoid shadowing
paymentRoutes.get("/admin/all", requireAuth, requireRole("ADMIN"), getAllPayments);
paymentRoutes.post("/admin/refund/:id", requireAuth, requireRole("ADMIN"), refundPayment);

// Customer routes
paymentRoutes.post("/create-order", requireAuth, createOrder);
paymentRoutes.post("/verify", requireAuth, verifyPayment);
paymentRoutes.get("/", requireAuth, getMyPayments);
paymentRoutes.get("/:id", requireAuth, getMyPaymentById);

export default paymentRoutes;
