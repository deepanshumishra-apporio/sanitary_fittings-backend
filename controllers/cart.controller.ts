import { handle } from "../lib/handler";
import { addToCartSchema, updateCartSchema } from "../validations/cart.validation";
import * as cartService from "../services/cart.service";

export const getCart = handle(async (req, res) => {
  const result = await cartService.getCart(req.user!.userId);
  res.json({ success: true, ...result });
});

export const addToCart = handle(async (req, res) => {
  const body = addToCartSchema.parse(req.body);
  const item = await cartService.addToCart(req.user!.userId, body);
  res.status(201).json({ success: true, data: item });
});

export const updateCartItem = handle(async (req, res) => {
  const body = updateCartSchema.parse(req.body);
  const item = await cartService.updateCartItem(req.user!.userId, req.params.productId as string, body);
  res.json({ success: true, data: item });
});

export const removeCartItem = handle(async (req, res) => {
  await cartService.removeCartItem(req.user!.userId, req.params.productId as string);
  res.json({ success: true, message: "Item removed from cart" });
});

export const clearCart = handle(async (req, res) => {
  await cartService.clearCart(req.user!.userId);
  res.json({ success: true, message: "Cart cleared" });
});
