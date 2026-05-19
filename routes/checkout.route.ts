import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { previewCheckout, confirmCheckout } from "../controllers/checkout.controller";

const checkoutRoutes = Router();

checkoutRoutes.get("/", requireAuth, previewCheckout);
checkoutRoutes.post("/", requireAuth, confirmCheckout);

export default checkoutRoutes;
