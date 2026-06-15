import type { Prisma, Role } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { recordVendorStockMovement } from "./vendor-stock.service";
import type {
  CreateOrderDto,
  UpdateOrderStatusDto,
  UpdatePaymentStatusDto,
  ManualOrderDto,
} from "../validations/order.validation";

const orderInclude = {
  items: {
    include: { product: { select: { id: true, name: true, price: true, discount: true, images: true } } },
  },
  address: true,
  dealer: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
    },
  },
  payment: {
    select: {
      id: true,
      amount: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  },
};

const ORDER_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 15_000,
} as const;

function normalizeDiscountPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 100);
}

function discountAmount(price: number, discountPercent: number) {
  return price * (normalizeDiscountPercent(discountPercent) / 100);
}

async function applyOrderStockMovement(
  tx: Prisma.TransactionClient,
  input: {
    changeQty: number;
    orderId: string;
    productId: string;
    type: "ORDER_SOLD" | "ORDER_CANCELLED";
    updatedById?: string;
  }
) {
  const activeVendor = await tx.productVendor.findFirst({
    where: { productId: input.productId, isActive: true },
    select: { vendorId: true, product: { select: { companyId: true } } },
  });

  if (!activeVendor) {
    await tx.product.update({
      where: { id: input.productId },
      data: { stock: { increment: input.changeQty } },
    });
    return;
  }

  await recordVendorStockMovement(tx, {
    changeQty: input.changeQty,
    companyId: activeVendor.product.companyId,
    orderId: input.orderId,
    productId: input.productId,
    type: input.type,
    updatedById: input.updatedById,
    vendorId: activeVendor.vendorId,
  });
}

export async function getMyOrders(userId: string, page: number, limit: number) {
  const skip = (page - 1) * limit;
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where: { userId },
      include: orderInclude,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.order.count({ where: { userId } }),
  ]);
  return { data: orders, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
}

export async function getMyOrderById(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
  if (!order) throw new AppError(404, "Order not found");
  if (order.userId !== userId) throw new AppError(403, "Forbidden");
  return order;
}

export async function getAllOrders(
  page: number,
  limit: number,
  status?: string,
  from?: Date,
  to?: Date,
  dealerId?: string
) {
  const skip = (page - 1) * limit;
  const where: Record<string, unknown> = {};
  if (status) where["status"] = status;
  if (from || to) where["createdAt"] = { ...(from && { gte: from }), ...(to && { lte: to }) };
  if (dealerId) where["dealerId"] = dealerId;
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { ...orderInclude, user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);
  return { data: orders, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
}

export async function getOrderById(orderId: string, dealerId?: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { ...orderInclude, user: { select: { id: true, name: true, email: true } } },
  });
  if (!order) throw new AppError(404, "Order not found");
  if (dealerId && order.dealerId !== dealerId) throw new AppError(403, "Forbidden");
  return order;
}

export async function createOrder(userId: string, dto: CreateOrderDto) {
  const address = await prisma.address.findUnique({ where: { id: dto.addressId } });
  if (!address) throw new AppError(400, "Address not found");
  if (address.userId !== userId) throw new AppError(403, "Forbidden");

  const productIds = dto.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, price: true, discount: true, stock: true },
  });

  if (products.length !== productIds.length) throw new AppError(400, "One or more products not found");

  const productMap = new Map(products.map((p) => [p.id, p]));

  for (const item of dto.items) {
    const product = productMap.get(item.productId)!;
    if (product.stock < item.quantity)
      throw new AppError(400, `Insufficient stock for "${product.name}"`);
  }

  const orderItems = dto.items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    price: productMap.get(item.productId)!.price,
    discount: normalizeDiscountPercent(productMap.get(item.productId)!.discount),
  }));

  const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const discount = orderItems.reduce((sum, i) => sum + discountAmount(i.price, i.discount) * i.quantity, 0);
  const totalPrice = Math.max(0, subtotal - discount);

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        userId,
        addressId: dto.addressId,
        totalPrice,
        discount,
        items: { create: orderItems },
        payment: {
          create: {
            userId,
            amount: totalPrice,
            status: "UNPAID",
          },
        },
      },
      include: orderInclude,
    });

    for (const item of dto.items) {
      await applyOrderStockMovement(tx, {
        changeQty: -item.quantity,
        orderId: order.id,
        productId: item.productId,
        type: "ORDER_SOLD",
        updatedById: userId,
      });
    }

    return order;
  }, ORDER_TRANSACTION_OPTIONS);
}

