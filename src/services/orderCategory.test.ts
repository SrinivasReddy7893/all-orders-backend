import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { categorizeOrder, categoryLabel } from "./orderCategory";

describe("categorizeOrder — from the product", () => {
  test("Mac mini → Gadgets", () => {
    assert.equal(categorizeOrder(["Mac mini with M6 chip"], "APPLE"), "GADGETS");
  });

  test("boAt earbuds → Gadgets", () => {
    assert.equal(categorizeOrder(["Airdopes Supreme"], "BOAT"), "GADGETS");
  });

  test("beard trimmer → Personal care", () => {
    assert.equal(categorizeOrder(["Power Play Nxt Beard Trimmer"], "BOMBAY_SHAVING"), "PERSONAL_CARE");
  });

  test("perfume from a marketplace → Fragrance", () => {
    assert.equal(categorizeOrder(["Bella Vita Organic Eau De Parfum 100ml"], "AMAZON"), "FRAGRANCE");
  });

  test("polo t-shirt → Apparel", () => {
    assert.equal(categorizeOrder(["Typographic Print Polo T-Shirt"], "MYNTRA"), "APPAREL");
  });

  test("garlic bread from a Shopify store → Food", () => {
    assert.equal(categorizeOrder(["Pizza Garlic Bread"], "SHOPIFY_D2C"), "FOOD");
  });

  test("marketplace orders use the product, not the shop", () => {
    assert.equal(categorizeOrder(["Noise ColorFit Pro 4 Smartwatch"], "AMAZON"), "GADGETS");
    assert.equal(categorizeOrder(["Men Straight Fit Jeans"], "FLIPKART"), "APPAREL");
  });

  test("whole words only: 'Laptop' is not an apparel 'top'", () => {
    assert.equal(categorizeOrder(["Adjustable Laptop Stand"], "AMAZON"), "GADGETS");
  });

  test("product beats shop: milk from Swiggy Instamart is Groceries", () => {
    assert.equal(categorizeOrder(["Amul Taaza Toned Milk 1L"], "SWIGGY"), "GROCERIES");
  });
});

describe("categorizeOrder — from the shop when there is no product", () => {
  test("Zomato → Food", () => {
    assert.equal(categorizeOrder([], "ZOMATO"), "FOOD");
  });

  test("Blinkit → Groceries", () => {
    assert.equal(categorizeOrder([], "BLINKIT"), "GROCERIES");
  });

  test("Duke & Dor → Fragrance (a category that is not in the starting list)", () => {
    assert.equal(categorizeOrder(["NOIR"], "DUKEANDDOR"), "FRAGRANCE");
  });

  test("unknown shop and no product → Other", () => {
    assert.equal(categorizeOrder([], "SOMENEWSTORE"), "OTHER");
  });
});

describe("categoryLabel", () => {
  test("known categories have friendly labels", () => {
    assert.equal(categoryLabel("PERSONAL_CARE"), "Beauty & Personal Care");
    assert.equal(categoryLabel("FRAGRANCE"), "Fragrance");
  });

  test("any new category key gets a readable label", () => {
    assert.equal(categoryLabel("PET_SUPPLIES"), "Pet Supplies");
  });
});
