import prisma from "../config/prisma";
import type { Order } from "../../generated/prisma/client";
import type { OrderStatus } from "../../generated/prisma/enums";
import { OrderEvent, shouldReplaceStatus } from "./orderParser";
import { OrderCategory, categorizeOrder, categoryLabel } from "./orderCategory";
import { monthRange, summarizeSpend } from "./spendSummary";
import { logger } from "../utils/logger";

type OrderInput = {
  id: string; // Gmail message ID
  orderId: string | null;
  status: OrderStatus;
  vendor: string;
  snippet: string;
  date: string; // email date
  orderedAt?: string;
  userId: string;
  trackingNumber: string | null;
  title: string | null;
  titles?: string[];
  amount: number | null;
  currency: string | null;
  carrier: { code: string; name: string } | null;
  trackingUrl: string | null;
  events?: OrderEvent[];
};

const IN_TRANSIT: OrderStatus[] = ["SHIPPED", "OUT_FOR_DELIVERY"];

// Creates the category the first time an order lands in it (e.g. FRAGRANCE).
export const ensureCategory = async (key: OrderCategory) => {
  const { count } = await prisma.category.createMany({
    data: [{ key, label: categoryLabel(key) }],
    skipDuplicates: true,
  });
  if (count) logger.info(`Created new category ${key}`);
};
const CLOSED: OrderStatus[] = ["DELIVERED", "CANCELLED", "RETURNED", "REFUNDED"];

export const upsertOrders = async (orders: OrderInput[]) => {
  for (const order of orders) {
    const key = order.orderId;

    // skip if no orderId (keep as is for now)
    if (!key) continue;

    // One bad email must not abort the whole sync.
    try {
      const existing = await prisma.order.findFirst({
        where: { userId: order.userId, vendor: order.vendor, externalOrderId: key },
      });

      // Newer parses win for product details; totals and order date keep the
      // first value found (from the confirmation email).
      const titles = order.titles?.length ? order.titles : existing?.titles ?? [];
      const category = categorizeOrder(titles, order.vendor);
      await ensureCategory(category);
      const details = {
        title: titles[0] ?? null,
        titles,
        category,
        amount: existing?.amount ?? order.amount,
        currency: existing?.amount != null ? existing.currency : order.currency,
        orderedAt: existing?.orderedAt ?? new Date(order.orderedAt ?? order.date),
        trackingNumber: order.trackingNumber || existing?.trackingNumber || null,
        carrierCode: order.carrier?.code ?? existing?.carrierCode ?? null,
        carrierName: order.carrier?.name ?? existing?.carrierName ?? null,
        trackingUrl: order.trackingUrl ?? existing?.trackingUrl ?? null,
        rawEmailSnippet: order.snippet,
        sourceId: order.id,
      };

      let orderRowId: string;
      if (!existing) {
        const created = await prisma.order.create({
          data: {
            userId: order.userId,
            externalOrderId: key,
            vendor: order.vendor,
            status: order.status,
            deliveredAt: order.status === "DELIVERED" ? new Date(order.date) : undefined,
            ...details,
          },
        });
        orderRowId = created.id;
      } else {
        const advance = shouldReplaceStatus(order.status, existing.status);
        await prisma.order.update({
          where: { id: existing.id },
          data: {
            ...details,
            status: advance ? order.status : existing.status,
            deliveredAt: advance && order.status === "DELIVERED" ? new Date(order.date) : existing.deliveredAt,
          },
        });
        orderRowId = existing.id;
      }

      // Timeline: one event per email; re-syncing the same email is a no-op.
      if (order.events?.length) {
        await prisma.orderEvent.createMany({
          data: order.events.map((e) => ({
            orderId: orderRowId,
            status: e.status,
            occurredAt: new Date(e.at),
            description: e.description,
            source: "EMAIL",
            sourceRef: e.sourceRef,
          })),
          skipDuplicates: true,
        });
      }
    } catch (error) {
      logger.error(`Failed to save order ${key} for user ${order.userId}`, error);
    }
  }

  return { message: "Orders synced successfully" };
};

export const toOrderDto = (order: Order & { categoryRef?: { label: string } | null }) => {
  const category = order.category;
  return {
    id: order.id,
    title: order.title,
    titles: order.titles,
    orderId: order.externalOrderId,
    vendor: order.vendor,
    category,
    categoryLabel: order.categoryRef?.label ?? categoryLabel(category),
    status: order.status,
    amount: order.amount,
    currency: order.currency,
    trackingNumber: order.trackingNumber,
    carrier: order.carrierCode ? { code: order.carrierCode, name: order.carrierName ?? order.carrierCode } : null,
    trackingUrl: order.trackingUrl,

    // dates
    orderedAt: order.orderedAt,
    deliveredAt: order.deliveredAt,
    expectedDelivery: order.expectedDelivery,

    // useful UI flags
    isDelivered: order.status === "DELIVERED",
    isInTransit: IN_TRANSIT.includes(order.status),
    isCancelled: order.status === "CANCELLED",

    createdAt: order.createdAt,
  };
};

const NEWEST_FIRST = [{ orderedAt: { sort: "desc" as const, nulls: "last" as const } }, { createdAt: "desc" as const }];

export const getOrders = async (
  userId: string,
  filters: { category?: OrderCategory; status?: OrderStatus } = {}
) => {
  const orders = await prisma.order.findMany({
    where: { userId, category: filters.category, status: filters.status },
    include: { categoryRef: { select: { label: true } } },
    orderBy: NEWEST_FIRST,
  });
  return orders.map(toOrderDto);
};

// Orders still on their way: not yet delivered, cancelled, returned or refunded.
export const getActiveOrders = async (userId: string) => {
  const orders = await prisma.order.findMany({
    where: { userId, status: { notIn: CLOSED } },
    include: { categoryRef: { select: { label: true } } },
    orderBy: NEWEST_FIRST,
  });
  return orders.map(toOrderDto);
};

// Spend for one month (India time), overall and per category.
export const getMonthlySummary = async (userId: string, month: string) => {
  const { start, end } = monthRange(month);
  const [categories, orders] = await Promise.all([
    listCategories(),
    prisma.order.findMany({
      where: { userId, orderedAt: { gte: start, lt: end } },
      select: { category: true, status: true, amount: true, currency: true },
    }),
  ]);
  return summarizeSpend(month, categories, orders);
};

// All categories known so far (defaults + any created automatically).
export const listCategories = () =>
  prisma.category.findMany({ select: { key: true, label: true }, orderBy: { label: "asc" } });
