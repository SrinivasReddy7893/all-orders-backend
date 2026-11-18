/**
 * Source-agnostic order parsing: vendor, status, order ID, order-signal gate,
 * dedup fingerprint and lifecycle merge. Pure functions only (no Gmail, no DB),
 * so email today — and SMS / app notifications later — can share it.
 */

import type { OrderStatus } from "../../generated/prisma/enums";

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export const STATUS_WEIGHT: Record<OrderStatus, number> = {
  PLACED: 0,
  CONFIRMED: 1,
  PROCESSING: 2,
  SHIPPED: 3,
  OUT_FOR_DELIVERY: 4,
  DELIVERED: 5,
  CANCELLED: -1,
  RETURNED: -2,
  REFUNDED: -3,
};

export type OrderEmail = {
  id: string;
  orderId: string | null;
  fingerprint: string;
  subject: string;
  snippet: string;
  date: string;
  status: OrderStatus;
  vendor: string; // known key (e.g. "AMAZON") or the sender's brand domain (e.g. "DUKEANDDOR")
  from: string;
  trackingNumber: string | null;
  title: string | null;
  titles: string[];
  amount: number | null;   // order total stated in the email
  currency: string | null;
  carrier: { code: string; name: string } | null; // courier / shipping aggregator
  trackingUrl: string | null;
  orderedAt?: string;      // set by mergeOrders: date of the order's first email
  events?: OrderEvent[];   // set by mergeOrders: one per email, oldest first
};

export type OrderEvent = {
  status: OrderStatus;
  at: string;          // ISO date of the email
  description: string; // the email's subject
  sourceRef: string;   // Gmail message ID (dedup key when saving)
};

// ─────────────────────────────────────────────
// STEP 2 — VENDOR DETECTION
// ─────────────────────────────────────────────

type VendorRule = { vendor: string; fromPatterns: RegExp[]; subjectPatterns?: RegExp[] };

const VENDOR_RULES: VendorRule[] = [
  { vendor: "AMAZON",         fromPatterns: [/amazon\.(in|com)/i],  subjectPatterns: [/\bamazon\b/i] },
  { vendor: "FLIPKART",       fromPatterns: [/flipkart\.com/i] },
  { vendor: "MYNTRA",         fromPatterns: [/myntra\.com/i] },
  { vendor: "MEESHO",         fromPatterns: [/meesho\.com/i] },
  { vendor: "AJIO",           fromPatterns: [/ajio\.com/i],         subjectPatterns: [/\bajio\b/i] },
  { vendor: "NYKAA",          fromPatterns: [/nykaa\.com/i],        subjectPatterns: [/\bnykaa\b/i] },
  { vendor: "TATA_CLIQ",      fromPatterns: [/tatacliq\.com/i],     subjectPatterns: [/tata\s*cliq/i] },
  { vendor: "SNAPDEAL",       fromPatterns: [/snapdeal\.com/i] },
  { vendor: "JIOMART",        fromPatterns: [/jiomart\.com/i],      subjectPatterns: [/jiomart/i] },
  { vendor: "ZARA",           fromPatterns: [/zara\.com/i],         subjectPatterns: [/\bzara\b/i] },
  { vendor: "HM",             fromPatterns: [/\bhm\.com/i],         subjectPatterns: [/\bh&m\b|\bh and m\b/i] },
  { vendor: "APPLE",          fromPatterns: [/[@.]apple\.com/i] },
  // boAt emails come from its parent company's domain or via Shiprocket.
  { vendor: "BOAT",           fromPatterns: [/boat-lifestyle\.com/i, /imaginemarketingindia\.com/i], subjectPatterns: [/\bboAt\b/] },
  { vendor: "BOMBAY_SHAVING", fromPatterns: [/bombayshavingcompany\.com/i], subjectPatterns: [/bombay\s*shaving/i] },
  { vendor: "SHOPIFY_D2C",    fromPatterns: [/shopify(email)?\.com/i, /myshopify\.com/i] },
  // Quick commerce / food — mostly push notifications today, but they email receipts too.
  { vendor: "ZOMATO",         fromPatterns: [/zomato\.com/i] },
  { vendor: "SWIGGY",         fromPatterns: [/swiggy\.(in|com)/i] },
  { vendor: "ZEPTO",          fromPatterns: [/zepto(now)?\.com/i] },
  { vendor: "BLINKIT",        fromPatterns: [/blinkit\.com/i, /grofers\.com/i] },
  { vendor: "BIGBASKET",      fromPatterns: [/bigbasket\.com/i] },
];

// Couriers and mail platforms send on behalf of a store, so their domain is
// not the vendor.
const NON_VENDOR_DOMAINS = /shiprocket|delhivery|bluedart|xpressbees|ekart|shadowfax|dtdc|ecomexpress|klaviyo|sendgrid|mailchimp|gmail|outlook|yahoo/i;

