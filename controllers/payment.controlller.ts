import { handle } from "../lib/handler";
import {
  createRazorpayOrderSchema,
  verifyPaymentSchema,
  refundSchema,
  paymentQuerySchema,
} from "../validations/payment.validation";
import * as paymentService from "../services/payment.service";

export const createOrder = handle(async (req, res) => {
  const dto = createRazorpayOrderSchema.parse(req.body);
  const result = await paymentService.createRazorpayOrder(dto, req.user!.userId);
  res.status(201).json({ success: true, data: result });
});

export const verifyPayment = handle(async (req, res) => {
  const dto = verifyPaymentSchema.parse(req.body);
  const payment = await paymentService.verifyPayment(dto, req.user!.userId);
  res.json({ success: true, data: payment });
});

export const getMyPayments = handle(async (req, res) => {
  const query = paymentQuerySchema.parse(req.query);
  const result = await paymentService.getMyPayments(req.user!.userId, query);
  res.json({ success: true, ...result });
});

export const getMyPaymentById = handle(async (req, res) => {
  const payment = await paymentService.getMyPaymentById(req.params.id as string, req.user!.userId);
  res.json({ success: true, data: payment });
});

export const getAllPayments = handle(async (req, res) => {
  const query = paymentQuerySchema.parse(req.query);
  const result = await paymentService.getAllPayments(query);
  res.json({ success: true, ...result });
});

export const refundPayment = handle(async (req, res) => {
  const dto = refundSchema.parse(req.body);
  const payment = await paymentService.refundPayment(req.params.id as string, dto);
  res.json({ success: true, data: payment });
});
