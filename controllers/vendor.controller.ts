import { handle } from "../lib/handler";
import {
  createVendorSchema,
  updateVendorSchema,
  addProductVendorSchema,
  updateProductVendorSchema,
} from "../validations/vendor.validation";
import * as vendorService from "../services/vendor.service";

// ─── Vendor CRUD ──────────────────────────────────────────────────────────────

export const listVendors = handle(async (_req, res) => {
  const vendors = await vendorService.listVendors();
  res.json({ success: true, data: vendors });
});

export const getVendor = handle(async (req, res) => {
  const vendor = await vendorService.getVendor(req.params.id as string);
  res.json({ success: true, data: vendor });
});

export const createVendor = handle(async (req, res) => {
  const body = createVendorSchema.parse(req.body);
  const vendor = await vendorService.createVendor(body);
  res.status(201).json({ success: true, data: vendor });
});

export const updateVendor = handle(async (req, res) => {
  const body = updateVendorSchema.parse(req.body);
  const vendor = await vendorService.updateVendor(req.params.id as string, body);
  res.json({ success: true, data: vendor });
});

export const deleteVendor = handle(async (req, res) => {
  await vendorService.deleteVendor(req.params.id as string);
  res.json({ success: true, message: "Vendor deleted" });
});

// ─── Product ↔ Vendor ─────────────────────────────────────────────────────────

export const getProductVendors = handle(async (req, res) => {
  const vendors = await vendorService.getProductVendors(req.params.productId as string);
  res.json({ success: true, data: vendors });
});

export const addProductVendor = handle(async (req, res) => {
  const body = addProductVendorSchema.parse(req.body);
  const entry = await vendorService.addProductVendor(req.params.productId as string, body, req.user?.userId);
  res.status(201).json({ success: true, data: entry });
});

export const setActiveVendor = handle(async (req, res) => {
  const entry = await vendorService.setActiveVendor(req.params.productId as string, req.params.vendorId as string);
  res.json({ success: true, data: entry });
});

export const updateProductVendor = handle(async (req, res) => {
  const body = updateProductVendorSchema.parse(req.body);
  const entry = await vendorService.updateProductVendor(
    req.params.productId as string,
    req.params.vendorId as string,
    body,
    req.user?.userId
  );
  res.json({ success: true, data: entry });
});

export const removeProductVendor = handle(async (req, res) => {
  await vendorService.removeProductVendor(req.params.productId as string, req.params.vendorId as string);
  res.json({ success: true, message: "Vendor removed from product" });
});
