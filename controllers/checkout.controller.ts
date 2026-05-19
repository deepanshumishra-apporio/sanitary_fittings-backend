import { handle } from "../lib/handler";
import { checkoutSchema } from "../validations/checkout.validation";
import * as checkoutService from "../services/checkout.service";

export const previewCheckout = handle(async (req, res) => {
  const preview = await checkoutService.previewCheckout(req.user!.userId);
  res.json({ success: true, data: preview });
});

export const confirmCheckout = handle(async (req, res) => {
  const dto = checkoutSchema.parse(req.body);
  const order = await checkoutService.confirmCheckout(req.user!.userId, dto);
  res.status(201).json({ success: true, data: order });
});
