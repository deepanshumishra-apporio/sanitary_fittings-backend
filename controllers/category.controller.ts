import { handle } from "../lib/handler";
import { createCategorySchema, updateCategorySchema } from "../validations/category.validation";
import * as categoryService from "../services/category.service";

export const listCategories = handle(async (_req, res) => {
  const categories = await categoryService.listCategories();
  res.json({ success: true, data: categories });
});

export const getCategory = handle(async (req, res) => {
  const category = await categoryService.getCategory(req.params.id as string);
  res.json({ success: true, data: category });
});

export const createCategory = handle(async (req, res) => {
  const body = createCategorySchema.parse(req.body);
  const category = await categoryService.createCategory(body);
  res.status(201).json({ success: true, data: category });
});

export const updateCategory = handle(async (req, res) => {
  const body = updateCategorySchema.parse(req.body);
  const category = await categoryService.updateCategory(req.params.id as string, body);
  res.json({ success: true, data: category });
});

export const deleteCategory = handle(async (req, res) => {
  await categoryService.deleteCategory(req.params.id as string);
  res.json({ success: true, message: "Category deleted" });
});
