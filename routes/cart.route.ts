import { Router } from "express";
import { getCart, addToCart, updateCartItem, removeCartItem, clearCart } from "../controllers/cart.controller";
import { requireAuth } from "../middleware/auth.middleware";

const cartRoutes = Router();

cartRoutes.get("/", requireAuth, getCart);
cartRoutes.post("/", requireAuth, addToCart);
cartRoutes.patch("/:productId", requireAuth, updateCartItem);
cartRoutes.delete("/clear", requireAuth, clearCart);
cartRoutes.delete("/:productId", requireAuth, removeCartItem);

export default cartRoutes;
