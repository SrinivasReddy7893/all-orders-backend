import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { identifyTrackingId, detectShipment, normalizeTrackingQuery } from "./carriers";

const codes = (list: { code: string }[]) => list.map((c) => c.code);

describe("identifyTrackingId — certain formats", () => {
  test("India Post (UPU S10 ending in IN)", () => {
    assert.equal(identifyTrackingId("EE123456789IN").carrier?.code, "INDIA_POST");
  });

  test("UPS 1Z…", () => {
    assert.equal(identifyTrackingId("1Z999AA10123456784").carrier?.code, "UPS");
  });

  test("USPS 22-digit number starting 9", () => {
    assert.equal(identifyTrackingId("9400111899223197428490").carrier?.code, "USPS");
  });

  test("Amazon Logistics TBA…", () => {
    assert.equal(identifyTrackingId("TBA123456789012").carrier?.code, "AMAZON");
  });

  test("Ekart FMPC…", () => {
    assert.equal(identifyTrackingId("FMPC1234567890").carrier?.code, "EKART");
  });

  test("Shadowfax SF…", () => {
    assert.equal(identifyTrackingId("SF123456789FPL").carrier?.code, "SHADOWFAX");
  });

  test("certain formats come with a tracking link", () => {
    assert.equal(identifyTrackingId("1Z999AA10123456784").trackingUrl, "https://www.ups.com/track?tracknum=1Z999AA10123456784");
  });
});

describe("identifyTrackingId — international postal IDs (UPU S10) go to the right national post", () => {
  test("…GB → Royal Mail", () => {
    assert.equal(identifyTrackingId("RR123456785GB").carrier?.code, "ROYAL_MAIL");
  });

  test("…CN → China Post", () => {
    assert.equal(identifyTrackingId("LX123456785CN").carrier?.code, "CHINA_POST");
  });

  test("any other country → a generic national post", () => {
    assert.equal(identifyTrackingId("RR123456785DE").carrier?.code, "POSTAL");
  });
});

describe("identifyTrackingId — ambiguous numeric AWBs", () => {
  test("13 digits is not certain, but Delhivery is a candidate", () => {
    const result = identifyTrackingId("5001228085443");
    assert.equal(result.carrier, null);
    assert.ok(codes(result.possibleCarriers).includes("DELHIVERY"));
  });

  test("11 digits suggests Blue Dart", () => {
    assert.ok(codes(identifyTrackingId("12345678901").possibleCarriers).includes("BLUEDART"));
  });

  test("12 digits suggests FedEx", () => {
    assert.ok(codes(identifyTrackingId("123456789012").possibleCarriers).includes("FEDEX"));
  });

  test("random words match nothing", () => {
    const result = identifyTrackingId("HELLO");
    assert.equal(result.carrier, null);
    assert.deepEqual(result.possibleCarriers, []);
  });
});

describe("detectShipment — from a shipping email", () => {
  test("GoKwik KwikShip link with the AWB in it (Bombay Shaving)", () => {
    const shipment = detectShipment("Your shipment is on the way", ["https://api.gokwik.co/kwikship/track/5001228085443"], "5001228085443");
    assert.equal(shipment.carrier?.code, "KWIKSHIP");
    assert.equal(shipment.trackingUrl, "https://api.gokwik.co/kwikship/track/5001228085443");
  });

  test("Shiprocket email: personalised redirect links are not stored, public page is built from the AWB", () => {
    const shipment = detectShipment(
      "Your boAt order is arriving earlier than expected. Shipped via Shiprocket.",
      ["https://delivery.net.shiprocket.in/AKKJYULOJHW?id=55239=dEUFAg0EBlUAGgVTAlRW"],
      "1332150816"
    );
    assert.equal(shipment.carrier?.code, "SHIPROCKET");
    assert.equal(shipment.trackingUrl, "https://shiprocket.co/tracking/1332150816");
  });

  test("courier named in the text (Blue Dart)", () => {
    const shipment = detectShipment("Your package has been handed over to Blue Dart. AWB No: 12345678901", [], "12345678901");
    assert.equal(shipment.carrier?.code, "BLUEDART");
  });

  test("US courier named in the text (FedEx)", () => {
    assert.equal(detectShipment("Your order shipped with FedEx", [], "123456789012").carrier?.code, "FEDEX");
  });

  test("regional Indian courier named in the text (Trackon)", () => {
    assert.equal(detectShipment("Your parcel has been booked with Trackon Couriers", [], null).carrier?.code, "TRACKON");
  });

  test("international courier named in the text (Aramex)", () => {
    assert.equal(detectShipment("Shipped internationally via Aramex", [], null).carrier?.code, "ARAMEX");
  });

  test("US regional courier from its link domain (Veho)", () => {
    assert.equal(detectShipment("Your package is on its way", ["https://track.shipveho.com/abc"], null).carrier?.code, "VEHO");
  });

  test("no courier info at all", () => {
    assert.deepEqual(detectShipment("Your order is on its way.", [], null), { carrier: null, trackingUrl: null });
  });
});

describe("normalizeTrackingQuery", () => {
  test("trims, uppercases and drops spaces and a leading #", () => {
    assert.equal(normalizeTrackingQuery("  #d&d 1015 "), "D&D1015");
  });
});