export async function updateOrderStatus(orderId: string, dto: UpdateOrderStatusDto, updatedById?: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) throw new AppError(404, "Order not found");

  if (order.status === dto.status) {
    return prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
  }

  if (dto.status === "PLACED") {
    throw new AppError(400, "Orders cannot be moved back to PLACED");
  }

  if (dto.status === "CANCELLED" && order.status !== "PLACED") {
    throw new AppError(400, `Cannot cancel a ${order.status} order`);
  }

  if (dto.status === "CANCELLED") {
    return prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        await applyOrderStockMovement(tx, {
          changeQty: item.quantity,
          orderId,
          productId: item.productId,
          type: "ORDER_CANCELLED",
          updatedById,
        });
      }

      return tx.order.update({
        where: { id: orderId },
        data: { status: "CANCELLED" },
        include: orderInclude,
      });
    }, ORDER_TRANSACTION_OPTIONS);
  }

  return prisma.order.update({ where: { id: orderId }, data: { status: dto.status }, include: orderInclude });
}

export async function updateOrderPaymentStatus(orderId: string, dto: UpdatePaymentStatusDto) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true, status: true, totalPrice: true, payment: { select: { id: true } } },
  });
  if (!order) throw new AppError(404, "Order not found");

  return prisma.$transaction(async (tx) => {
    await tx.payment.upsert({
      where: { orderId },
      create: {
        orderId,
        userId: order.userId,
        amount: order.totalPrice,
        status: dto.status,
      },
      update: {
        status: dto.status,
      },
    });

    return tx.order.update({
      where: { id: orderId },
      data: { status: order.status },
      include: orderInclude,
    });
  });
}

