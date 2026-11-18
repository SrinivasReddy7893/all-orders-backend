import prisma from "../../config/prisma";
import { logger } from "../../utils/logger";
import { toOrderDto } from "../order.service";
import { normalizeTrackingQuery } from "./carriers";
import { getLiveProvider } from "./liveProvider";
import { buildTrackingResult, TrackingResult } from "./trackingResult";

/**
 * Universal tracking: whatever the user typed (order number, tracking number,
 * AWB, consignment ID), find the order it belongs to, the courier, and the
 * timeline; add live courier scans when a provider is configured.
 */
export const trackShipment = async (userId: string, rawQuery: string): Promise<TrackingResult> => {
  const query = normalizeTrackingQuery(rawQuery);

  const order = await prisma.order.findFirst({
    where: {
      userId,
      OR: [
        { externalOrderId: { equals: query, mode: "insensitive" } },
        { trackingNumber: { equals: query, mode: "insensitive" } },
      ],
    },
    include: {
      categoryRef: { select: { label: true } },
      events: { orderBy: { occurredAt: "desc" } },
    },
  });

  const trackingNumber = order ? order.trackingNumber : query;
  const provider = getLiveProvider();
  let live = null;
  if (provider && trackingNumber) {
    try {
      live = await provider.track(trackingNumber, order?.carrierCode ?? null);
    } catch (error) {
      // A provider outage must not break the tracking page; fall back to email updates.
      logger.error(`Live tracking via ${provider.name} failed for ${trackingNumber}`, error);
    }
  }

  return buildTrackingResult(
    query,
    order && {
      dto: toOrderDto(order),
      externalOrderId: order.externalOrderId,
      status: order.status,
      trackingNumber: order.trackingNumber,
      carrierCode: order.carrierCode,
      carrierName: order.carrierName,
      trackingUrl: order.trackingUrl,
      events: order.events,
    },
    live
  );
};
