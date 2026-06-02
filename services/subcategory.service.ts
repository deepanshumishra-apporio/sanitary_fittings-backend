import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import type { CreateSubCategoryDto, UpdateSubCategoryDto } from "../validations/subcategory.validation";

const subCategoryInclude = {
  category: { select: { id: true, name: true } },
  _count: { select: { products: true } },
};

export async function listSubCategories() {
  return prisma.subCategory.findMany({
    include: subCategoryInclude,
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
  });
}

export async function getSubCategory(id: string) {
  const subCategory = await prisma.subCategory.findUnique({
    where: { id },
    include: subCategoryInclude,
  });
  if (!subCategory) throw new AppError(404, "Sub category not found");
  return subCategory;
}

export async function createSubCategory(dto: CreateSubCategoryDto) {
  const category = await prisma.category.findUnique({ where: { id: dto.categoryId }, select: { id: true } });
  if (!category) throw new AppError(400, "Category not found");

  const exists = await prisma.subCategory.findFirst({
    where: { categoryId: dto.categoryId, name: dto.name },
    select: { id: true },
  });
  if (exists) throw new AppError(409, "Sub category with this name already exists in the selected category");

  return prisma.subCategory.create({ data: dto, include: subCategoryInclude });
}

export async function updateSubCategory(id: string, dto: UpdateSubCategoryDto) {
  const current = await prisma.subCategory.findUnique({
    where: { id },
    select: { id: true, categoryId: true, name: true },
  });
  if (!current) throw new AppError(404, "Sub category not found");

  const categoryId = dto.categoryId ?? current.categoryId;

  if (dto.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: dto.categoryId }, select: { id: true } });
    if (!category) throw new AppError(400, "Category not found");
  }

  if (dto.name || dto.categoryId) {
    const exists = await prisma.subCategory.findFirst({
      where: {
        categoryId,
        name: dto.name ?? current.name,
        NOT: { id },
      },
      select: { id: true },
    });
    if (exists) throw new AppError(409, "Sub category with this name already exists in the selected category");
  }

  return prisma.subCategory.update({
    where: { id },
    data: dto,
    include: subCategoryInclude,
  });
}

export async function deleteSubCategory(id: string) {
  const subCategory = await prisma.subCategory.findUnique({
    where: { id },
    select: { id: true, _count: { select: { products: true } } },
  });
  if (!subCategory) throw new AppError(404, "Sub category not found");
  if (subCategory._count.products > 0) {
    throw new AppError(409, "Cannot delete a sub category that has products assigned to it");
  }

  await prisma.subCategory.delete({ where: { id } });
}
