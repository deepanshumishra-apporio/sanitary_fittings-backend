import { handle } from "../lib/handler";
import { createSubCategorySchema, updateSubCategorySchema } from "../validations/subcategory.validation";
import * as subCategoryService from "../services/subcategory.service";

export const listSubCategories = handle(async (_req, res) => {
  const subCategories = await subCategoryService.listSubCategories();
  res.json({ success: true, data: subCategories });
});

export const getSubCategory = handle(async (req, res) => {
  const subCategory = await subCategoryService.getSubCategory(req.params.id as string);
  res.json({ success: true, data: subCategory });
});

export const createSubCategory = handle(async (req, res) => {
  const body = createSubCategorySchema.parse(req.body);
  const subCategory = await subCategoryService.createSubCategory(body);
  res.status(201).json({ success: true, data: subCategory });
});

export const updateSubCategory = handle(async (req, res) => {
  const body = updateSubCategorySchema.parse(req.body);
  const subCategory = await subCategoryService.updateSubCategory(req.params.id as string, body);
  res.json({ success: true, data: subCategory });
});

export const deleteSubCategory = handle(async (req, res) => {
  await subCategoryService.deleteSubCategory(req.params.id as string);
  res.json({ success: true, message: "Sub category deleted" });
});
