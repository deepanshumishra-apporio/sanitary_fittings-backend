import { Router } from "express";
import express from "express";
import { handleClerkWebhook } from "../webhooks/clerk.webhook";
import { handleRazorpayWebhook } from "../webhooks/razorpay.webhook";

const webhookRoutes = Router();

webhookRoutes.post("/clerk", express.raw({ type: "application/json" }), handleClerkWebhook);
webhookRoutes.post("/razorpay", express.raw({ type: "application/json" }), handleRazorpayWebhook);

export default webhookRoutes;
