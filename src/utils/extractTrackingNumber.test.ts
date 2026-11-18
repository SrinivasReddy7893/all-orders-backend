import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { extractTrackingNumber } from "./extractTrackingNumber";

describe("extractTrackingNumber", () => {
  test("'AWB No.' label (Shiprocket)", () => {
    assert.equal(extractTrackingNumber("Courier: ElasticRun\nAWB No. 1332150816\nTrack Your Order"), "1332150816");
  });

  test("'Tracking No:' with a letter prefix (Ekart)", () => {
    assert.equal(extractTrackingNumber("Tracking No: FMPC1234567890"), "FMPC1234567890");
  });

  test("'Tracking ID -' label", () => {
    assert.equal(extractTrackingNumber("Tracking ID - 5001228085443"), "5001228085443");
  });

  test("'Consignment number' and 'Waybill' labels", () => {
    assert.equal(extractTrackingNumber("Consignment number: D12345678"), "D12345678");
    assert.equal(extractTrackingNumber("Waybill 1234567890123"), "1234567890123");
  });

  test("a word after 'tracking' is never taken as the number", () => {
    assert.equal(extractTrackingNumber("Tracking information will be shared once your order ships."), null);
  });

  test("a phone number next to a courier name is not a tracking number", () => {
    assert.equal(extractTrackingNumber("Delhivery customer care: 1244200000"), null);
  });
});
