/**
 * Live courier tracking (scan-by-scan updates) comes from a tracking provider
 * that integrates with 1,000+ couriers and auto-detects the courier
 * (e.g. AfterShip, TrackingMore, Ship24, 17TRACK). Implement this interface
 * for the chosen provider and return it from getLiveProvider().
 *
 * Provider responses are third-party data: implementations must validate
 * them (e.g. with zod) and map them to these types before returning.
 */

import type { OrderStatus } from "../../../generated/prisma/enums";

export type LiveTrackingEvent = {
  status: OrderStatus | null;
  at: string; // ISO date
  description: string;
  location: string | null;
};

export type LiveTrackingResult = {
  provider: string;
  status: OrderStatus | null;
  events: LiveTrackingEvent[];
};

export interface LiveTrackingProvider {
  name: string;
  track(trackingNumber: string, carrierCode: string | null): Promise<LiveTrackingResult | null>;
}

// No provider is configured yet; tracking falls back to order-email updates.
export const getLiveProvider = (): LiveTrackingProvider | null => null;