const vendorFromSender = (from: string): string => {
  const domain = from.match(/@([\w.-]+)/)?.[1]?.toLowerCase();
  if (!domain || NON_VENDOR_DOMAINS.test(domain)) return "UNKNOWN";
  // "orders.dukeanddor.com" → "dukeanddor", "mail.brand.co.in" → "brand"
  const labels = domain.split(".").filter((l) => !["com", "in", "co", "net", "org", "io", "store", "shop"].includes(l));
  const brand = labels[labels.length - 1];
  return brand ? brand.replace(/[^a-z0-9]/g, "").toUpperCase() : "UNKNOWN";
};

export const detectVendor = (from: string, subject: string): string => {
  for (const rule of VENDOR_RULES) {
    if (rule.fromPatterns.some((p) => p.test(from)) || rule.subjectPatterns?.some((p) => p.test(subject))) {
      return rule.vendor;
    }
  }
  return vendorFromSender(from);
};

// ─────────────────────────────────────────────
// STEP 3 — ORDER STATUS DETECTION
// ─────────────────────────────────────────────
// Rules are checked in order; the first match wins.

type StatusRule = { status: OrderStatus; patterns: RegExp[] };

const STATUS_RULES: StatusRule[] = [
  { status: "CANCELLED",        patterns: [/\bcancell?ed\b/i, /\bcancell?ation\b/i] },
  { status: "REFUNDED",         patterns: [/\brefund\s+(initiated|credited|processed|successful|issued)/i, /\brefunded\b/i] },
  { status: "RETURNED",         patterns: [/\breturn\s+(initiated|confirmed|picked|completed|received)/i, /\breturned\b/i] },
  { status: "OUT_FOR_DELIVERY", patterns: [/out\s+for\s+delivery/i, /\b(arriving|delivered|delivery)\s+today\b/i] },
  // "will be delivered" / "to be delivered" are promises, not deliveries.
  { status: "DELIVERED",        patterns: [/(?<!(will|to|should)\s+be\s+)\bdelivered\b/i, /\bdelivery\s+successful\b/i] },
  { status: "SHIPPED",          patterns: [/\bshipped\b/i, /\bdispatched\b/i, /\bin\s+transit\b/i, /\bon\s+(its|the)\s+way\b/i, /\barriving\b/i, /\bshipment\s+from\s+order\b/i] },
  { status: "PROCESSING",       patterns: [/\bbeing\s+processed\b/i, /\bprocessing\s+(your\s+)?order\b/i, /\bpreparing\s+(your\s+)?order\b/i, /\bready\s+to\s+ship\b/i] },
  { status: "CONFIRMED",        patterns: [/\bconfirmed\b/i, /\border\s+(accepted|received)\b/i, /thank\s+you\s+for\s+(your\s+|placing\s+your\s+)?order/i, /\breceived\s+your\s+order\b/i] },
  { status: "PLACED",           patterns: [/\border\s+placed\b/i, /\bordered\b/i, /\bnew\s+order\b/i] },
];

const matchStatus = (text: string): OrderStatus | null =>
  STATUS_RULES.find((rule) => rule.patterns.some((p) => p.test(text)))?.status ?? null;

// The subject states what this email is about; the snippet often mentions
// future steps ("will be delivered by…"), so it is only a fallback.
export const detectStatus = (subject: string, snippet: string): OrderStatus =>
  matchStatus(subject) ?? matchStatus(snippet) ?? "PLACED";

// ─────────────────────────────────────────────
// STEP 4 — ORDER ID EXTRACTION
// ─────────────────────────────────────────────

const ID = String.raw`([A-Z0-9][A-Z0-9&\-]{3,23})`;

type IdPattern = { pattern: RegExp; vendors?: string[] };

const ID_PATTERNS: IdPattern[] = [
  { pattern: /\b(\d{3}-\d{7}-\d{7})\b/,  vendors: ["AMAZON"] },   // 402-1234567-8901234
  { pattern: /\b(OD\d{15,21})\b/i,       vendors: ["FLIPKART"] },
  { pattern: /\b(NYK[-\s]?\w{6,12})\b/i, vendors: ["NYKAA"] },
  { pattern: /\b(W\d{9,11})\b/,          vendors: ["APPLE"] },    // W1496916848
  { pattern: /\b(BSC[A-Z0-9]{6,16})\b/i },
  { pattern: new RegExp(String.raw`shipment\s+from\s+order\s+#?\s*${ID}`, "gi") },
  // "Order Number: #9652151", "Order ID\nD&D1015", "order no. 123456"
  { pattern: new RegExp(String.raw`\border\s+(?:number|no\.?|id)\s*[:#]?\s*#?\s*${ID}`, "gi") },
  { pattern: new RegExp(String.raw`\border\s*#\s*${ID}`, "gi") },
  // "processing your order W1496916848"
  { pattern: new RegExp(String.raw`\border\s+${ID}`, "gi") },
  { pattern: new RegExp(String.raw`\[(?:order\s+)?#?${ID}\]`, "gi") },
];

