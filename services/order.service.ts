import type { Prisma } from "../generated/prisma/client";
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
  to?: Date
) {
  const skip = (page - 1) * limit;
  const where: Record<string, unknown> = {};
  if (status) where["status"] = status;
  if (from || to) where["createdAt"] = { ...(from && { gte: from }), ...(to && { lte: to }) };
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

export async function getOrderById(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { ...orderInclude, user: { select: { id: true, name: true, email: true } } },
  });
  if (!order) throw new AppError(404, "Order not found");
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
    discount: Math.min(productMap.get(item.productId)!.discount, productMap.get(item.productId)!.price),
  }));

  const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const discount = orderItems.reduce((sum, i) => sum + i.discount * i.quantity, 0);
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

export async function createManualOrder(dto: ManualOrderDto, createdById?: string) {
  // 1. Resolve or create user
  let targetUserId: string;

  if (dto.userId) {
    const user = await prisma.user.findUnique({ where: { id: dto.userId }, select: { id: true } });
    if (!user) throw new AppError(404, "User not found");
    targetUserId = user.id;
  } else {
    const email = dto.customerEmail!;
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      targetUserId = existing.id;
      // Fill in profile fields if they aren't set yet
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          ...(dto.customerName && { name: dto.customerName }),
          ...(dto.customerPhone && { phone: dto.customerPhone }),
        },
      });
    } else {
      const created = await prisma.user.create({
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

  // 2. Create a fresh delivery address linked to the resolved user (optional)
  const addrDto = dto.address;
  const address = addrDto
    ? await prisma.address.create({
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

  // 3. Validate products exist and have enough stock
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
    discount: Math.min(productMap.get(item.productId)!.discount, productMap.get(item.productId)!.price),
  }));

  const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const discountAmount = orderItems.reduce((sum, i) => sum + i.discount * i.quantity, 0);
  const totalPrice = Math.max(0, subtotal - discountAmount);

  // 4. Deduct stock and create order in a single transaction
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        userId: targetUserId,
        ...(address && { addressId: address.id }),
        totalPrice,
        discount: discountAmount,
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
        updatedById: createdById,
      });
    }

    return order;
  }, ORDER_TRANSACTION_OPTIONS);
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
