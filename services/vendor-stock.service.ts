import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { ensureCompanyVendorLink } from "./company-vendor-link.service";
import type {
  CreateVendorStockBillDto,
  VendorStockBillQueryDto,
  VendorStockHistoryQueryDto,
} from "../validations/vendor-stock.validation";

type StockTx = Prisma.TransactionClient;

type StockMovementInput = {
  billId?: string | null;
  changeQty: number;
  companyId?: string | null;
  notes?: string;
  orderId?: string | null;
  productId: string;
  rate?: number;
  type: "INITIAL" | "PURCHASE_BILL" | "MANUAL_UPDATE" | "ORDER_SOLD" | "ORDER_CANCELLED" | "ADJUSTMENT";
  updatedById?: string | null;
  vendorId: string;
};

const stockEntryInclude = {
  bill: { select: { id: true, billNo: true, billDate: true, billAmount: true } },
  company: { select: { id: true, name: true } },
  product: { select: { id: true, name: true, images: true } },
  updatedBy: { select: { id: true, name: true, email: true } },
  vendor: { select: { id: true, name: true, email: true, phone: true } },
};

const stockBillInclude = {
  company: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  entries: {
    include: {
      product: { select: { id: true, name: true, images: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  vendor: { select: { id: true, name: true, email: true, phone: true } },
};

async function getOrCreateProductVendor(tx: StockTx, input: StockMovementInput) {
  const [product, vendor] = await Promise.all([
    tx.product.findUnique({
      where: { id: input.productId },
      select: { id: true, companyId: true },
    }),
    tx.vendor.findUnique({ where: { id: input.vendorId }, select: { id: true } }),
  ]);
  if (!product) throw new AppError(404, "Product not found");
  if (!vendor) throw new AppError(404, "Vendor not found");

  const effectiveCompanyId = input.companyId ?? product.companyId ?? null;
  if (input.companyId && product.companyId && input.companyId !== product.companyId) {
    throw new AppError(400, "Product does not belong to the selected company");
  }

  const existing = await tx.productVendor.findUnique({
    where: { productId_vendorId: { productId: input.productId, vendorId: input.vendorId } },
  });
  if (existing) return { entry: existing, effectiveCompanyId, isFirstVendor: false, wasCreated: false };

  const count = await tx.productVendor.count({ where: { productId: input.productId } });
  const isFirstVendor = count === 0;
  const entry = await tx.productVendor.create({
    data: {
      isActive: isFirstVendor,
      price: input.rate ?? 0,
      productId: input.productId,
      sku: undefined,
      stock: 0,
      vendorId: input.vendorId,
    },
  });

  return { entry, effectiveCompanyId, isFirstVendor, wasCreated: true };
}

export async function recordVendorStockMovement(tx: StockTx, input: StockMovementInput) {
  const { entry, effectiveCompanyId, isFirstVendor } = await getOrCreateProductVendor(tx, input);
  if (effectiveCompanyId) await ensureCompanyVendorLink(tx, effectiveCompanyId, input.vendorId);

  const oldStock = entry.stock;
  const newStock = Math.max(0, oldStock + input.changeQty);
  if (oldStock + input.changeQty < 0) {
    throw new AppError(400, "Stock cannot go below zero");
  }

  const previousRate = entry.price;
  const nextRate = input.rate ?? entry.price;

  const updated = await tx.productVendor.update({
    where: { productId_vendorId: { productId: input.productId, vendorId: input.vendorId } },
    data: {
      price: nextRate,
      stock: newStock,
    },
  });

  if (updated.isActive || isFirstVendor) {
    await tx.product.update({
      where: { id: input.productId },
      data: { price: updated.price, stock: updated.stock },
    });
  }

  return tx.vendorStockEntry.create({
    data: {
      billId: input.billId ?? null,
      changeQty: input.changeQty,
      companyId: effectiveCompanyId,
      newStock,
      notes: input.notes,
      oldStock,
      orderId: input.orderId ?? null,
      previousRate,
      productId: input.productId,
      rate: input.rate ?? null,
      type: input.type,
      updatedById: input.updatedById ?? null,
      vendorId: input.vendorId,
    },
    include: stockEntryInclude,
  });
}

export async function createVendorStockBill(dto: CreateVendorStockBillDto, createdById?: string) {
  if (new Set(dto.entries.map((entry) => entry.productId)).size !== dto.entries.length) {
    throw new AppError(400, "Duplicate products in stock bill");
  }

  return prisma.$transaction(async (tx) => {
    const bill = await tx.vendorStockBill.create({
      data: {
        billAmount: dto.billAmount,
        billDate: dto.billDate,
        billNo: dto.billNo,
        companyId: dto.companyId,
        createdById,
        notes: dto.notes,
        vendorId: dto.vendorId,
      },
    });

    for (const entry of dto.entries) {
      await recordVendorStockMovement(tx, {
        billId: bill.id,
        changeQty: entry.quantity,
        companyId: dto.companyId,
        notes: entry.notes,
        productId: entry.productId,
        rate: entry.rate,
        type: "PURCHASE_BILL",
        updatedById: createdById,
        vendorId: dto.vendorId,
      });
    }

    return tx.vendorStockBill.findUniqueOrThrow({
      where: { id: bill.id },
      include: stockBillInclude,
    });
  });
}

export async function listVendorStockBills(query: VendorStockBillQueryDto) {
  const { page, limit, vendorId, companyId, productId, billNo } = query;
  const skip = (page - 1) * limit;
  const where = {
    ...(vendorId && { vendorId }),
    ...(companyId && { companyId }),
    ...(billNo && { billNo: { contains: billNo, mode: "insensitive" as const } }),
    ...(productId && { entries: { some: { productId } } }),
  };

  const [data, total] = await Promise.all([
    prisma.vendorStockBill.findMany({
      where,
      include: stockBillInclude,
      orderBy: { billDate: "desc" },
      skip,
      take: limit,
    }),
    prisma.vendorStockBill.count({ where }),
  ]);

  return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
}

export async function listVendorStockHistory(query: VendorStockHistoryQueryDto) {
  const { page, limit, productId, vendorId } = query;
  const skip = (page - 1) * limit;
  const where = {
    ...(productId && { productId }),
    ...(vendorId && { vendorId }),
  };

  const [data, total] = await Promise.all([
    prisma.vendorStockEntry.findMany({
      where,
      include: stockEntryInclude,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.vendorStockEntry.count({ where }),
  ]);

  return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
}
