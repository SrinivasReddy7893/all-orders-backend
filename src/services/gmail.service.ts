/**
 * Gmail order sync: search the mailbox, parse each message with orderParser,
 * merge emails for the same order.
 */

import { google, gmail_v1 } from "googleapis";
import { extractTrackingNumber } from "../utils/extractTrackingNumber";
import { extractTitles } from "../utils/extractTitle";
import { getEmailAllText, getEmailLinks, getEmailText } from "../utils/emailText";
import { detectShipment } from "./tracking/carriers";
import { extractOrderTotal } from "../utils/extractAmount";
import { getAuthorizedGmailClient } from "./google.service";
import { logger } from "../utils/logger";
import {
  OrderEmail,
  buildFingerprint,
  detectStatus,
  detectVendor,
  extractOrderId,
  isOrderEmail,
  mergeOrders,
} from "./orderParser";

// ─────────────────────────────────────────────
// STEP 1 — GMAIL QUERY
// ─────────────────────────────────────────────
// Search by subject keywords instead of a fixed sender list, so D2C/Shopify
// stores that email from their own domain are found too. Precision comes from
// the signal gate below and from requiring an order ID before saving.

const SUBJECT_KEYWORDS = [
  "order", "ordered", "shipment", "shipped", "dispatched", "delivered",
  "\"out for delivery\"", "arriving", "\"on its way\"", "\"on the way\"",
];

// Payment gateways send "Your order at <merchant> is successful" receipts for
// bills/recharges — those are payments, not shopping orders.
const EXCLUDED_SENDERS = [
  "payu.in", "razorpay.com", "billdesk.com", "ccavenue.com", "cashfree.com",
  "docs.google.com",
];

const EXCLUDED_SUBJECT_WORDS = [
  "newsletter", "subscription", "renew", "membership", "statement", "sale",
  "offer", "discount", "cashback", "promo", "deal", "reminder", "webinar",
];

export const buildGmailQuery = (afterTimestamp: number): string =>
  [
    `(${SUBJECT_KEYWORDS.map((k) => `subject:${k}`).join(" OR ")})`,
    ...EXCLUDED_SENDERS.map((d) => `-from:${d}`),
    ...EXCLUDED_SUBJECT_WORDS.map((w) => `-subject:${w}`),
    "-category:social",
    "-category:forums",
    `after:${afterTimestamp}`,
  ].join(" ");

// ─────────────────────────────────────────────
// PARSE ONE MESSAGE
// ─────────────────────────────────────────────

const parseMessage = (message: gmail_v1.Schema$Message): OrderEmail | null => {
  const headers = message.payload?.headers ?? [];
  const getHeader = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

  const subject = getHeader("Subject");
  const from = getHeader("From");
  const snippet = message.snippet ?? "";

  if (!isOrderEmail(subject, snippet)) return null;

  const body = getEmailText(message.payload);
  const headline = `${subject}\n${snippet}`;

  const vendor = detectVendor(from, subject);
  const status = detectStatus(subject, snippet);
  const orderId = extractOrderId(headline, vendor) ?? extractOrderId(body, vendor);
  const date = new Date(Number(message.internalDate ?? 0)).toISOString();
  const titles = extractTitles(body, subject);
  const total = extractOrderTotal(body);
  const shippingText = `${headline}\n${getEmailAllText(message.payload)}`;
  const trackingNumber = extractTrackingNumber(shippingText);
  const shipment = detectShipment(shippingText, getEmailLinks(message.payload), trackingNumber);

  return {
    id: message.id!,
    orderId,
    fingerprint: buildFingerprint(vendor, subject, snippet, orderId, date),
    subject,
    snippet,
    date,
    status,
    vendor,
    from,
    trackingNumber,
    carrier: shipment.carrier,
    trackingUrl: shipment.trackingUrl,
    title: titles[0] ?? null,
    titles,
    amount: total?.amount ?? null,
    currency: total?.currency ?? null,
  };
};

// ─────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────

const FIRST_SYNC_LOOKBACK_SECONDS = 60 * 60 * 24 * 365 * 5; // 5 years
const INCREMENTAL_OVERLAP_SECONDS = 60 * 60 * 24 * 3;       // re-check last 3 days
const FETCH_CONCURRENCY = 10;

export const fetchOrdersFromGmail = async (
  userId: string,
  options: { maxMessages?: number; fullResync?: boolean } = {}
): Promise<OrderEmail[]> => {
  const { maxMessages = 500, fullResync = false } = options;

  const { client, connectedAccount } = await getAuthorizedGmailClient(userId);
  const gmail = google.gmail({ version: "v1", auth: client });

  const now = Math.floor(Date.now() / 1000);
  const afterTimestamp =
    connectedAccount.lastSyncedAt && !fullResync
      ? Math.floor(connectedAccount.lastSyncedAt.getTime() / 1000) - INCREMENTAL_OVERLAP_SECONDS
      : now - FIRST_SYNC_LOOKBACK_SECONDS;

  // 1. Collect matching message IDs across all result pages.
  const q = buildGmailQuery(afterTimestamp);
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await gmail.users.messages.list({ userId: "me", q, maxResults: 100, pageToken });
    ids.push(...(res.data.messages ?? []).map((m) => m.id!));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken && ids.length < maxMessages);

  // 2. Fetch and parse messages, a few at a time.
  const parsed: OrderEmail[] = [];
  for (let i = 0; i < Math.min(ids.length, maxMessages); i += FETCH_CONCURRENCY) {
    const batch = ids.slice(i, i + FETCH_CONCURRENCY);
    const messages = await Promise.all(
      batch.map((id) => gmail.users.messages.get({ userId: "me", id, format: "full" }))
    );
    for (const { data } of messages) {
      const order = parseMessage(data);
      if (order) parsed.push(order);
    }
  }

  const merged = mergeOrders(parsed).sort((a, b) => b.date.localeCompare(a.date));

  logger.info(
    `Gmail sync for ${connectedAccount.email}: ${ids.length} matched, ${parsed.length} order emails, ${merged.length} orders`
  );

  return merged;
};
