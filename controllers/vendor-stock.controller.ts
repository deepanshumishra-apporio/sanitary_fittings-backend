import { handle } from "../lib/handler";
import {
  createVendorStockBillSchema,
  vendorStockBillQuerySchema,
  vendorStockHistoryQuerySchema,
} from "../validations/vendor-stock.validation";
import * as vendorStockService from "../services/vendor-stock.service";

export const createVendorStockBill = handle(async (req, res) => {
  const body = createVendorStockBillSchema.parse(req.body);
  const bill = await vendorStockService.createVendorStockBill(body, req.user?.userId);
  res.status(201).json({ success: true, data: bill });
});

export const listVendorStockBills = handle(async (req, res) => {
  const query = vendorStockBillQuerySchema.parse(req.query);
  const result = await vendorStockService.listVendorStockBills(query);
  res.json({ success: true, ...result });
});

export const listVendorStockHistory = handle(async (req, res) => {
  const query = vendorStockHistoryQuerySchema.parse(req.query);
  const result = await vendorStockService.listVendorStockHistory(query);
  res.json({ success: true, ...result });
});
