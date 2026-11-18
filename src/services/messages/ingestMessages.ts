import prisma from "../../config/prisma";
import { logger } from "../../utils/logger";
import { shouldReplaceStatus } from "../orderParser";
import { categorizeOrder } from "../orderCategory";
import { ensureCategory } from "../order.service";
import { trackingUrlFor } from "../tracking/carriers";
import { IncomingMessage, ParsedMessage, QUICK_COMMERCE, parseOrderMessage } from "./messageParser";
import { CandidateOrder, canCreateOrder, chooseTargetOrder } from "./matchOrder";

export type MessageOutcome = "ATTACHED" | "CREATED" | "IGNORED" | "DUPLICATE" | "FAILED";
export type MessageResult = { id: string; outcome: MessageOutcome; orderId: string | null };

const CLOSED = ["DELIVERED", "CANCELLED", "RETURNED", "REFUNDED"] as const;

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "P2002";

// Orders this message could belong to: by order ID, by AWB, or (quick commerce) the app's open orders.
const loadCandidates = async (userId: string, m: ParsedMessage): Promise<CandidateOrder[]> => {
  const or = [
    ...(m.orderId ? [{ vendor: m.vendor, externalOrderId: m.orderId }] : []),
    ...(m.trackingNumber ? [{ trackingNumber: m.trackingNumber }] : []),
    ...(QUICK_COMMERCE.has(m.vendor) ? [{ vendor: m.vendor, status: { notIn: [...CLOSED] } }] : []),
  ];
  if (!or.length) return [];

  const orders = await prisma.order.findMany({
    where: { userId, OR: or },
    include: { events: { orderBy: { occurredAt: "desc" }, take: 1, select: { occurredAt: true } } },
  });
  return orders.map((o) => ({
    id: o.id,
    vendor: o.vendor,
    externalOrderId: o.externalOrderId,
    trackingNumber: o.trackingNumber,
    status: o.status,
    lastActivityAt: o.events[0]?.occurredAt ?? o.orderedAt ?? o.createdAt,
  }));
};

const addEvent = (orderId: string, message: IncomingMessage, parsed: ParsedMessage) =>
  prisma.orderEvent.createMany({
    data: [{
      orderId,
      status: parsed.status,
      occurredAt: new Date(message.receivedAt),
      description: parsed.text,
      source: message.source,
      sourceRef: `${message.source}:${message.id}`,
    }],
    skipDuplicates: true,
  });

const applyMessage = async (userId: string, message: IncomingMessage): Promise<Omit<MessageResult, "id">> => {
  const parsed = parseOrderMessage(message);
  if (!parsed) return { outcome: "IGNORED", orderId: null };

  const receivedAt = new Date(message.receivedAt);
  const target = chooseTargetOrder(parsed, receivedAt, await loadCandidates(userId, parsed));

  if (target) {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: target.id } });
    const advance = shouldReplaceStatus(parsed.status, order.status);
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: advance ? parsed.status : order.status,
        deliveredAt: advance && parsed.status === "DELIVERED" ? receivedAt : order.deliveredAt,
        trackingNumber: order.trackingNumber ?? parsed.trackingNumber,
        carrierCode: order.carrierCode ?? parsed.carrier?.code ?? null,
        carrierName: order.carrierName ?? parsed.carrier?.name ?? null,
        trackingUrl: order.trackingUrl ?? trackingUrlFor(parsed.carrier?.code ?? null, parsed.trackingNumber),
        amount: order.amount ?? parsed.amount,
        currency: order.amount != null ? order.currency : parsed.currency,
      },
    });
    await addEvent(order.id, message, parsed);
    return { outcome: "ATTACHED", orderId: order.id };
  }

  if (!canCreateOrder(parsed)) return { outcome: "IGNORED", orderId: null };

  const category = categorizeOrder([], parsed.vendor);
  await ensureCategory(category);
  const created = await prisma.order.create({
    data: {
      userId,
      externalOrderId: parsed.orderId,
      vendor: parsed.vendor,
      status: parsed.status,
      source: message.source,
      category,
      orderedAt: receivedAt,
      deliveredAt: parsed.status === "DELIVERED" ? receivedAt : undefined,
      amount: parsed.amount,
      currency: parsed.currency,
      trackingNumber: parsed.trackingNumber,
      carrierCode: parsed.carrier?.code ?? null,
      carrierName: parsed.carrier?.name ?? null,
      trackingUrl: trackingUrlFor(parsed.carrier?.code ?? null, parsed.trackingNumber),
      rawEmailSnippet: parsed.text,
      sourceId: `${message.source}:${message.id}`,
    },
  });
  await addEvent(created.id, message, parsed);
  return { outcome: "CREATED", orderId: created.id };
};

/**
 * Process SMS / app notifications sent by the phone, in the order received.
 * Each message is claimed first (unique per user + source + phone message ID),
 * so a resent message is reported as DUPLICATE and never applied twice.
 */
export const ingestMessages = async (userId: string, messages: IncomingMessage[]): Promise<MessageResult[]> => {
  const results: MessageResult[] = [];
  const ordered = [...messages].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));

  for (const message of ordered) {
    const key = { userId, source: message.source, externalId: message.id };
    let claimId: string;
    try {
      ({ id: claimId } = await prisma.receivedMessage.create({
        data: { ...key, outcome: "PENDING", receivedAt: new Date(message.receivedAt) },
      }));
    } catch (error) {
      if (isUniqueViolation(error)) {
        results.push({ id: message.id, outcome: "DUPLICATE", orderId: null });
        continue;
      }
      throw error;
    }

    try {
      const { outcome, orderId } = await applyMessage(userId, message);
      await prisma.receivedMessage.update({ where: { id: claimId }, data: { outcome, orderId } });
      results.push({ id: message.id, outcome, orderId });
    } catch (error) {
      // Release the claim so the phone can send this message again later.
      logger.error(`Failed to process ${message.source} message ${message.id}`, error);
      await prisma.receivedMessage.delete({ where: { id: claimId } }).catch(() => undefined);
      results.push({ id: message.id, outcome: "FAILED", orderId: null });
    }
  }
  return results;
};
