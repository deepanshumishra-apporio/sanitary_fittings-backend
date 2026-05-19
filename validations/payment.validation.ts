import { z } from "zod";

export const createRazorpayOrderSchema = z.object({
  orderId: z.string().min(1, "orderId is required"),
});

export const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export const refundSchema = z.object({
  amount: z.number().positive().optional(), // paise; if omitted → full refund
  notes: z.string().max(255).optional(),
});

export const paymentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["PENDING", "COMPLETED", "FAILED", "REFUNDED"]).optional(),
});

export type CreateRazorpayOrderDto = z.infer<typeof createRazorpayOrderSchema>;
export type VerifyPaymentDto = z.infer<typeof verifyPaymentSchema>;
export type RefundDto = z.infer<typeof refundSchema>;
export type PaymentQuery = z.infer<typeof paymentQuerySchema>;
