/**
 * Order categories for the dashboard. Decided from the product names first
 * (marketplaces like Amazon sell everything), then from the shop, else OTHER.
 *
 * Categories are data, not a fixed list: the rules below may return a key the
 * database has never seen (e.g. FRAGRANCE), and the Category row is created
 * the first time an order lands in it (see ensureCategories in order.service).
 */

export type OrderCategory = string; // UPPER_SNAKE key, e.g. "GADGETS", "FRAGRANCE"

// Friendlier labels where the key alone doesn't read well.
const LABELS: Record<string, string> = {
  PERSONAL_CARE: "Beauty & Personal Care",
};

/** "PET_SUPPLIES" → "Pet Supplies" (or a curated label). */
export const categoryLabel = (key: string): string =>
  LABELS[key] ??
  key
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const words = (...list: string[]) => new RegExp(String.raw`\b(?:${list.join("|")})(?:e?s)?\b`, "i");

// Checked in order; the first match wins (e.g. "Beard Trimmer" is personal
// care before it could be read as a gadget).
const PRODUCT_RULES: [OrderCategory, RegExp][] = [
  ["FRAGRANCE", words("perfume", "fragrance", "parfum", "eau de toilette", "cologne", "attar", "body mist")],
  ["PERSONAL_CARE", words("trimmer", "razor", "shaver", "deodorant", "face ?wash", "cream", "serum", "shampoo", "conditioner", "lotion", "sunscreen", "lipstick", "makeup", "moisturi[sz]er", "beard oil", "soap")],
  ["GADGETS", words("i?phone", "smartphone", "ipad", "tablet", "mac", "macbook", "laptop", "earbuds?", "airdopes", "airpods", "headphone", "headset", "speaker", "charger", "power ?bank", "cable", "adapter", "smart ?watch", "keyboard", "mouse", "monitor", "camera", "tv", "console", "ssd", "pendrive", "router")],
  ["APPAREL", words("shirt", "t-?shirt", "polo", "jeans", "trouser", "pant", "kurta", "kurti", "saree", "dress", "top", "hoodie", "jacket", "sweatshirt", "shorts", "shoe", "sneaker", "sandal", "sock", "cap", "innerwear")],
  ["FOOD", words("pizza", "burger", "biryani", "garlic bread", "sandwich", "meal", "combo", "wrap", "momo", "noodle", "pasta", "dosa", "thali", "shake")],
  ["GROCERIES", words("milk", "curd", "paneer", "atta", "rice", "dal", "oil", "sugar", "egg", "bread", "butter", "vegetable", "fruit", "onion", "tomato", "potato")],
  ["HOME", words("bedsheet", "pillow", "cushion", "curtain", "lamp", "cookware", "mug", "bottle", "chair", "mattress", "towel")],
];

const SHOP_CATEGORY: Record<string, OrderCategory> = {
  ZOMATO: "FOOD",
  SWIGGY: "FOOD",
  ZEPTO: "GROCERIES",
  BLINKIT: "GROCERIES",
  BIGBASKET: "GROCERIES",
  JIOMART: "GROCERIES",
  MYNTRA: "APPAREL",
  AJIO: "APPAREL",
  ZARA: "APPAREL",
  HM: "APPAREL",
  NYKAA: "PERSONAL_CARE",
  BOMBAY_SHAVING: "PERSONAL_CARE",
  APPLE: "GADGETS",
  BOAT: "GADGETS",
  DUKEANDDOR: "FRAGRANCE",
};

export const categorizeOrder = (titles: string[], vendor: string): OrderCategory => {
  const text = titles.join(" ");
  const byProduct = PRODUCT_RULES.find(([, pattern]) => pattern.test(text))?.[0];
  return byProduct ?? SHOP_CATEGORY[vendor] ?? "OTHER";
};
