import { Router } from "express";
import express from "express";
import { handleRazorpayWebhook } from "../webhooks/razorpay.webhook";

const webhookRoutes = Router();

webhookRoutes.post("/razorpay", express.raw({ type: "application/json" }), handleRazorpayWebhook);

export default webhookRoutes;
