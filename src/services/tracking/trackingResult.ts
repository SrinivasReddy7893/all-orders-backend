/**
 * Response contract for GET /tracking?q=… — the universal tracking page.
 * Always the same shape: fields are null/empty when unknown, so the page can
 * render any result without branching on which case it is.
 */

import type { OrderStatus } from "../../../generated/prisma/enums";
import { Carrier, identifyTrackingId, normalizeTrackingQuery, trackingUrlFor } from "./carriers";
import { shouldReplaceStatus } from "../orderParser";
import type { LiveTrackingResult } from "./liveProvider";

export type TrackingMatch = "ORDER_ID" | "TRACKING_NUMBER" | "NONE";

export type TimelineEvent = {
  status: OrderStatus | null;
  label: string;
  at: string;
  description: string;
  location: string | null;
  source: TimelineSource;
};

export type TimelineSource = "EMAIL" | "SMS" | "NOTIFICATION" | "CARRIER";
const SOURCES = new Set<string>(["EMAIL", "SMS", "NOTIFICATION", "CARRIER"]);

export type TrackingResult = {
  query: string;
  match: TrackingMatch;
  order: Record<string, unknown> | null; // same shape as GET /orders items
  currentStatus: OrderStatus | null;
  shipment: {
    trackingNumber: string | null;
    carrier: Carrier | null;
    possibleCarriers: Carrier[]; // when the courier can only be guessed from the ID format
    trackingUrl: string | null;  // courier's own tracking page
  };
  timeline: TimelineEvent[]; // newest first
  live: { available: boolean; provider: string | null; reason: string | null };
};

// What the tracking service loads for a matched order.
export type TrackedOrder = {
  dto: Record<string, unknown>;
  externalOrderId: string | null;
  status: OrderStatus;
  trackingNumber: string | null;
  carrierCode: string | null;
  carrierName: string | null;
  trackingUrl: string | null;
  events: { status: OrderStatus | null; occurredAt: Date; description: string; location: string | null; source: string }[];
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  PLACED: "Order placed",
  CONFIRMED: "Order confirmed",
  PROCESSING: "Being packed",
  SHIPPED: "Shipped",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  RETURNED: "Returned",
  REFUNDED: "Refunded",
};

const NOT_CONFIGURED = "Live courier tracking is not configured yet; showing updates from order emails, SMS and app notifications.";

// A typed value worth treating as a tracking number: has a digit and is AWB-length.
const looksLikeTrackingId = (q: string) => /\d/.test(q) && q.length >= 8;

export const buildTrackingResult = (
  rawQuery: string,
  order: TrackedOrder | null,
  live: LiveTrackingResult | null
): TrackingResult => {
  const query = normalizeTrackingQuery(rawQuery);

  const match: TrackingMatch = !order ? "NONE" : order.externalOrderId === query ? "ORDER_ID" : "TRACKING_NUMBER";
  const trackingNumber = order ? order.trackingNumber : looksLikeTrackingId(query) ? query : null;

  // Courier: what the order emails told us, else what the ID format tells us.
  const byFormat = trackingNumber ? identifyTrackingId(trackingNumber) : null;
  const carrier = order?.carrierCode
    ? { code: order.carrierCode, name: order.carrierName ?? order.carrierCode }
    : byFormat?.carrier ?? null;

  const emailEvents: TimelineEvent[] = (order?.events ?? []).map((e) => ({
    status: e.status,
    label: e.status ? STATUS_LABELS[e.status] : e.description,
    at: e.occurredAt.toISOString(),
    description: e.description,
    location: e.location,
    source: (SOURCES.has(e.source) ? e.source : "EMAIL") as TimelineSource,
  }));
  const carrierEvents: TimelineEvent[] = (live?.events ?? []).map((e) => ({
    status: e.status,
    label: e.status ? STATUS_LABELS[e.status] : e.description,
    at: e.at,
    description: e.description,
    location: e.location,
    source: "CARRIER",
  }));

  // Live scans can move the status forward (e.g. SHIPPED → OUT_FOR_DELIVERY).
  const baseStatus = order?.status ?? null;
  const currentStatus =
    live?.status && (!baseStatus || shouldReplaceStatus(live.status, baseStatus)) ? live.status : baseStatus;

  return {
    query,
    match,
    order: order?.dto ?? null,
    currentStatus,
    shipment: {
      trackingNumber,
      carrier,
      possibleCarriers: carrier ? [] : byFormat?.possibleCarriers ?? [],
      trackingUrl: order?.trackingUrl ?? trackingUrlFor(carrier?.code ?? null, trackingNumber) ?? byFormat?.trackingUrl ?? null,
    },
    timeline: [...emailEvents, ...carrierEvents].sort((a, b) => b.at.localeCompare(a.at)),
    live: live
      ? { available: true, provider: live.provider, reason: null }
      : { available: false, provider: null, reason: NOT_CONFIGURED },
  };
};
