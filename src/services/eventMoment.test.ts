import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DATABASE_URL ??= "postgresql://x:x@localhost:5432/x";
import { eventMoment } from "./order.service";

// 20 Nov 2026, 15:00 India time.
const now = new Date("2026-11-20T09:30:00Z");
const placed = new Date("2026-11-10T05:00:00Z");

describe("eventMoment", () => {
  it("uses the moment of the tap when no day is given", () => {
    assert.equal(eventMoment(undefined, placed, now).getTime(), now.getTime());
  });
  it("puts a past day at noon India time", () => {
    assert.equal(eventMoment("2026-11-15", placed, now).toISOString(), "2026-11-15T06:30:00.000Z");
  });
  it("never lands in the future when today is chosen before noon", () => {
    const morning = new Date("2026-11-20T03:00:00Z"); // 08:30 India time
    assert.equal(eventMoment("2026-11-20", placed, morning).getTime(), morning.getTime());
  });
  it("refuses a day in the future", () => {
    assert.throws(() => eventMoment("2026-11-21", placed, now), { errorCode: "DATE_IN_FUTURE" });
  });
  it("refuses a day before the order was placed", () => {
    assert.throws(() => eventMoment("2026-11-09", placed, now), { errorCode: "DATE_BEFORE_ORDER" });
    assert.doesNotThrow(() => eventMoment("2026-11-10", placed, now));
  });
});
