import { handle } from "../lib/handler";
import { addToWishlistSchema } from "../validations/wishlist.validation";
import * as wishlistService from "../services/wishlist.service";

export const getWishlist = handle(async (req, res) => {
  const items = await wishlistService.getWishlist(req.user!.userId);
  res.json({ success: true, data: items });
});

export const addToWishlist = handle(async (req, res) => {
  const body = addToWishlistSchema.parse(req.body);
  const item = await wishlistService.addToWishlist(req.user!.userId, body);
  res.status(201).json({ success: true, data: item });
});

export const removeFromWishlist = handle(async (req, res) => {
  await wishlistService.removeFromWishlist(req.user!.userId, req.params.productId as string);
  res.json({ success: true, message: "Removed from wishlist" });
});

export const clearWishlist = handle(async (req, res) => {
  await wishlistService.clearWishlist(req.user!.userId);
  res.json({ success: true, message: "Wishlist cleared" });
});