export async function createManualOrder(
  dto: ManualOrderDto,
  createdBy?: { userId: string; role: string }
) {
  // 1. Validate products exist and have enough stock (read-only, safe outside tx)
  const productIds = dto.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, price: true, discount: true, stock: true },
  });

  if (products.length !== productIds.length)
    throw new AppError(400, "One or more products not found");

  const productMap = new Map(products.map((p) => [p.id, p]));

  for (const item of dto.items) {
    const product = productMap.get(item.productId)!;
    if (product.stock < item.quantity)
      throw new AppError(400, `Insufficient stock for "${product.name}"`);
  }

  const orderItems = dto.items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    price: productMap.get(item.productId)!.price,
    discount: normalizeDiscountPercent(productMap.get(item.productId)!.discount),
  }));

  const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const totalDiscountAmount = orderItems.reduce((sum, i) => sum + discountAmount(i.price, i.discount) * i.quantity, 0);
  const totalPrice = Math.max(0, subtotal - totalDiscountAmount);

  // 2. Resolve user, create address, deduct stock, and create the order — all in
  //    one transaction so a later failure never leaves an orphaned user/address.
  return prisma.$transaction(async (tx) => {
    let targetUserId: string;

    if (dto.userId) {
      const user = await tx.user.findUnique({ where: { id: dto.userId }, select: { id: true } });
      if (!user) throw new AppError(404, "User not found");
      targetUserId = user.id;
    } else {
      const email = dto.customerEmail!;
      const existing = await tx.user.findUnique({ where: { email }, select: { id: true } });
      if (existing) {
        targetUserId = existing.id;
        // Fill in profile fields if they aren't set yet
        await tx.user.update({
          where: { id: existing.id },
          data: {
            ...(dto.customerName && { name: dto.customerName }),
            ...(dto.customerPhone && { phone: dto.customerPhone }),
          },
        });
      } else {
        const created = await tx.user.create({
          data: {
            email,
            name: dto.customerName ?? null,
            phone: dto.customerPhone ?? null,
            role: "CUSTOMER",
            emailVerified: false,
          },
          select: { id: true },
        });
        targetUserId = created.id;
      }
    }

    const addrDto = dto.address;
    const address = addrDto
      ? await tx.address.create({
          data: {
            userId: targetUserId,
            name: addrDto.name,
            phone: addrDto.phone ?? null,
            line1: addrDto.line1,
            line2: addrDto.line2 ?? null,
            city: addrDto.city,
            state: addrDto.state,
            zip: addrDto.zip,
            country: addrDto.country,
            isDefault: false,
          },
        })
      : null;

    const order = await tx.order.create({
      data: {
        userId: targetUserId,
        ...(createdBy?.role === "DEALER" && { dealerId: createdBy.userId }),
        ...(createdBy && { placedById: createdBy.userId, placedByRole: createdBy.role as Role }),
        ...(address && { addressId: address.id }),
        totalPrice,
        discount: totalDiscountAmount,
        status: "PLACED",
        items: { create: orderItems },
        payment: {
          create: {
            userId: targetUserId,
            amount: totalPrice,
            status: dto.paymentStatus ?? "UNPAID",
          },
        },
      },
      include: {
        ...orderInclude,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    for (const item of dto.items) {
      await applyOrderStockMovement(tx, {
        changeQty: -item.quantity,
        orderId: order.id,
        productId: item.productId,
        type: "ORDER_SOLD",
        updatedById: createdBy?.userId,
      });
    }

    return order;
  }, ORDER_TRANSACTION_OPTIONS);
}

export async function getPlacerAnalytics(opts: { from?: Date; to?: Date; placedById?: string }) {
  const where: Prisma.OrderWhereInput = {
    status: { not: "CANCELLED" },
    placedById: opts.placedById ? opts.placedById : { not: null },
  };
  if (opts.from || opts.to) {
    where.createdAt = { ...(opts.from && { gte: opts.from }), ...(opts.to && { lte: opts.to }) };
  }

  // Bounded to the most recent N orders so this in-memory aggregation can't OOM
  // as data grows. If the dataset outgrows this, move counts/revenue to a SQL
  // groupBy/_sum and top-products to a grouped orderItem query.
  const ANALYTICS_ROW_CAP = 20_000;
  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: ANALYTICS_ROW_CAP,
    select: {
      totalPrice: true,
      placedById: true,
      placedByRole: true,
      placedBy: { select: { id: true, name: true, email: true } },
      payment: { select: { status: true } },
      items: { select: { productId: true, quantity: true, product: { select: { name: true } } } },
    },
  });

  type Acc = {
    placedById: string;
    name: string;
    role: Role | null;
    ordersPlaced: number;
    revenuePaid: number;
    pendingAmount: number;
    products: Map<string, { productId: string; name: string; qty: number }>;
  };

  const map = new Map<string, Acc>();
  for (const o of orders) {
    if (!o.placedById) continue;
    let entry = map.get(o.placedById);
    if (!entry) {
      entry = {
        placedById: o.placedById,
        name: o.placedBy?.name ?? o.placedBy?.email ?? "—",
        role: o.placedByRole,
        ordersPlaced: 0,
        revenuePaid: 0,
        pendingAmount: 0,
        products: new Map(),
      };
      map.set(o.placedById, entry);
    }
    entry.ordersPlaced += 1;
    if (o.payment?.status === "PAID") entry.revenuePaid += o.totalPrice;
    else entry.pendingAmount += o.totalPrice;
    for (const it of o.items) {
      const p = entry.products.get(it.productId) ?? { productId: it.productId, name: it.product.name, qty: 0 };
      p.qty += it.quantity;
      entry.products.set(it.productId, p);
    }
  }

  return [...map.values()]
    .map((e) => ({
      placedById: e.placedById,
      name: e.name,
      role: e.role,
      ordersPlaced: e.ordersPlaced,
      revenuePaid: e.revenuePaid,
      pendingAmount: e.pendingAmount,
      topProducts: [...e.products.values()].sort((a, b) => b.qty - a.qty).slice(0, 5),
    }))
    .sort((a, b) => b.revenuePaid - a.revenuePaid);
}

export async function cancelOrder(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw new AppError(404, "Order not found");
  if (order.userId !== userId) throw new AppError(403, "Forbidden");

  const cancellable = ["PLACED"];
  if (!cancellable.includes(order.status)) throw new AppError(400, `Cannot cancel a ${order.status} order`);

  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      await applyOrderStockMovement(tx, {
        changeQty: item.quantity,
        orderId,
        productId: item.productId,
        type: "ORDER_CANCELLED",
        updatedById: userId,
      });
    }
    await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
  }, ORDER_TRANSACTION_OPTIONS);
}
