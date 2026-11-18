import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { extractTitles } from "./extractTitle";

// Email bodies below follow the structure of real order emails
// (names and addresses replaced with made-up ones).

describe("extractTitles — product next to price/quantity", () => {
  test("Apple: product line directly above its price", () => {
    const body = [
      "Items to be Delivered to Ravi Kumar",
      "Shipment 1:",
      "Delivery: Tomorrow by Express Delivery",
      "Mac mini with M6 chip",
      "₹112900.00",
      "1",
      "₹112900.00",
      "Subtotal :",
      "₹112900.00Free Delivery :₹0.00",
      "Total charged today",
      ":₹112900.00",
    ].join("\n");
    assert.deepEqual(extractTitles(body), ["Mac mini with M6 chip"]);
  });

  test("boAt: product name split over two lines above 'Quantity'", () => {
    const body = ["Order Summary", "Airdopes", "Supreme", "Quantity: 1", "Color: Classic Black", "₹999", "Shipping", "Fee: ₹0", "Total", "₹884"].join("\n");
    assert.deepEqual(extractTitles(body), ["Airdopes Supreme"]);
  });

  test("Myntra: size/colour lines between product and price are skipped", () => {
    const body = ["Item(s) Delivered", "Typographic Print Polo T-Shirt", "Size SQty 1Colour Navy Blue", "Price ₹450.0", "Sub Total ₹450.0"].join("\n");
    assert.deepEqual(extractTitles(body), ["Typographic Print Polo T-Shirt"]);
  });

  test("several items in one order", () => {
    const body = ["Men Straight Fit Jeans", "Qty: 1", "₹750", "Men Colour-block Polo Regular Fit T-Shirt", "Qty: 1", "₹349"].join("\n");
    assert.deepEqual(extractTitles(body), ["Men Straight Fit Jeans", "Men Colour-block Polo Regular Fit T-Shirt"]);
  });

  test("strips a trailing '× 1' quantity", () => {
    const body = ["Power Play Nxt Beard Trimmer × 1", "If you have any questions, reply to this email or"].join("\n");
    assert.deepEqual(extractTitles(body), ["Power Play Nxt Beard Trimmer"]);
  });

  test("keeps product names that start with a lowercase brand prefix", () => {
    assert.deepEqual(extractTitles("iPhone 15 Silicone Case\nQty: 1\n₹2,900"), ["iPhone 15 Silicone Case"]);
  });
});

describe("extractTitles — no product in the email", () => {
  test("only an order total → no title rather than a wrong one", () => {
    const body = ["DATE PLACED :", "February 19, 2026", "ORDER TOTAL :", "Rs. 3,499.00", "SHIPPING ADDRESS :", "Ravi Kumar", "Near Bus Stand", "Hyderabad", "United States", "Removed Items", "© 2026 | Duke & D’Or"].join("\n");
    assert.deepEqual(extractTitles(body), []);
  });

  test("names, addresses, footers and prices never become titles", () => {
    const body = [
      "SHIPPING ADDRESS :",
      "Madhapur Hyderabad,500081 HYDERABAD TS,India",
      "Kumar,12-3-456/78 Lake View Colony, Near Bus Stand,",
      "Dear Ravi,",
      "Here are all the details:",
      "For any order or shipping",
      "Customer Information",
      "No longer wish to receive these emails?",
      "contact us at someone@example.com",
      "Rs. 3,499.00",
    ].join("\n");
    assert.deepEqual(extractTitles(body), []);
  });
});

describe("extractTitles — from the subject line", () => {
  test("Amazon-style 'Shipped: \"…\"' subject", () => {
    assert.deepEqual(extractTitles("", 'Shipped: "boAt Airdopes 141 Bluetooth Earbuds" and 1 more item'), ["boAt Airdopes 141 Bluetooth Earbuds"]);
  });

  test("Flipkart-style 'Your order for … has been placed'", () => {
    assert.deepEqual(extractTitles("", "Your Order for Noise ColorFit Pro 4 Smartwatch has been successfully placed"), ["Noise ColorFit Pro 4 Smartwatch"]);
  });
});
