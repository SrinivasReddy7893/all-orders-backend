import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractExpectedDelivery } from "./extractExpectedDelivery";

const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

describe("extractExpectedDelivery", () => {
  it("reads Apple's day/month/year date", () => {
    const sent = new Date("2026-11-04T11:21:00Z");
    assert.equal(day(extractExpectedDelivery("Shipped Delivers 05/11/2026 by Express Shipping", sent)), "2026-11-05");
  });

  it("reads boAt's date and puts it in the right year", () => {
    const sent = new Date("2026-05-10T03:38:00Z");
    assert.equal(day(extractExpectedDelivery("Arriving on Sunday, May 10th Track Your Order", sent)), "2026-05-10");
    // An email sent in late December promising a January date means next year.
    assert.equal(
      day(extractExpectedDelivery("Arriving on Friday, January 2nd", new Date("2026-12-28T10:00:00Z"))),
      "2027-01-02"
    );
  });

  it("rejects dates that cannot be a delivery date", () => {
    const sent = new Date("2026-11-04T11:21:00Z");
    assert.equal(extractExpectedDelivery("Delivers 31/02/2026", sent), null); // no such day
    assert.equal(extractExpectedDelivery("Delivers 05/11/2019", sent), null); // years away from the email
    assert.equal(extractExpectedDelivery("Arriving on Smarch 5th", sent), null);
  });

  it("returns nothing when the email states no date", () => {
    assert.equal(extractExpectedDelivery("Your order is on its way.", new Date()), null);
  });
});
