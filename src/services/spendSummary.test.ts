import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { monthRange, summarizeSpend } from "./spendSummary";

const CATEGORIES = [
  { key: "APPAREL", label: "Apparel" },
  { key: "FOOD", label: "Food" },
  { key: "GROCERIES", label: "Groceries" },
  { key: "GADGETS", label: "Gadgets" },
  { key: "PERSONAL_CARE", label: "Beauty & Personal Care" },
  { key: "HOME", label: "Home" },
  { key: "OTHER", label: "Other" },
];

const order = (o: { category: string; status: string; amount: number | null; currency?: string | null }) => ({
  currency: "INR",
  ...o,
});

describe("summarizeSpend", () => {
  test("totals spend per category and overall", () => {
    const summary = summarizeSpend("2026-05", CATEGORIES, [
      order({ category: "GADGETS", status: "CONFIRMED", amount: 884 }),
      order({ category: "GADGETS", status: "DELIVERED", amount: 112900 }),
      order({ category: "APPAREL", status: "SHIPPED", amount: 1099.5 }),
    ]);
    assert.equal(summary.totalSpent, 114883.5);
    assert.equal(summary.orderCount, 3);
    const gadgets = summary.categories.find((c) => c.category === "GADGETS")!;
    assert.deepEqual(gadgets, { category: "GADGETS", label: "Gadgets", orderCount: 2, spent: 113784 });
  });

  test("cancelled, returned and refunded orders are not spending", () => {
    const summary = summarizeSpend("2026-02", CATEGORIES, [
      order({ category: "OTHER", status: "CANCELLED", amount: 3499 }),
      order({ category: "APPAREL", status: "RETURNED", amount: 999 }),
      order({ category: "APPAREL", status: "REFUNDED", amount: 499 }),
      order({ category: "FOOD", status: "DELIVERED", amount: 350 }),
    ]);
    assert.equal(summary.totalSpent, 350);
    assert.equal(summary.orderCount, 1);
  });

  test("orders without a known INR total are counted but not summed", () => {
    const summary = summarizeSpend("2026-03", CATEGORIES, [
      order({ category: "OTHER", status: "CONFIRMED", amount: null, currency: null }),
      order({ category: "GADGETS", status: "CONFIRMED", amount: 49.99, currency: "USD" }),
      order({ category: "FOOD", status: "DELIVERED", amount: 250 }),
    ]);
    assert.equal(summary.totalSpent, 250);
    assert.equal(summary.orderCount, 3);
    assert.equal(summary.unpricedOrders, 2);
  });

  test("lists every category (zeros included), biggest spend first", () => {
    const summary = summarizeSpend("2026-05", CATEGORIES, [order({ category: "FOOD", status: "DELIVERED", amount: 250 })]);
    assert.equal(summary.categories.length, 7);
    assert.equal(summary.categories[0].category, "FOOD");
    assert.ok(summary.categories.slice(1).every((c) => c.spent === 0 && c.orderCount === 0));
  });
});

test("a category created later (Fragrance) shows up with its spend", () => {
  const summary = summarizeSpend("2026-02", [...CATEGORIES, { key: "FRAGRANCE", label: "Fragrance" }], [
    order({ category: "FRAGRANCE", status: "CONFIRMED", amount: 3499 }),
  ]);
  assert.equal(summary.categories.length, 8);
  assert.deepEqual(summary.categories[0], { category: "FRAGRANCE", label: "Fragrance", orderCount: 1, spent: 3499 });
});

describe("monthRange (India time, UTC+05:30)", () => {
  test("May 2026 starts at 1 May 00:00 IST and ends at 1 June 00:00 IST", () => {
    const { start, end } = monthRange("2026-05");
    assert.equal(start.toISOString(), "2026-04-30T18:30:00.000Z");
    assert.equal(end.toISOString(), "2026-05-31T18:30:00.000Z");
  });

  test("December rolls over into January of the next year", () => {
    assert.equal(monthRange("2026-12").end.toISOString(), "2026-12-31T18:30:00.000Z");
  });
});
