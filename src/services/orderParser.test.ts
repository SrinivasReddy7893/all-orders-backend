import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  OrderEmail,
  detectStatus,
  detectVendor,
  extractOrderId,
  isOrderEmail,
  mergeOrders,
} from "./orderParser";

// Subjects and senders below are taken from real order emails.

const email = (overrides: Partial<OrderEmail>): OrderEmail => ({
  id: "msg",
  orderId: "D&D1015",
  fingerprint: "DUKEANDDOR::D&D1015",
  subject: "",
  snippet: "",
  date: "2026-02-19T10:00:00.000Z",
  status: "CONFIRMED",
  vendor: "DUKEANDDOR",
  from: "Duke & Dor <orders@dukeanddor.com>",
  trackingNumber: null,
  title: null,
  titles: [],
  amount: null,
  currency: null,
  carrier: null,
  trackingUrl: null,
  ...overrides,
});

describe("mergeOrders", () => {
  test("a cancellation after confirmation marks the order CANCELLED", () => {
    const merged = mergeOrders([
      email({ id: "a", status: "CONFIRMED", date: "2026-02-19T10:00:00.000Z" }),
      email({ id: "b", status: "CANCELLED", date: "2026-02-21T10:00:00.000Z" }),
    ]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].status, "CANCELLED");
  });

  test("a stray cancellation email does not undo a delivered order", () => {
    const merged = mergeOrders([
      email({ id: "a", status: "DELIVERED", date: "2026-02-19T10:00:00.000Z" }),
      email({ id: "b", status: "CANCELLED", date: "2026-02-21T10:00:00.000Z" }),
    ]);
    assert.equal(merged[0].status, "DELIVERED");
  });

  test("a return after delivery marks the order RETURNED", () => {
    const merged = mergeOrders([
      email({ id: "a", status: "DELIVERED", date: "2026-02-19T10:00:00.000Z" }),
      email({ id: "b", status: "RETURNED", date: "2026-02-25T10:00:00.000Z" }),
    ]);
    assert.equal(merged[0].status, "RETURNED");
  });

  test("emails arriving out of order still end at the latest lifecycle step", () => {
    const merged = mergeOrders([
      email({ id: "b", status: "DELIVERED", date: "2025-10-07T12:00:00.000Z" }),
      email({ id: "a", status: "SHIPPED", date: "2025-10-05T12:00:00.000Z" }),
    ]);
    assert.equal(merged[0].status, "DELIVERED");
  });

  test("same order number at two different shops stays two orders", () => {
    const merged = mergeOrders([
      email({ orderId: "1004", fingerprint: "SHOPIFY_D2C::1004", vendor: "SHOPIFY_D2C" }),
      email({ orderId: "1004", fingerprint: "DUKEANDDOR::1004", vendor: "DUKEANDDOR" }),
    ]);
    assert.equal(merged.length, 2);
  });

  test("total comes from the earliest email that states one (the confirmation)", () => {
    const merged = mergeOrders([
      email({ id: "b", status: "SHIPPED", amount: 999, currency: "INR", date: "2026-05-10T10:00:00.000Z" }),
      email({ id: "a", status: "CONFIRMED", amount: 884, currency: "INR", date: "2026-05-08T10:00:00.000Z" }),
    ]);
    assert.equal(merged[0].amount, 884);
    assert.equal(merged[0].currency, "INR");
  });

  test("order date is the first email's date even when a later email wins the status", () => {
    const merged = mergeOrders([
      email({ id: "a", status: "CONFIRMED", date: "2026-05-08T10:00:00.000Z" }),
      email({ id: "b", status: "DELIVERED", date: "2026-05-12T10:00:00.000Z" }),
    ]);
    assert.equal(merged[0].status, "DELIVERED");
    assert.equal(merged[0].orderedAt, "2026-05-08T10:00:00.000Z");
  });

  test("keeps tracking number and titles from an earlier email", () => {
    const merged = mergeOrders([
      email({ id: "a", status: "SHIPPED", trackingNumber: "5001228085443", titles: ["Power Play Nxt Beard Trimmer"], title: "Power Play Nxt Beard Trimmer", date: "2025-10-05T12:00:00.000Z" }),
      email({ id: "b", status: "DELIVERED", date: "2025-10-07T12:00:00.000Z" }),
    ]);
    assert.equal(merged[0].trackingNumber, "5001228085443");
    assert.equal(merged[0].title, "Power Play Nxt Beard Trimmer");
  });
});

