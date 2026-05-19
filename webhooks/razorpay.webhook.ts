import crypto from "crypto";
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";

export const handleRazorpayWebhook = async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers["x-razorpay-signature"] as string;

  if (!signature) {
    res.status(400).json({ error: "Missing Razorpay signature" });
    return;
  }

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    res.status(500).json({ error: "Webhook secret not configured" });
    return;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(req.body as Buffer)
    .digest("hex");

  if (expected !== signature) {
    res.status(400).json({ error: "Invalid webhook signature" });
    return;
  }

  let event: { event: string; payload: any };
  try {
    event = JSON.parse((req.body as Buffer).toString());
  } catch {
    res.status(400).json({ error: "Invalid JSON payload" });
    return;
  }

  try {
    switch (event.event) {
      case "payment.failed": {
        const rzpPaymentId: string = event.payload.payment?.entity?.id;
        const rzpOrderId: string = event.payload.payment?.entity?.order_id;

        if (rzpOrderId) {
          await prisma.payment.updateMany({
            where: { razorpayOrderId: rzpOrderId, status: "PENDING" },
            data: { status: "FAILED", ...(rzpPaymentId && { transactionId: rzpPaymentId }) },
          });
        }
        break;
      }

      // Safety net: if client-side verify call never reached us, capture marks it complete
      case "payment.captured": {
        const rzpOrderId: string = event.payload.payment?.entity?.order_id;
        const rzpPaymentId: string = event.payload.payment?.entity?.id;

        if (!rzpOrderId) break;

        const payment = await prisma.payment.findUnique({
          where: { razorpayOrderId: rzpOrderId },
          select: { id: true, orderId: true, status: true },
        });

        if (!payment || payment.status === "COMPLETED") break;

        await prisma.$transaction([
          prisma.payment.update({
            where: { id: payment.id },
            data: { status: "COMPLETED", transactionId: rzpPaymentId },
          }),
          prisma.order.update({
            where: { id: payment.orderId },
            data: { status: "CONFIRMED" },
          }),
        ]);
        break;
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("[RazorpayWebhook] DB error:", error);
    res.status(500).json({ error: "Database error" });
  }
};
