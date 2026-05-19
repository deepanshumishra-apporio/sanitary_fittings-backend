import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { razorpay, RAZORPAY_KEY_ID } from "../lib/razorpay";
import { AppError } from "../lib/errors";
import type { CreateRazorpayOrderDto, VerifyPaymentDto, RefundDto, PaymentQuery } from "../validations/payment.validation";

// ─── Razorpay error converter ─────────────────────────────────────────────────
// Razorpay SDK rejects with { statusCode, error: { description, code } }.
// Convert to AppError so the generic handler returns a meaningful response.
function toAppError(err: unknown): AppError {
  const e = err as { statusCode?: number; error?: { description?: string; code?: string } };
  const description = e.error?.description ?? "Payment gateway error. Please try again.";
  // Razorpay 401 → our 503 (gateway misconfigured, not the user's fault)
  const http = e.statusCode === 401 ? 503 : (e.statusCode ?? 502);
  return new AppError(http, description);
}

const paymentInclude = {
  order: {
    select: {
      id: true,
      totalPrice: true,
      status: true,
      items: {
        include: { product: { select: { id: true, name: true, price: true } } },
      },
    },
  },
};

// ─── Create Razorpay Order ───────────────────────────────────────────────────

export async function createRazorpayOrder(dto: CreateRazorpayOrderDto, userId: string) {
  const order = await prisma.order.findUnique({
    where: { id: dto.orderId },
    select: { id: true, userId: true, totalPrice: true, status: true, payment: true },
  });

  if (!order) throw new AppError(404, "Order not found");
  if (order.userId !== userId) throw new AppError(403, "Forbidden");
  if (order.status !== "PENDING") throw new AppError(400, `Cannot pay for a ${order.status} order`);
  if (order.payment?.status === "COMPLETED") throw new AppError(400, "Order is already paid");

  // Amount in paise (Razorpay requires smallest currency unit)
  const amountInPaise = Math.round(order.totalPrice * 100);

  // Razorpay SDK typings expose a callback overload that causes TS to infer
  // the Promise overload's return as `void`. Cast through unknown to extract id.
  let rzpOrderId: string;
  try {
    const rzpOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: order.id,
      notes: { orderId: order.id, userId },
    });
    rzpOrderId = (rzpOrder as unknown as { id: string }).id;
  } catch (err) {
    throw toAppError(err);
  }

  // Upsert a PENDING payment record so we can track it
  await prisma.payment.upsert({
    where: { orderId: order.id },
    create: {
      userId,
      orderId: order.id,
      amount: order.totalPrice,
      status: "PENDING",
      razorpayOrderId: rzpOrderId,
    },
    update: {
      razorpayOrderId: rzpOrderId,
      status: "PENDING",
    },
  });

  return {
    key: RAZORPAY_KEY_ID,
    razorpayOrderId: rzpOrderId,
    amount: amountInPaise,
    currency: "INR",
    orderId: order.id,
  };
}

// ─── Verify & Capture Payment ────────────────────────────────────────────────

export async function verifyPayment(dto: VerifyPaymentDto, userId: string) {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = dto;

  // Signature verification — HMAC-SHA256(razorpayOrderId + "|" + razorpayPaymentId, secret)
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  if (expected !== razorpaySignature) {
    throw new AppError(400, "Payment signature verification failed");
  }

  const payment = await prisma.payment.findUnique({
    where: { razorpayOrderId },
    select: { id: true, userId: true, orderId: true, status: true },
  });

  if (!payment) throw new AppError(404, "Payment record not found");
  if (payment.userId !== userId) throw new AppError(403, "Forbidden");
  if (payment.status === "COMPLETED") throw new AppError(400, "Payment already verified");

  // Fetch payment details from Razorpay to get method + card type
  let method: ReturnType<typeof resolveMethod>;
  try {
    const rzpPayment = await razorpay.payments.fetch(razorpayPaymentId);
    const p = rzpPayment as unknown as { method?: string; card?: { type?: string } };
    method = resolveMethod(p.method, p.card?.type);
  } catch (err) {
    throw toAppError(err);
  }

  const [updatedPayment] = await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: { status: "COMPLETED", transactionId: razorpayPaymentId, method },
      include: paymentInclude,
    }),
    prisma.order.update({
      where: { id: payment.orderId },
      data: { status: "CONFIRMED" },
    }),
  ]);

  return updatedPayment;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getMyPayments(userId: string, query: PaymentQuery) {
  const { page, limit, status } = query;
  const skip = (page - 1) * limit;
  const where = { userId, ...(status && { status }) };

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({ where, include: paymentInclude, orderBy: { createdAt: "desc" }, skip, take: limit }),
    prisma.payment.count({ where }),
  ]);

  return { data: payments, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
}

export async function getMyPaymentById(paymentId: string, userId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: paymentInclude });
  if (!payment) throw new AppError(404, "Payment not found");
  if (payment.userId !== userId) throw new AppError(403, "Forbidden");
  return payment;
}

export async function getAllPayments(query: PaymentQuery) {
  const { page, limit, status } = query;
  const skip = (page - 1) * limit;
  const where = status ? { status } : {};

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: { ...paymentInclude, user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.payment.count({ where }),
  ]);

  return { data: payments, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
}

// ─── Refund ───────────────────────────────────────────────────────────────────

export async function refundPayment(paymentId: string, dto: RefundDto) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, status: true, transactionId: true, amount: true, orderId: true },
  });

  if (!payment) throw new AppError(404, "Payment not found");
  if (payment.status !== "COMPLETED") throw new AppError(400, "Only completed payments can be refunded");
  if (!payment.transactionId) throw new AppError(400, "No Razorpay transaction ID on record");

  const refundAmountPaise = dto.amount ?? Math.round(payment.amount * 100);

  try {
    await razorpay.payments.refund(payment.transactionId, {
      amount: refundAmountPaise,
      ...(dto.notes && { notes: { reason: dto.notes } }),
    });
  } catch (err) {
    throw toAppError(err);
  }

  const [updatedPayment] = await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: { status: "REFUNDED" },
      include: paymentInclude,
    }),
    prisma.order.update({
      where: { id: payment.orderId },
      data: { status: "REFUNDED" },
    }),
  ]);

  return updatedPayment;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveMethod(rzpMethod: string | undefined, cardType?: string) {
  if (rzpMethod === "card") {
    return cardType === "debit" ? "DEBIT_CARD" as const : "CREDIT_CARD" as const;
  }
  const map: Record<string, "UPI" | "NET_BANKING" | "WALLET"> = {
    upi: "UPI",
    netbanking: "NET_BANKING",
    wallet: "WALLET",
  };
  return (map[rzpMethod ?? ""] ?? "UPI") as "CREDIT_CARD" | "DEBIT_CARD" | "UPI" | "NET_BANKING" | "WALLET";
}