describe("mergeOrders — tracking timeline", () => {
  test("keeps one event per email, oldest first", () => {
    const merged = mergeOrders([
      email({ id: "m2", status: "SHIPPED", subject: "Order #D&D1015 is on its way", date: "2026-02-20T10:00:00.000Z" }),
      email({ id: "m1", status: "CONFIRMED", subject: "Order #D&D1015 confirmed", date: "2026-02-19T10:00:00.000Z" }),
    ]);
    assert.deepEqual(merged[0].events, [
      { status: "CONFIRMED", at: "2026-02-19T10:00:00.000Z", description: "Order #D&D1015 confirmed", sourceRef: "m1" },
      { status: "SHIPPED", at: "2026-02-20T10:00:00.000Z", description: "Order #D&D1015 is on its way", sourceRef: "m2" },
    ]);
  });

  test("courier and tracking link survive a later email that has none", () => {
    const merged = mergeOrders([
      email({ id: "a", status: "SHIPPED", carrier: { code: "KWIKSHIP", name: "KwikShip (GoKwik)" }, trackingUrl: "https://api.gokwik.co/kwikship/track/5001228085443", date: "2025-10-05T10:00:00.000Z" }),
      email({ id: "b", status: "DELIVERED", date: "2025-10-07T10:00:00.000Z" }),
    ]);
    assert.equal(merged[0].carrier?.code, "KWIKSHIP");
    assert.equal(merged[0].trackingUrl, "https://api.gokwik.co/kwikship/track/5001228085443");
  });
});

describe("mergeOrders — shipping emails without an order number", () => {
  const confirmation = email({
    id: "conf", vendor: "BOAT", orderId: "9652151", fingerprint: "BOAT::9652151",
    status: "CONFIRMED", titles: ["Airdopes Supreme"], title: "Airdopes Supreme", date: "2026-05-08T10:00:00.000Z",
  });
  const courierUpdate = email({
    id: "ship", vendor: "BOAT", orderId: null, fingerprint: "BOAT::your-boat-order-early::2026-05",
    status: "SHIPPED", titles: ["Airdopes Supreme Classic Black"], title: "Airdopes Supreme Classic Black",
    trackingNumber: "1332150816", carrier: { code: "SHIPROCKET", name: "Shiprocket" }, date: "2026-05-10T10:00:00.000Z",
  });

  test("are attached to the same shop's matching order (boAt via Shiprocket)", () => {
    const merged = mergeOrders([confirmation, courierUpdate]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].orderId, "9652151");
    assert.equal(merged[0].status, "SHIPPED");
    assert.equal(merged[0].trackingNumber, "1332150816");
    assert.equal(merged[0].carrier?.code, "SHIPROCKET");
    assert.equal(merged[0].events?.length, 2);
  });

  test("are not attached to another shop's order", () => {
    const merged = mergeOrders([confirmation, { ...courierUpdate, vendor: "NOISE", fingerprint: "NOISE::x" }]);
    assert.equal(merged.find((o) => o.orderId === "9652151")?.trackingNumber, null);
  });

  test("are not attached when sent before the order or over 30 days later", () => {
    const before = mergeOrders([confirmation, { ...courierUpdate, date: "2026-05-01T10:00:00.000Z" }]);
    const muchLater = mergeOrders([confirmation, { ...courierUpdate, date: "2026-07-01T10:00:00.000Z" }]);
    assert.equal(before.find((o) => o.orderId === "9652151")?.trackingNumber, null);
    assert.equal(muchLater.find((o) => o.orderId === "9652151")?.trackingNumber, null);
  });

  test("are not attached when the products don't match", () => {
    const merged = mergeOrders([confirmation, { ...courierUpdate, titles: ["Stone 350 Speaker"], title: "Stone 350 Speaker" }]);
    assert.equal(merged.find((o) => o.orderId === "9652151")?.trackingNumber, null);
  });
});

