import { handle } from "../lib/handler";
import {
  createOrderSchema,
  updateOrderStatusSchema,
  updatePaymentStatusSchema,
  manualOrderSchema,
  orderListQuerySchema,
  analyticsQuerySchema,
} from "../validations/order.validation";
import * as orderService from "../services/order.service";

export const getMyOrders = handle(async (req, res) => {
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query["limit"]) || 10));
  const result = await orderService.getMyOrders(req.user!.userId, page, limit);
  res.json({ success: true, ...result });
});

export const getMyOrderById = handle(async (req, res) => {
  const order = await orderService.getMyOrderById(req.params.id as string, req.user!.userId);
  res.json({ success: true, data: order });
});

export const getOrders = handle(async (req, res) => {
  const { page, limit, status, from, to } = orderListQuerySchema.parse(req.query);
  const dealerId = req.user?.role === "DEALER" ? req.user.userId : undefined;
  const result = await orderService.getAllOrders(page, limit, status, from, to, dealerId);
  res.json({ success: true, ...result });
});

export const getOrderById = handle(async (req, res) => {
  const dealerId = req.user?.role === "DEALER" ? req.user.userId : undefined;
  const order = await orderService.getOrderById(req.params.id as string, dealerId);
  res.json({ success: true, data: order });
});

export const createOrder = handle(async (req, res) => {
  const body = createOrderSchema.parse(req.body);
  const order = await orderService.createOrder(req.user!.userId, body);
  res.status(201).json({ success: true, data: order });
});

export const updateOrderStatus = handle(async (req, res) => {
  const body = updateOrderStatusSchema.parse(req.body);
  const order = await orderService.updateOrderStatus(req.params.id as string, body, req.user?.userId);
  res.json({ success: true, data: order });
});

export const updateOrderPaymentStatus = handle(async (req, res) => {
  const body = updatePaymentStatusSchema.parse(req.body);
  const order = await orderService.updateOrderPaymentStatus(req.params.id as string, body);
  res.json({ success: true, data: order });
});

export const cancelOrder = handle(async (req, res) => {
  await orderService.cancelOrder(req.params.id as string, req.user!.userId);
  res.json({ success: true, message: "Order cancelled successfully" });
});

export const getPlacerAnalytics = handle(async (req, res) => {
  const { from, to } = analyticsQuerySchema.parse(req.query);
  const data = await orderService.getPlacerAnalytics({ from, to });
  res.json({ success: true, data });
});

export const getMyPlacerAnalytics = handle(async (req, res) => {
  const { from, to } = analyticsQuerySchema.parse(req.query);
  const data = await orderService.getPlacerAnalytics({ from, to, placedById: req.user!.userId });
  res.json({ success: true, data: data[0] ?? null });
});

export const createManualOrder = handle(async (req, res) => {
  const body = manualOrderSchema.parse(req.body);
  const order = await orderService.createManualOrder(
    body,
    req.user ? { userId: req.user.userId, role: req.user.role } : undefined
  );
  res.status(201).json({ success: true, data: order });
});
