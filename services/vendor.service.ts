import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { ensureCompanyVendorLink } from "./company-vendor-link.service";
import { recordVendorStockMovement } from "./vendor-stock.service";
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
      companies: {
        include: { company: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
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
  if (dto.email) {
    const exists = await prisma.vendor.findUnique({ where: { email: dto.email } });
    if (exists) throw new AppError(409, "Vendor with this email already exists");
  }
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
  const vendor = await prisma.vendor.findUnique({
    where: { id },
    select: { id: true, _count: { select: { products: true } } },
  });
  if (!vendor) throw new AppError(404, "Vendor not found");
  if (vendor._count.products > 0) {
    throw new AppError(409, "Vendor is linked to one or more products; remove those links first");
  }
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

export async function addProductVendor(productId: string, dto: AddProductVendorDto, updatedById?: string) {
  const [product, vendor] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId }, select: { id: true, companyId: true } }),
    prisma.vendor.findUnique({ where: { id: dto.vendorId }, select: { id: true } }),
  ]);
  if (!product) throw new AppError(404, "Product not found");
  if (!vendor) throw new AppError(404, "Vendor not found");

  return prisma.$transaction(async (tx) => {
    const exists = await tx.productVendor.findUnique({
      where: { productId_vendorId: { productId, vendorId: dto.vendorId } },
      select: { id: true },
    });
    if (exists) throw new AppError(409, "Vendor already linked to this product");

    const count = await tx.productVendor.count({ where: { productId } });
    const isFirst = count === 0;

    await tx.productVendor.create({
      data: { productId, vendorId: dto.vendorId, price: dto.price, stock: 0, sku: dto.sku, isActive: isFirst },
      include: { vendor: { select: vendorSelect } },
    });
    await ensureCompanyVendorLink(tx, product.companyId, dto.vendorId);

    const bill =
      dto.billNo && dto.billDate
        ? await tx.vendorStockBill.upsert({
            where: {
              vendorId_billNo_billDate: {
                billDate: dto.billDate,
                billNo: dto.billNo,
                vendorId: dto.vendorId,
              },
            },
            create: {
              billDate: dto.billDate,
              billNo: dto.billNo,
              companyId: product.companyId,
              createdById: updatedById,
              vendorId: dto.vendorId,
            },
            update: {},
          })
        : null;

    await recordVendorStockMovement(tx, {
      billId: bill?.id,
      changeQty: dto.stock,
      companyId: product.companyId,
      productId,
      rate: dto.price,
      type: "INITIAL",
      updatedById,
      vendorId: dto.vendorId,
    });

    return tx.productVendor.findUniqueOrThrow({
      where: { productId_vendorId: { productId, vendorId: dto.vendorId } },
      include: { vendor: { select: vendorSelect } },
    });
  });
}

export async function setActiveVendor(productId: string, vendorId: string) {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.productVendor.findUnique({
      where: { productId_vendorId: { productId, vendorId } },
      select: { price: true, stock: true },
    });
    if (!entry) throw new AppError(404, "Vendor not linked to this product");

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

export async function updateProductVendor(productId: string, vendorId: string, dto: UpdateProductVendorDto, updatedById?: string) {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.productVendor.findUnique({
      where: { productId_vendorId: { productId, vendorId } },
      select: { isActive: true, price: true, stock: true, product: { select: { companyId: true } } },
    });
    if (!entry) throw new AppError(404, "Vendor not linked to this product");

    if (dto.stock !== undefined) {
      await tx.productVendor.update({
        where: { productId_vendorId: { productId, vendorId } },
        data: { sku: dto.sku },
      });
      await recordVendorStockMovement(tx, {
        changeQty: dto.stock - entry.stock,
        companyId: entry.product.companyId,
        notes: "Manual stock update",
        productId,
        rate: dto.price ?? entry.price,
        type: "ADJUSTMENT",
        updatedById,
        vendorId,
      });
    } else {
      await tx.productVendor.update({
        where: { productId_vendorId: { productId, vendorId } },
        data: dto,
      });
    }

    const updated = await tx.productVendor.findUniqueOrThrow({
      where: { productId_vendorId: { productId, vendorId } },
      include: { vendor: { select: vendorSelect } },
    });

    if (entry.isActive) {
      await tx.product.update({
        where: { id: productId },
        data: {
          stock: updated.stock,
          price: updated.price,
        },
      });
    }
    return updated;
  });
}

export async function removeProductVendor(productId: string, vendorId: string) {
  await prisma.$transaction(async (tx) => {
    const entry = await tx.productVendor.findUnique({
      where: { productId_vendorId: { productId, vendorId } },
      select: { isActive: true },
    });
    if (!entry) throw new AppError(404, "Vendor not linked to this product");

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
        await tx.product.update({ where: { id: productId }, data: { stock: 0, price: 0 } });
      }
    }
  });
}
