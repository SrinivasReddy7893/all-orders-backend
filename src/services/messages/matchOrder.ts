import type { OrderStatus } from "../../../generated/prisma/enums";
import { normalizeTrackingQuery } from "../tracking/carriers";
import { ParsedMessage, QUICK_COMMERCE } from "./messageParser";

export type CandidateOrder = {
  id: string;
  vendor: string;
  externalOrderId: string | null;
  trackingNumber: string | null;
  status: OrderStatus;
  lastActivityAt: Date; // latest of order date / last update
};

const CLOSED = new Set<OrderStatus>(["DELIVERED", "CANCELLED", "RETURNED", "REFUNDED"]);
// A food/grocery order lives for minutes to a couple of hours.
export const QUICK_COMMERCE_WINDOW_MS = 3 * 60 * 60 * 1000;

const same = (a: string | null, b: string | null) => !!a && !!b && normalizeTrackingQuery(a) === normalizeTrackingQuery(b);

/**
 * The existing order a phone message belongs to, or null (→ create one / ignore).
 * Order: same shop + order ID → tracking number → for quick commerce only,
 * the same app's still-open order from the last few hours.
 */
export const chooseTargetOrder = (
  message: ParsedMessage,
  receivedAt: Date,
  candidates: CandidateOrder[]
): CandidateOrder | null => {
  if (message.orderId) {
    const byId = candidates.find((o) => o.vendor === message.vendor && same(o.externalOrderId, message.orderId));
    if (byId) return byId;
  }

  if (message.trackingNumber) {
    const byAwb = candidates.find((o) => same(o.trackingNumber, message.trackingNumber));
    if (byAwb) return byAwb;
  }

  if (!message.orderId && QUICK_COMMERCE.has(message.vendor)) {
    const recentOpen = candidates
      .filter((o) => o.vendor === message.vendor && !CLOSED.has(o.status))
      .filter((o) => {
        const gap = receivedAt.getTime() - o.lastActivityAt.getTime();
        return gap >= 0 && gap <= QUICK_COMMERCE_WINDOW_MS;
      })
      .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
    if (recentOpen[0]) return recentOpen[0];
  }

  return null;
};

/** Whether an unmatched message has enough to start a new order. */
export const canCreateOrder = (message: ParsedMessage) =>
  !!message.orderId || !!message.trackingNumber || QUICK_COMMERCE.has(message.vendor);
