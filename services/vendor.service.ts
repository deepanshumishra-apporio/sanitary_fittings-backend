import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import type {
  CreateVendorDto,
  UpdateVendorDto,
  AddProductVendorDto,
  UpdateProductVendorDto,
} from "../validations/vendor.validation";

const vendorSelect = { id: true, name: true, email: true, phone: true };

// ─── Vendor CRUD ──────────────────────────────────────────────────────────────

export async function listVendors() {
  return prisma.vendor.findMany({ orderBy: { name: "asc" } });
}

export async function getVendor(id: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { id },
    include: {
      products: {
        include: { product: { select: { id: true, name: true, images: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!vendor) throw new AppError(404, "Vendor not found");
  return vendor;
}

export async function createVendor(dto: CreateVendorDto) {
  const exists = await prisma.vendor.findUnique({ where: { email: dto.email } });
  if (exists) throw new AppError(409, "Vendor with this email already exists");
  return prisma.vendor.create({ data: dto });
}

export async function updateVendor(id: string, dto: UpdateVendorDto) {
  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor) throw new AppError(404, "Vendor not found");

  if (dto.email && dto.email !== vendor.email) {
    const exists = await prisma.vendor.findUnique({ where: { email: dto.email } });
    if (exists) throw new AppError(409, "Email already in use by another vendor");
  }

  return prisma.vendor.update({ where: { id }, data: dto });
}

export async function deleteVendor(id: string) {
  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor) throw new AppError(404, "Vendor not found");
  await prisma.vendor.delete({ where: { id } });
}

// ─── Product ↔ Vendor ─────────────────────────────────────────────────────────

export async function getProductVendors(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) throw new AppError(404, "Product not found");

  return prisma.productVendor.findMany({
    where: { productId },
    include: { vendor: { select: vendorSelect } },
    orderBy: { isActive: "desc" },
  });
}

export async function addProductVendor(productId: string, dto: AddProductVendorDto) {
  const [product, vendor] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId }, select: { id: true, discount: true } }),
    prisma.vendor.findUnique({ where: { id: dto.vendorId }, select: { id: true } }),
  ]);
  if (!product) throw new AppError(404, "Product not found");
  if (!vendor) throw new AppError(404, "Vendor not found");
  if (dto.price < product.discount) throw new AppError(400, "Vendor price cannot be less than product discount");

  const exists = await prisma.productVendor.findUnique({
    where: { productId_vendorId: { productId, vendorId: dto.vendorId } },
  });
  if (exists) throw new AppError(409, "Vendor already linked to this product");

  const count = await prisma.productVendor.count({ where: { productId } });
  const isFirst = count === 0;

  return prisma.$transaction(async (tx) => {
    const entry = await tx.productVendor.create({
      data: { productId, vendorId: dto.vendorId, price: dto.price, stock: dto.stock, sku: dto.sku, isActive: isFirst },
      include: { vendor: { select: vendorSelect } },
    });
    if (isFirst) {
      await tx.product.update({ where: { id: productId }, data: { stock: dto.stock, price: dto.price } });
    }
    return entry;
  });
}

export async function setActiveVendor(productId: string, vendorId: string) {
  const entry = await prisma.productVendor.findUnique({
    where: { productId_vendorId: { productId, vendorId } },
  });
  if (!entry) throw new AppError(404, "Vendor not linked to this product");
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { discount: true } });
  if (!product) throw new AppError(404, "Product not found");
  if (entry.price < product.discount) throw new AppError(400, "Vendor price cannot be less than product discount");

  return prisma.$transaction(async (tx) => {
    await tx.productVendor.updateMany({ where: { productId }, data: { isActive: false } });
    const active = await tx.productVendor.update({
      where: { productId_vendorId: { productId, vendorId } },
      data: { isActive: true },
      include: { vendor: { select: vendorSelect } },
    });
    await tx.product.update({ where: { id: productId }, data: { stock: entry.stock, price: entry.price } });
    return active;
  });
}

export async function updateProductVendor(productId: string, vendorId: string, dto: UpdateProductVendorDto) {
  const entry = await prisma.productVendor.findUnique({
    where: { productId_vendorId: { productId, vendorId } },
  });
  if (!entry) throw new AppError(404, "Vendor not linked to this product");
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { discount: true } });
  if (!product) throw new AppError(404, "Product not found");
  const nextPrice = dto.price ?? entry.price;
  if (nextPrice < product.discount) throw new AppError(400, "Vendor price cannot be less than product discount");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.productVendor.update({
      where: { productId_vendorId: { productId, vendorId } },
      data: dto,
      include: { vendor: { select: vendorSelect } },
    });
    if (entry.isActive) {
      await tx.product.update({
        where: { id: productId },
        data: {
          ...(dto.stock !== undefined && { stock: dto.stock }),
          ...(dto.price !== undefined && { price: dto.price }),
        },
      });
    }
    return updated;
  });
}

export async function removeProductVendor(productId: string, vendorId: string) {
  const entry = await prisma.productVendor.findUnique({
    where: { productId_vendorId: { productId, vendorId } },
  });
  if (!entry) throw new AppError(404, "Vendor not linked to this product");

  await prisma.$transaction(async (tx) => {
    await tx.productVendor.delete({ where: { productId_vendorId: { productId, vendorId } } });

    if (entry.isActive) {
      const next = await tx.productVendor.findFirst({
        where: { productId },
        orderBy: { stock: "desc" },
      });
      if (next) {
        await tx.productVendor.update({ where: { id: next.id }, data: { isActive: true } });
        await tx.product.update({ where: { id: productId }, data: { stock: next.stock, price: next.price } });
      } else {
        await tx.product.update({ where: { id: productId }, data: { stock: 0 } });
      }
    }
  });
}
