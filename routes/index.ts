import { Router } from "express";
import authRoutes from "./auth.route";
import addressRoutes from "./address.route";
import categoryRoutes from "./category.route";
import orderRoutes from "./order.route";
import productRoutes from "./product.route";
import vendorRoutes from "./vendor.route";
import wishlistRoutes from "./wishlist.route";
import cartRoutes from "./cart.route";
import checkoutRoutes from "./checkout.route";
import reviewRoutes from "./review.route";

const router = Router();

router.use("/auth", authRoutes);
router.use("/category", categoryRoutes);
router.use("/order", orderRoutes);
router.use("/product", productRoutes);
router.use("/vendor", vendorRoutes);
router.use("/wishlist", wishlistRoutes);
router.use("/cart", cartRoutes);
router.use("/checkout", checkoutRoutes);
router.use("/address", addressRoutes);
router.use("/review", reviewRoutes);

export default router;