// Real order IDs always contain a digit; this rejects words like "confirmed".
const isPlausibleId = (id: string) => /\d/.test(id);

export const extractOrderId = (text: string, vendor: string): string | null => {
  for (const rule of ID_PATTERNS) {
    if (rule.vendors && !rule.vendors.includes(vendor)) continue;
    const matches = rule.pattern.global ? [...text.matchAll(rule.pattern)] : [text.match(rule.pattern)];
    for (const match of matches) {
      const id = match?.[1]?.replace(/[&-]+$/, "").toUpperCase();
      if (id && isPlausibleId(id)) return id;
    }
  }
  return null;
};

// ─────────────────────────────────────────────
// STEP 5 — ORDER-SIGNAL GATE
// ─────────────────────────────────────────────

const POSITIVE_SIGNALS = [
  /\border\s*(?:id\b|no\b|number\b|#)/i, // not "order now"
  /\border\s+(confirmed|placed|received|dispatched|shipped|delivered|canceled|cancelled)/i,
  /\b(your|the)\s+(\w+\s+)?order\b/i,      // "your order", "your boAt order"
  /\bshipment\b/i,
  /\btracking\s+(id|number|link)\b/i,
  /\bawb\b/i,
  /\bestimated\s+delivery\b/i,
  /out\s+for\s+delivery/i,
  /\byour\s+(package|items?)\b/i,
  /\bordered\b/i,
];

const NEGATIVE_SIGNALS = [
  /\bsale\s+(ends|today|tonight)\b/i,
  /\bup\s+to\s+\d+%\s+off\b/i,
  /\bflash\s+sale\b/i,
  /\bbig\s+billion\b/i,
  /\bgreat\s+indian\s+(sale|festival)\b/i,
  /\brefer\s+(and|a)\s+friend\b/i,
  /\bearn\s+(coins|points|rewards)\b/i,
  /\bwishlist\b/i,
  /\bbrowsing\s+history\b/i,
  /\brecommended\s+for\s+you\b/i,
  /monthly\s+(subscription|plan)/i,
];

// Any one of these means it is not an order update.
const HARD_REJECT = [
  /\b(complete|finish)\s+your\s+(order|purchase|checkout)\b/i,
  /\bleft\s+(something|items?)\s+(behind|in\s+your\s+cart)\b/i,
  /\bitems?\s+in\s+your\s+cart\b/i,
];

const FORWARD_OR_REPLY = /^\s*(fwd?|re)\s*:/i;

export const isOrderEmail = (subject: string, snippet: string): boolean => {
  if (FORWARD_OR_REPLY.test(subject)) return false; // the original email is in the mailbox too
  const combined = `${subject} ${snippet}`;
  if (HARD_REJECT.some((p) => p.test(combined))) return false;
  if (!POSITIVE_SIGNALS.some((p) => p.test(combined))) return false;
  return NEGATIVE_SIGNALS.filter((p) => p.test(combined)).length < 2;
};

// ─────────────────────────────────────────────
// STEP 6 — FINGERPRINT (STABLE DEDUP KEY)
// ─────────────────────────────────────────────
// Priority: vendor + order ID → vendor + known order token → verb-neutral
// subject, so "…is on the way" and "…has been delivered" collapse together.

const ORDER_TOKEN_RE =
  /\b(BSC[A-Z0-9]{4,16}|OD\d{8,18}|NYK[-\w]{4,12}|\d{3}-\d{7}-\d{7}|FN[A-Z0-9]{6,14}|AJO[A-Z0-9]{4,14})\b/i;

const LIFECYCLE_NOISE_RE =
  /\b(a\s+shipment\s+from|shipment\s+from|has\s+been|is\s+on\s+the|will\s+be|have\s+been|has|been|is|are|was|were|the|your|from)\b/gi;

const STATUS_WORDS_RE =
  /\b(delivered|shipped|dispatched|on\s+(the|its)\s+way|out\s+for\s+delivery|confirmed|placed|processing|cancell?ed|returned|refunded|arriving)\b/gi;

export const buildFingerprint = (
  vendor: string,
  subject: string,
  snippet: string,
  orderId: string | null,
  date: string
): string => {
  if (orderId) return `${vendor}::${orderId}`;

  const tokenMatch = `${subject} ${snippet}`.match(ORDER_TOKEN_RE);
  if (tokenMatch?.[1]) return `${vendor}::${tokenMatch[1].toUpperCase()}`;

  const strippedSubject = subject
    .replace(LIFECYCLE_NOISE_RE, " ")
    .replace(STATUS_WORDS_RE, " ")
    .replace(/[^a-z0-9\s]/gi, " ")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 60);

  return `${vendor}::${strippedSubject}::${date.slice(0, 7)}`;
};

