import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseOrderMessage, vendorFromSender, redactOtp } from "./messageParser";

const sms = (sender: string, body: string) => ({
  id: "m1", source: "SMS" as const, sender, title: null, body, receivedAt: "2026-11-18T10:00:00.000Z",
});
const push = (sender: string, title: string, body: string) => ({
  id: "n1", source: "NOTIFICATION" as const, sender, title, body, receivedAt: "2026-11-18T10:00:00.000Z",
});

describe("vendorFromSender", () => {
  test("Indian SMS sender IDs (XX-NAME, optional -S/-T suffix)", () => {
    assert.equal(vendorFromSender("JD-DLHVRY"), "DELHIVERY");
    assert.equal(vendorFromSender("VM-AMAZON-S"), "AMAZON");
    assert.equal(vendorFromSender("AD-FLPKRT"), "FLIPKART");
    assert.equal(vendorFromSender("BZ-ZOMATO"), "ZOMATO");
  });

  test("Android app packages", () => {
    assert.equal(vendorFromSender("com.application.zomato"), "ZOMATO");
    assert.equal(vendorFromSender("in.swiggy.android"), "SWIGGY");
    assert.equal(vendorFromSender("com.zeptoconsumerapp"), "ZEPTO");
    assert.equal(vendorFromSender("com.grofers.customerapp"), "BLINKIT");
  });

  test("unknown sender", () => {
    assert.equal(vendorFromSender("+919876543210"), "UNKNOWN");
  });
});

describe("parseOrderMessage — couriers", () => {
  test("Delhivery out-for-delivery SMS with AWB and OTP", () => {
    const parsed = parseOrderMessage(sms("JD-DLHVRY", "Your Delhivery shipment with AWB 1234567890123 from Amazon is out for delivery today. Share OTP 4821 with the delivery agent."))!;
    assert.equal(parsed.status, "OUT_FOR_DELIVERY");
    assert.equal(parsed.trackingNumber, "1234567890123");
    assert.equal(parsed.carrier?.code, "DELHIVERY");
    assert.equal(parsed.vendor, "AMAZON"); // the shop named in the text, not the courier
    assert.doesNotMatch(parsed.text, /4821/);
  });

  test("Amazon shipped SMS with order ID", () => {
    const parsed = parseOrderMessage(sms("VM-AMAZON", "Shipped: Your Amazon order #402-1234567-8901234 for boAt Airdopes 141 will be delivered by Fri."))!;
    assert.equal(parsed.vendor, "AMAZON");
    assert.equal(parsed.orderId, "402-1234567-8901234");
    assert.equal(parsed.status, "SHIPPED");
  });
});

describe("parseOrderMessage — quick commerce notifications (usually no order ID)", () => {
  test("Zomato: rider on the way", () => {
    const parsed = parseOrderMessage(push("com.application.zomato", "Your order is on the way 🛵", "Ravi has picked up your order from Paradise Biryani"))!;
    assert.equal(parsed.vendor, "ZOMATO");
    assert.equal(parsed.status, "OUT_FOR_DELIVERY");
    assert.equal(parsed.orderId, null);
  });

  test("Blinkit: arriving in minutes", () => {
    const parsed = parseOrderMessage(push("com.grofers.customerapp", "Arriving in 8 minutes", "Your order is packed and the partner is on the way"))!;
    assert.equal(parsed.status, "OUT_FOR_DELIVERY");
  });

  test("Zepto: delivered", () => {
    assert.equal(parseOrderMessage(push("com.zeptoconsumerapp", "Order delivered", "Enjoy your order! Rate your experience"))!.status, "DELIVERED");
  });

  test("Swiggy: order confirmed with amount", () => {
    const parsed = parseOrderMessage(push("in.swiggy.android", "Order confirmed", "Your order of Rs. 349 from Domino's is confirmed"))!;
    assert.equal(parsed.status, "CONFIRMED");
    assert.equal(parsed.amount, 349);
  });
});

describe("parseOrderMessage — not about an order", () => {
  test("bank OTP SMS is ignored", () => {
    assert.equal(parseOrderMessage(sms("AX-HDFCBK", "OTP 123456 for txn of Rs 500 at AMAZON. Do not share.")), null);
  });

  test("order-looking SMS from a plain phone number is ignored (likely phishing)", () => {
    assert.equal(parseOrderMessage(sms("+919876543210", "Your order has been shipped. Track: bit.ly/xyz")), null);
  });

  test("promotional notification from a shopping app is ignored", () => {
    assert.equal(parseOrderMessage(push("com.application.zomato", "50% OFF tonight!", "Flash sale on biryanis, order now")), null);
  });
});

describe("redactOtp", () => {
  test("masks OTP / PIN codes", () => {
    assert.equal(redactOtp("Share OTP 4821 with the agent. Delivery PIN: 9921"), "Share OTP •••• with the agent. Delivery PIN: ••••");
  });
});
