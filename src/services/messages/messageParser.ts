/**
 * Order updates from phone SMS and app notifications (sent by the mobile app).
 * Reuses the same rules as order emails (orderParser), plus what is specific
 * to messages: sender IDs / app packages, quick-commerce wording, OTP masking.
 */

import type { OrderStatus } from "../../../generated/prisma/enums";
import { detectStatus, detectVendor, extractOrderId, isOrderEmail } from "../orderParser";
import { detectShipment, Carrier } from "../tracking/carriers";
import { extractTrackingNumber } from "../../utils/extractTrackingNumber";
import { extractOrderTotal } from "../../utils/extractAmount";

export type IncomingMessage = {
  id: string; // stable ID from the phone, used to skip re-sent messages
  source: "SMS" | "NOTIFICATION";
  sender: string; // SMS sender ID ("JD-DLHVRY") or app package ("com.application.zomato")
  title: string | null; // notification title (SMS has none)
  body: string;
  receivedAt: string; // ISO date
};

export type ParsedMessage = {
  vendor: string;
  status: OrderStatus;
  orderId: string | null;
  trackingNumber: string | null;
  carrier: Carrier | null;
  amount: number | null;
  currency: string | null;
  text: string; // OTPs masked, trimmed — stored as the timeline description
};

// Food & grocery apps: "on the way" means the rider is coming to you now.
export const QUICK_COMMERCE = new Set(["ZOMATO", "SWIGGY", "ZEPTO", "BLINKIT", "BIGBASKET", "JIOMART"]);

// Registered Indian SMS sender IDs ("JD-DLHVRY", "VM-AMAZON-S") → shop / courier.
const SMS_SENDERS: Record<string, string> = {
  AMAZON: "AMAZON", AMAZIN: "AMAZON", AMZNIN: "AMAZON",
  FLPKRT: "FLIPKART", FLIPKT: "FLIPKART", FKRTIN: "FLIPKART",
  MYNTRA: "MYNTRA", AJIOIN: "AJIO", AJIO: "AJIO", NYKAA: "NYKAA", MEESHO: "MEESHO",
  ZOMATO: "ZOMATO", SWIGGY: "SWIGGY", SWIGY: "SWIGGY", ZEPTO: "ZEPTO", ZEPTON: "ZEPTO",
  BLINKT: "BLINKIT", BLNKIT: "BLINKIT", GROFRS: "BLINKIT", BGBSKT: "BIGBASKET", JIOMRT: "JIOMART",
  // Couriers
  DLHVRY: "DELHIVERY", BLUDRT: "BLUEDART", BLDART: "BLUEDART", EKARTL: "EKART", EKART: "EKART",
  XPRSBS: "XPRESSBEES", XBEES: "XPRESSBEES", SHDWFX: "SHADOWFAX", ECOMXP: "ECOM_EXPRESS",
  DTDCIN: "DTDC", DTDC: "DTDC", SHPRKT: "SHIPROCKET", INDPST: "INDIA_POST", INPOST: "INDIA_POST",
};

const APP_PACKAGES: Record<string, string> = {
  "com.application.zomato": "ZOMATO",
  "in.swiggy.android": "SWIGGY",
  "com.zeptoconsumerapp": "ZEPTO",
  "com.grofers.customerapp": "BLINKIT",
  "com.bigbasket.mobileapp": "BIGBASKET",
  "com.jpl.jiomart": "JIOMART",
  "in.amazon.mShop.android.shopping": "AMAZON",
  "com.amazon.mShop.android.shopping": "AMAZON",
  "com.flipkart.android": "FLIPKART",
  "com.myntra.android": "MYNTRA",
  "com.ril.ajio": "AJIO",
  "com.fsn.nykaa": "NYKAA",
  "com.meesho.supply": "MEESHO",
};

const COURIERS = new Set(["DELHIVERY", "BLUEDART", "EKART", "XPRESSBEES", "SHADOWFAX", "ECOM_EXPRESS", "DTDC", "SHIPROCKET", "INDIA_POST"]);

const SMS_HEADER = /^[A-Z]{2}-([A-Z0-9]{3,9})(?:-[A-Z])?$/i;

/** Shop or courier behind an SMS sender ID or app package; "UNKNOWN" otherwise. */
export const vendorFromSender = (sender: string): string => {
  const header = sender.trim().match(SMS_HEADER);
  if (header) return SMS_SENDERS[header[1].toUpperCase()] ?? "UNKNOWN";
  return APP_PACKAGES[sender.trim()] ?? "UNKNOWN";
};

/** "Share OTP 4821" → "Share OTP ••••". Delivery OTPs/PINs are never stored. */
export const redactOtp = (text: string) =>
  text.replace(/\b(otp|pin)\b\s*(?:is|:|-)?\s*(\d{4,8})\b/gi, (match, _label, digits: string) =>
    match.slice(0, match.length - digits.length) + "•".repeat(digits.length)
  );

// "order of Rs. 349", "paid ₹1,299", "total: Rs 499"
const MESSAGE_AMOUNT = /\b(?:order|total|amount|paid|bill)\s*(?:of|:)?\s*(₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/i;

export const parseOrderMessage = (message: IncomingMessage): ParsedMessage | null => {
  const title = message.title?.trim() ?? "";
  const body = message.body.trim();
  // An SMS has no title: its first sentence plays the role of an email subject.
  const headline = title || body;
  const text = title ? `${title}\n${body}` : body;

  // Business SMS in India come from registered sender IDs; a plain phone number
  // sending "your order has shipped" is far more likely phishing than a shop.
  if (message.source === "SMS" && !SMS_HEADER.test(message.sender.trim())) return null;
  if (!isOrderEmail(headline, body)) return null;

  const fromSender = vendorFromSender(message.sender);
  const senderIsCourier = COURIERS.has(fromSender);
  // The shop: the sender, unless the sender is a courier — then the shop named in the text.
  const fromText = detectVendor("", text);
  const vendor = !senderIsCourier && fromSender !== "UNKNOWN" ? fromSender : fromText;

  let status = detectStatus(headline, body);
  if (QUICK_COMMERCE.has(vendor) && status === "SHIPPED") status = "OUT_FOR_DELIVERY";
  if (QUICK_COMMERCE.has(vendor) && /\bpicked up\b/i.test(text) && STATUS_RANK[status] < STATUS_RANK.OUT_FOR_DELIVERY) {
    status = "OUT_FOR_DELIVERY";
  }

  const trackingNumber = extractTrackingNumber(text);
  const shipment = detectShipment(text, [], trackingNumber);
  const carrier = shipment.carrier ?? (senderIsCourier ? { code: fromSender, name: fromSender } : null);

  const labelled = extractOrderTotal(text);
  const inline = text.match(MESSAGE_AMOUNT);
  const amount = labelled?.amount ?? (inline ? Number(inline[2].replace(/,/g, "")) : null);

  return {
    vendor,
    status,
    orderId: extractOrderId(text, vendor),
    trackingNumber,
    carrier,
    amount,
    currency: amount == null ? null : labelled?.currency ?? "INR",
    text: redactOtp(text).slice(0, 500),
  };
};

const STATUS_RANK: Record<OrderStatus, number> = {
  PLACED: 0, CONFIRMED: 1, PROCESSING: 2, SHIPPED: 3, OUT_FOR_DELIVERY: 4, DELIVERED: 5,
  CANCELLED: -1, RETURNED: -2, REFUNDED: -3,
};