// ─────────────────────────────────────────────
// STEP 7 — LIFECYCLE MERGE
// ─────────────────────────────────────────────

const AFTER_DELIVERY: OrderStatus[] = ["RETURNED", "REFUNDED"];

// Whether a newer update (`incoming`) should replace the order's current status.
// Used both when merging emails and when updating a saved order.
export const shouldReplaceStatus = (incoming: OrderStatus, current: OrderStatus): boolean => {
  // Returns/refunds happen after delivery, so they always apply.
  if (AFTER_DELIVERY.includes(incoming)) return true;
  // A cancellation applies until the order ships; a stray one can't undo a delivery.
  if (incoming === "CANCELLED") return STATUS_WEIGHT[current] < STATUS_WEIGHT.SHIPPED;
  // Once cancelled/returned/refunded, normal progress updates don't revive it.
  if (STATUS_WEIGHT[current] < 0) return false;
  // Forward progress (or a repeat of the same step) wins.
  return STATUS_WEIGHT[incoming] >= STATUS_WEIGHT[current];
};

const toEvent = (email: OrderEmail): OrderEvent => ({
  status: email.status,
  at: email.date,
  description: email.subject,
  sourceRef: email.id,
});

// Fold a newer email into an order. Identity (order ID, shop, key) always
// stays the order's own, even when an un-numbered courier email is folded in.
const combine = (existing: OrderEmail, email: OrderEmail): OrderEmail => {
  const [primary, other] = shouldReplaceStatus(email.status, existing.status)
    ? [email, existing]
    : [existing, email];
  return {
    ...primary,
    orderId: existing.orderId,
    fingerprint: existing.fingerprint,
    vendor: existing.vendor,
    trackingNumber: primary.trackingNumber ?? other.trackingNumber,
    carrier: primary.carrier ?? other.carrier,
    trackingUrl: primary.trackingUrl ?? other.trackingUrl,
    titles: primary.titles.length ? primary.titles : other.titles,
    title: primary.title ?? other.title,
    // Total and order date come from the earliest emails (the confirmation);
    // later shipment emails may show only part of the order.
    amount: existing.amount ?? email.amount,
    currency: existing.amount != null ? existing.currency : email.currency,
    orderedAt: existing.orderedAt,
    events: [...(existing.events ?? []), ...(email.events ?? [toEvent(email)])],
  };
};

const ATTACH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const titleWords = (o: OrderEmail) =>
  new Set(o.titles.join(" ").toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);

// A courier email with no order number (e.g. "your boAt order is arriving
// early", sent by Shiprocket) belongs to the same shop's order placed shortly
// before it, if they share a product word.
const findOrderFor = (orphan: OrderEmail, orders: OrderEmail[]): OrderEmail | undefined => {
  const words = titleWords(orphan);
  return orders
    .filter((o) => o.orderId && o.vendor === orphan.vendor)
    .filter((o) => {
      const gap = Date.parse(orphan.date) - Date.parse(o.orderedAt ?? o.date);
      return gap >= 0 && gap <= ATTACH_WINDOW_MS;
    })
    .filter((o) => [...titleWords(o)].some((w) => words.has(w)))
    .sort((a, b) => Date.parse(b.orderedAt ?? b.date) - Date.parse(a.orderedAt ?? a.date))[0];
};

export const mergeOrders = (emails: OrderEmail[]): OrderEmail[] => {
  const orderMap = new Map<string, OrderEmail>();

  // Oldest first, so later emails fill in details the earlier ones lacked.
  for (const email of [...emails].sort((a, b) => a.date.localeCompare(b.date))) {
    // Fingerprint includes the vendor: two shops can both have an order "#1004".
    const key = email.fingerprint;
    const existing = orderMap.get(key);
    orderMap.set(key, existing ? combine(existing, email) : { ...email, orderedAt: email.date, events: [toEvent(email)] });
  }

  // Attach un-numbered courier updates to their order where we can.
  const merged = [...orderMap.values()];
  const numbered = merged.filter((o) => o.orderId);
  const result = new Map(numbered.map((o) => [o.fingerprint, o]));
  for (const orphan of merged.filter((o) => !o.orderId)) {
    const target = findOrderFor(orphan, [...result.values()]);
    if (target) result.set(target.fingerprint, combine(target, orphan));
    else result.set(orphan.fingerprint, orphan);
  }

  return [...result.values()];
};
