import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import type { Order } from "../../generated/prisma/client";
import type { OrderStatus } from "../../generated/prisma/enums";
import { OrderEvent, STATUS_WEIGHT, shouldReplaceStatus } from "./orderParser";
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
  accountId?: string; // the mailbox this email came from
  trackingNumber: string | null;
  title: string | null;
  titles?: string[];
  amount: number | null;
  currency: string | null;
  carrier: { code: string; name: string } | null;
  trackingUrl: string | null;
  expectedDelivery?: string | null;
  events?: OrderEvent[];
};

// The most recent order email or courier scan, so the app can tell when an
// order has gone quiet.
export const LAST_EVENT = {
  select: { occurredAt: true },
  orderBy: { occurredAt: "desc" as const },
  take: 1,
};

export const MAILBOXES = { select: { account: { select: { email: true } } } };

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

/** Keep the first logo seen for each shop; later emails never replace it. */
export const saveBrandLogos = async (emails: { vendor: string; logoUrl?: string | null }[]) => {
  const byVendor = new Map<string, string>();
  for (const e of emails) if (e.logoUrl && !byVendor.has(e.vendor)) byVendor.set(e.vendor, e.logoUrl);
  if (!byVendor.size) return;
  const { count } = await prisma.brand.createMany({
    data: [...byVendor].map(([vendor, logoUrl]) => ({ vendor, logoUrl })),
    skipDuplicates: true,
  });
  if (count) logger.info(`Saved ${count} new brand logo(s)`);
};

/** Adds each order's shop logo, when we have one. */
const withLogos = async <T extends { vendor: string }>(orders: T[]) => {
  const vendors = [...new Set(orders.map((o) => o.vendor))];
  const brands = vendors.length
    ? await prisma.brand.findMany({ where: { vendor: { in: vendors } }, select: { vendor: true, logoUrl: true } })
    : [];
  const logos = new Map(brands.map((b) => [b.vendor, b.logoUrl]));
  return orders.map((o) => ({ ...o, logoUrl: logos.get(o.vendor) ?? null }));
};

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
        expectedDelivery: order.expectedDelivery ? new Date(order.expectedDelivery) : existing?.expectedDelivery ?? null,
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
            cancelledAt: order.status === "CANCELLED" ? new Date(order.date) : undefined,
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
            cancelledAt: advance && order.status === "CANCELLED" ? new Date(order.date) : existing.cancelledAt,
          },
        });
        orderRowId = existing.id;
      }

      // Remember which mailbox found this order (it may be in more than one).
      if (order.accountId) {
        await prisma.orderMailbox.createMany({
          data: [{ orderId: orderRowId, accountId: order.accountId }],
          skipDuplicates: true,
        });
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

export const toOrderDto = (
  order: Order & { categoryRef?: { label: string } | null;
    events?: { occurredAt: Date }[];
    mailboxes?: { account: { email: string } }[];
  }
) => {
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
    cancelledAt: order.cancelledAt,
    expectedDelivery: order.expectedDelivery,
    mailboxes: (order.mailboxes ?? []).map((m) => m.account.email),
    lastUpdateAt: order.events?.[0]?.occurredAt ?? order.deliveredAt ?? order.orderedAt ?? order.createdAt,

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
  { category, status, page = 1, pageSize = 20 }: { category?: OrderCategory; status?: OrderStatus; page?: number; pageSize?: number } = {}
) => {
  const where = { userId, category, status };
  const [orders, totalItems] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { categoryRef: { select: { label: true } }, events: LAST_EVENT, mailboxes: MAILBOXES },
      orderBy: NEWEST_FIRST,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where }),
  ]);
  return {
    orders: await withLogos(orders.map(toOrderDto)),
    pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) },
  };
};

// Orders still on their way: not yet delivered, cancelled, returned or refunded.
export const getActiveOrders = async (userId: string) => {
  const orders = await prisma.order.findMany({
    where: { userId, status: { notIn: CLOSED } },
    include: { categoryRef: { select: { label: true } }, events: LAST_EVENT, mailboxes: MAILBOXES },
    orderBy: NEWEST_FIRST,
  });
  return withLogos(orders.map(toOrderDto));
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


/** Steps a buyer can move an order to by hand, one per stop on the timeline. */
export const MANUAL_STATUSES = ["PLACED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"] as const;
export type ManualStatus = (typeof MANUAL_STATUSES)[number];

const STEP_NAME: Record<ManualStatus, string> = {
  PLACED: "Placed",
  PROCESSING: "Packed",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/**
 * The buyer moves an order forward on its timeline. Shops often skip emails
 * (many never send a delivery email), so this is the only way such an order
 * can finish. Only forward moves are allowed, matching how emails update an
 * order, so a later sync can never quietly undo the change. Cancelling is the
 * other way out, open to any order that has not been delivered.
 */
/** The India-time calendar day of a moment, as YYYY-MM-DD. */
const istDay = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

/**
 * The moment an order was delivered or cancelled, from the day the buyer
 * picked: 12:00 India time that day, or now when that is still ahead. A day
 * in the future, or before the order was placed, is refused.
 */
export const eventMoment = (day: string | undefined, orderedAt: Date | null, now = new Date()): Date => {
  if (!day) return now;
  if (day > istDay(now)) throw new AppError("That date is in the future.", 400, "DATE_IN_FUTURE");
  if (orderedAt && day < istDay(orderedAt)) {
    throw new AppError("That date is before the order was placed.", 400, "DATE_BEFORE_ORDER");
  }
  const noon = new Date(`${day}T06:30:00.000Z`);
  return noon > now ? now : noon;
};

export const setOrderStatus = async (userId: string, orderId: string, status: ManualStatus, day?: string) => {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId } });
  if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  if (CLOSED.includes(order.status) && order.status !== "DELIVERED") {
    throw new AppError("This order is already closed.", 400, "ORDER_NOT_ACTIVE");
  }
  if (status === order.status) return toOrderDto(order);
  if (order.status === "DELIVERED" && status === "CANCELLED") {
    throw new AppError("A delivered order can't be cancelled.", 400, "ORDER_ALREADY_DELIVERED");
  }
  if (status !== "CANCELLED" && STATUS_WEIGHT[status] < STATUS_WEIGHT[order.status]) {
    throw new AppError("An order can only move forward.", 400, "STATUS_NOT_FORWARD");
  }

  // Only a delivery or cancellation has a date worth choosing.
  const dated = status === "DELIVERED" || status === "CANCELLED";
  const now = dated ? eventMoment(day, order.orderedAt) : new Date();
  const [updated] = await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: {
        status,
        deliveredAt: status === "DELIVERED" ? now : order.deliveredAt,
        cancelledAt: status === "CANCELLED" ? now : order.cancelledAt,
      },
    }),
    prisma.orderEvent.create({
      data: {
        orderId: order.id,
        status,
        occurredAt: now,
        description: `Marked as ${STEP_NAME[status].toLowerCase()} by you`,
        source: "USER",
        sourceRef: `user-${status}-${order.id}`,
      },
    }),
  ]);
  return toOrderDto(updated);
};
