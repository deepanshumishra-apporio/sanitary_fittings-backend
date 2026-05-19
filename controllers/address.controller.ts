import { handle } from "../lib/handler";
import { createAddressSchema, updateAddressSchema } from "../validations/address.validation";
import * as addressService from "../services/address.service";

export const getAddresses = handle(async (req, res) => {
  const addresses = await addressService.getAddresses(req.user!.userId);
  res.json({ success: true, data: addresses });
});

export const getAddressById = handle(async (req, res) => {
  const address = await addressService.getAddressById(req.params.id as string, req.user!.userId);
  res.json({ success: true, data: address });
});

export const createAddress = handle(async (req, res) => {
  const body = createAddressSchema.parse(req.body);
  const address = await addressService.createAddress(req.user!.userId, body);
  res.status(201).json({ success: true, data: address });
});

export const updateAddress = handle(async (req, res) => {
  const body = updateAddressSchema.parse(req.body);
  const address = await addressService.updateAddress(req.params.id as string, req.user!.userId, body);
  res.json({ success: true, data: address });
});

export const setDefaultAddress = handle(async (req, res) => {
  const address = await addressService.setDefaultAddress(req.params.id as string, req.user!.userId);
  res.json({ success: true, data: address });
});

export const deleteAddress = handle(async (req, res) => {
  await addressService.deleteAddress(req.params.id as string, req.user!.userId);
  res.json({ success: true, message: "Address deleted" });
});
