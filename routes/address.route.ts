import { Router } from "express";
import {
  getAddresses,
  getAddressById,
  createAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
} from "../controllers/address.controller";
import { requireAuth } from "../middleware/auth.middleware";

const addressRoutes = Router();

addressRoutes.get("/", requireAuth, getAddresses);
addressRoutes.get("/:id", requireAuth, getAddressById);
addressRoutes.post("/", requireAuth, createAddress);
addressRoutes.patch("/:id", requireAuth, updateAddress);
addressRoutes.patch("/:id/default", requireAuth, setDefaultAddress);
addressRoutes.delete("/:id", requireAuth, deleteAddress);

export default addressRoutes;
