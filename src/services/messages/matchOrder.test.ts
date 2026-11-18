import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { chooseTargetOrder, CandidateOrder } from "./matchOrder";

const parsed = (o: Partial<Parameters<typeof chooseTargetOrder>[0]>) => ({
  vendor: "AMAZON", status: "SHIPPED" as const, orderId: null, trackingNumber: null,
  carrier: null, amount: null, currency: null, text: "", ...o,
});
const order = (o: Partial<CandidateOrder>): CandidateOrder => ({
  id: "o", vendor: "AMAZON", externalOrderId: null, trackingNumber: null, status: "CONFIRMED",
  lastActivityAt: new Date("2026-11-18T09:00:00Z"), ...o,
});
const at = new Date("2026-11-18T10:00:00Z");

describe("chooseTargetOrder", () => {
  test("same shop + order ID", () => {
    const target = chooseTargetOrder(parsed({ orderId: "402-1234567-8901234" }), at, [
      order({ id: "a", externalOrderId: "111-1111111-1111111" }),
      order({ id: "b", externalOrderId: "402-1234567-8901234" }),
    ]);
    assert.equal(target?.id, "b");
  });

  test("courier SMS with only an AWB → the order with that tracking number", () => {
    const target = chooseTargetOrder(parsed({ vendor: "UNKNOWN", trackingNumber: "1234567890123" }), at, [
      order({ id: "a", vendor: "BOAT", trackingNumber: "1234567890123" }),
    ]);
    assert.equal(target?.id, "a");
  });

  test("quick commerce without an ID → that app's active order from the last 3 hours", () => {
    const target = chooseTargetOrder(parsed({ vendor: "ZOMATO", status: "OUT_FOR_DELIVERY" }), at, [
      order({ id: "old", vendor: "ZOMATO", status: "DELIVERED", lastActivityAt: new Date("2026-11-18T09:30:00Z") }),
      order({ id: "live", vendor: "ZOMATO", status: "CONFIRMED", lastActivityAt: new Date("2026-11-18T09:40:00Z") }),
    ]);
    assert.equal(target?.id, "live");
  });

  test("quick commerce: an order from yesterday is not today's order", () => {
    const target = chooseTargetOrder(parsed({ vendor: "ZOMATO", status: "CONFIRMED" }), at, [
      order({ id: "y", vendor: "ZOMATO", status: "CONFIRMED", lastActivityAt: new Date("2026-11-17T20:00:00Z") }),
    ]);
    assert.equal(target, null);
  });

  test("another shop's order with the same number is not matched", () => {
    const target = chooseTargetOrder(parsed({ vendor: "FLIPKART", orderId: "1004" }), at, [
      order({ id: "a", vendor: "SHOPIFY_D2C", externalOrderId: "1004" }),
    ]);
    assert.equal(target, null);
  });

  test("non-quick-commerce message with no ID or AWB is not guessed onto an order", () => {
    const target = chooseTargetOrder(parsed({ vendor: "AMAZON" }), at, [order({ id: "a", status: "SHIPPED" })]);
    assert.equal(target, null);
  });
});
