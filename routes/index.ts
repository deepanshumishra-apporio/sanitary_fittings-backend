import { Router } from "express";
import authRoutes from "./auth.route";
import addressRoutes from "./address.route";
import categoryRoutes from "./category.route";
import companyRoutes from "./company.route";
import orderRoutes from "./order.route";
import productRoutes from "./product.route";
import rateEntryRoutes from "./rate-entry.route";
import subCategoryRoutes from "./subcategory.route";
import vendorRoutes from "./vendor.route";

const router = Router();

router.use("/auth", authRoutes);
router.use("/category", categoryRoutes);
router.use("/subcategory", subCategoryRoutes);
router.use("/company", companyRoutes);
router.use("/rate-entry", rateEntryRoutes);
router.use("/order", orderRoutes);
router.use("/product", productRoutes);
router.use("/vendor", vendorRoutes);
router.use("/address", addressRoutes);

export default router;
