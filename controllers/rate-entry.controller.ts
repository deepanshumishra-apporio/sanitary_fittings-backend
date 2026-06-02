import { handle } from "../lib/handler";
import { createRateEntrySchema, rateEntryQuerySchema } from "../validations/rate-entry.validation";
import * as rateEntryService from "../services/rate-entry.service";

export const listRateEntries = handle(async (req, res) => {
  const query = rateEntryQuerySchema.parse(req.query);
  const result = await rateEntryService.listRateEntries(query);
  res.json({ success: true, ...result });
});

export const createRateEntry = handle(async (req, res) => {
  const body = createRateEntrySchema.parse(req.body);
  const entry = await rateEntryService.createRateEntry(body);
  res.status(201).json({ success: true, data: entry });
});
