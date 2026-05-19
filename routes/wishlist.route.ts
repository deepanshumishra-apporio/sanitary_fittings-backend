import { Router } from "express";
import { getWishlist, addToWishlist, removeFromWishlist, clearWishlist } from "../controllers/wishlist.controller";
import { requireAuth } from "../middleware/auth.middleware";

const wishlistRoutes = Router();

wishlistRoutes.get("/", requireAuth, getWishlist);
wishlistRoutes.post("/", requireAuth, addToWishlist);
wishlistRoutes.delete("/clear", requireAuth, clearWishlist);
wishlistRoutes.delete("/:productId", requireAuth, removeFromWishlist);

export default wishlistRoutes;
