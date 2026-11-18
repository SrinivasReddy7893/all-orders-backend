import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { extractOrderTotal } from "./extractAmount";

// Formats taken from real order emails.

describe("extractOrderTotal", () => {
  test("label and amount on separate lines (Duke & Dor)", () => {
    assert.deepEqual(extractOrderTotal("DATE PLACED :\nFebruary 19, 2026\nORDER TOTAL :\nRs. 3,499.00\nSHIPPING ADDRESS :"), { amount: 3499, currency: "INR" });
  });

  test("₹ with a space and thousands separator", () => {
    assert.deepEqual(extractOrderTotal("ORDER TOTAL :\n₹ 8,031.98"), { amount: 8031.98, currency: "INR" });
  });

  test("Apple: 'Total charged today' wins over the item price and subtotal", () => {
    const body = "Mac mini with M6 chip\n₹112900.00\n1\n₹112900.00\nSubtotal :\n₹112900.00Free Delivery :₹0.00\nTotal charged today\n:₹112900.00";
    assert.deepEqual(extractOrderTotal(body), { amount: 112900, currency: "INR" });
  });

  test("boAt: the final total after discount, not the item price or savings", () => {
    const body = "Airdopes\nSupreme\nQuantity: 1\n₹999\nShipping\nFee: ₹0\nTotal\n₹884\nYou saved ₹115";
    assert.deepEqual(extractOrderTotal(body), { amount: 884, currency: "INR" });
  });

  test("'Total Amount' on one line (Myntra)", () => {
    assert.deepEqual(extractOrderTotal("Sub Total\t₹450.0\nStandard Delivery\t₹4.84\nTotal Amount\t₹411.9"), { amount: 411.9, currency: "INR" });
  });

  test("a 'Total 1 items' count line is not an amount", () => {
    assert.deepEqual(extractOrderTotal("Total 1 items\nAirdopes Supreme Classic Black\nQty: 1 | Price : ₹999.00"), null);
  });

  test("US dollars", () => {
    assert.deepEqual(extractOrderTotal("Order total: $49.99"), { amount: 49.99, currency: "USD" });
  });

  test("no total in the email", () => {
    assert.equal(extractOrderTotal("Your order is on its way."), null);
  });
});
