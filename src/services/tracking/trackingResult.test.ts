import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildTrackingResult, TrackedOrder } from "./trackingResult";

const bombayShaving: TrackedOrder = {
  dto: { id: "o1", orderId: "BSC2002300305", title: "Power Play Nxt Beard Trimmer" },
  externalOrderId: "BSC2002300305",
  status: "DELIVERED",
  trackingNumber: "5001228085443",
  carrierCode: "KWIKSHIP",
  carrierName: "KwikShip (GoKwik)",
  trackingUrl: "https://api.gokwik.co/kwikship/track/5001228085443",
  events: [
    { status: "SHIPPED", occurredAt: new Date("2025-10-05T10:00:00Z"), description: "A shipment from order BSC2002300305 is on the way", location: null, source: "EMAIL" },
    { status: "DELIVERED", occurredAt: new Date("2025-10-07T11:49:09Z"), description: "A shipment from order BSC2002300305 has been delivered", location: null, source: "EMAIL" },
  ],
};

describe("buildTrackingResult", () => {
  test("typed an order number → that order, its courier and timeline (newest first)", () => {
    const result = buildTrackingResult("BSC2002300305", bombayShaving, null);
    assert.equal(result.match, "ORDER_ID");
    assert.equal(result.currentStatus, "DELIVERED");
    assert.deepEqual(result.shipment, {
      trackingNumber: "5001228085443",
      carrier: { code: "KWIKSHIP", name: "KwikShip (GoKwik)" },
      possibleCarriers: [],
      trackingUrl: "https://api.gokwik.co/kwikship/track/5001228085443",
    });
    assert.deepEqual(result.timeline.map((e) => e.label), ["Delivered", "Shipped"]);
    assert.equal(result.order?.id, "o1");
  });

  test("typed the tracking number → same order", () => {
    assert.equal(buildTrackingResult("5001228085443", bombayShaving, null).match, "TRACKING_NUMBER");
  });

  test("an AWB we have never seen → courier recognised from its format, no order", () => {
    const result = buildTrackingResult("EE123456789IN", null, null);
    assert.equal(result.match, "NONE");
    assert.equal(result.order, null);
    assert.equal(result.shipment.trackingNumber, "EE123456789IN");
    assert.equal(result.shipment.carrier?.code, "INDIA_POST");
    assert.deepEqual(result.timeline, []);
  });

  test("an ambiguous AWB we have never seen → candidate couriers", () => {
    const result = buildTrackingResult("12345678901", null, null);
    assert.equal(result.shipment.carrier, null);
    assert.ok(result.shipment.possibleCarriers.some((c) => c.code === "BLUEDART"));
  });

  test("text that is not an order or tracking number → empty result, same shape", () => {
    const result = buildTrackingResult("HELLO", null, null);
    assert.equal(result.match, "NONE");
    assert.equal(result.shipment.trackingNumber, null);
    assert.equal(result.currentStatus, null);
  });

  test("timeline keeps where each step came from (SMS / app notification)", () => {
    const fromPhone: TrackedOrder = {
      ...bombayShaving,
      events: [{ status: "OUT_FOR_DELIVERY", occurredAt: new Date("2025-10-07T04:00:00Z"), description: "Out for delivery today", location: null, source: "SMS" }],
    };
    assert.equal(buildTrackingResult("BSC2002300305", fromPhone, null).timeline[0].source, "SMS");
  });

  test("without a live provider the response says so", () => {
    assert.deepEqual(buildTrackingResult("BSC2002300305", bombayShaving, null).live, {
      available: false,
      provider: null,
      reason: "Live courier tracking is not configured yet; showing updates from order emails, SMS and app notifications.",
    });
  });

  test("live courier scans are merged into the timeline and can move the status forward", () => {
    const shipped: TrackedOrder = { ...bombayShaving, status: "SHIPPED", events: [bombayShaving.events[0]] };
    const result = buildTrackingResult("BSC2002300305", shipped, {
      provider: "TestProvider",
      status: "OUT_FOR_DELIVERY",
      events: [{ status: "OUT_FOR_DELIVERY", at: "2025-10-07T04:00:00Z", description: "Out for delivery", location: "Hyderabad Hub" }],
    });
    assert.equal(result.currentStatus, "OUT_FOR_DELIVERY");
    assert.equal(result.timeline[0].source, "CARRIER");
    assert.equal(result.timeline[0].location, "Hyderabad Hub");
    assert.deepEqual(result.live, { available: true, provider: "TestProvider", reason: null });
  });
});