describe("detectStatus", () => {
  test("canceled (US spelling) is CANCELLED", () => {
    assert.equal(detectStatus("Order #D&D1015 has been canceled", ""), "CANCELLED");
  });

  test("'processing your order' is PROCESSING", () => {
    assert.equal(detectStatus("We’re processing your order W1496916848", ""), "PROCESSING");
  });

  test("'on its way' is SHIPPED", () => {
    assert.equal(detectStatus("Your order is on its way. W1496916848", ""), "SHIPPED");
  });

  test("subject wins over a snippet that mentions a later step", () => {
    assert.equal(
      detectStatus("Order #9652151 confirmed | Thank you for placing your order!", "We'll email you a tracking link once your order has shipped."),
      "CONFIRMED"
    );
  });

  test("falls back to the snippet when the subject has no status words", () => {
    assert.equal(detectStatus("Koganti, an update on your order", "Your package has been shipped via Delhivery."), "SHIPPED");
  });

  test("'will be delivered today' is OUT_FOR_DELIVERY, not DELIVERED", () => {
    assert.equal(detectStatus("", "Your boAt order is arriving earlier than expected and will be delivered today before 7 pm."), "OUT_FOR_DELIVERY");
  });
});

describe("extractOrderId", () => {
  test("Shopify order numbers containing &", () => {
    assert.equal(extractOrderId("Order #D&D1015 confirmed", "DUKEANDDOR"), "D&D1015");
  });

  test("Apple W-numbers", () => {
    assert.equal(extractOrderId("Your order is on its way. W1496916848", "APPLE"), "W1496916848");
  });

  test("order number on the line after its label (email body)", () => {
    assert.equal(extractOrderId("Thank you for your order!\nOrder Number\n#D&D1015\nORDER TOTAL : Rs. 3,499.00", "DUKEANDDOR"), "D&D1015");
  });

  test("never treats an ordinary word as an order ID", () => {
    assert.equal(extractOrderId("Your order has been confirmed", "UNKNOWN"), null);
    assert.equal(extractOrderId("Order confirmation", "UNKNOWN"), null);
  });
});

describe("detectVendor", () => {
  test("unknown D2C store is named after its domain", () => {
    assert.equal(detectVendor("Duke & Dor <orders@dukeanddor.com>", "Order #D&D1015 confirmed"), "DUKEANDDOR");
  });

  test("courier email for a known brand uses the brand from the subject", () => {
    assert.equal(detectVendor("Shiprocket <noreply@net.shiprocket.in>", "Koganti, your boAt order is arriving early!"), "BOAT");
  });

  test("courier email without a brand is UNKNOWN, not the courier", () => {
    assert.equal(detectVendor("Shiprocket <noreply@net.shiprocket.in>", "Your order is arriving early!"), "UNKNOWN");
  });
});

describe("isOrderEmail", () => {
  test("accepts a real order confirmation", () => {
    assert.equal(isOrderEmail("Order #9652151 confirmed | Thank you for placing your order!", ""), true);
  });

  test("rejects forwarded copies", () => {
    assert.equal(isOrderEmail("Fwd: Order #9999 confirmed", ""), false);
  });

  test("rejects product-update newsletters", () => {
    assert.equal(isOrderEmail("6 product updates we just shipped", "Here is what is new this month"), false);
  });

  test("rejects abandoned-cart reminders", () => {
    assert.equal(isOrderEmail("Complete your order", "You left items in your cart"), false);
  });
});
