/**
 * Product titles from an order email.
 *
 * Order emails list each item as its name followed by price / quantity lines.
 * We only take names found that way (or from subject templates such as
 * `Shipped: "…"`), never "the most title-looking line" of the whole email —
 * that is how names, addresses and footers used to end up as titles.
 * If nothing is found the order simply has no title.
 */

const NOISE_PATTERNS = [
  /tracking number/i,
  /track order/i,
  /view order/i,
  /unsubscribe/i,
  /customer support/i,
  /customer\s+information/i,
  /click here/i,
  /shop now/i,
  /payment/i,
  /invoice/i,
  /refund/i,
  /return/i,
  /order id/i,
  /support/i,
  /visit our store/i,
  /thank you/i,
  /hello/i,
  /^hi\b/i,
  /http/i,

  // delivery/order lifecycle
  /item\(s\)\s+delivered/i,
  /items?\s+to\s+be\s+delivered/i,
  /your order/i,
  /shipment/i,
  /\border\s*#/i,
  /\bcancell?ed\b/i,

  // pricing
  /sub\s*total/i,
  /total\s*amount/i,
  /coupon/i,
  /discount/i,
  /you\s+saved/i,

  // addresses, section headers, footers
  /\b(shipping|billing|delivery)\s+address\b/i,
  /\border\s+(details|summary|status|total|number)\b/i,
  /no longer wish/i,
  /receive these emails/i,
  /reply to this email/i,
  /contact us/i,
  /questions/i,
  /\S+@\S+\.\w+/, // email addresses
  /©/,

  // shop notices & loyalty copy
  /\bnotified\b/i,
  /\bwill ship\b/i,
  /reward\s+points?/i,
  /\bcredited\b/i,
  /^enjoy\b/i,

  // misc
  /standard delivery/i,
  /cash on delivery/i,
  /\bcod\b/i,
];

// A price line: "₹999", "Rs. 3,499.00", ":₹112900.00", "Price ₹450.0", "MRP ₹1,299"
const PRICE_LINE = /^(?:price|mrp)?\s*:?\s*(?:₹|rs\.?|inr|\$)\s*[\d,]+/i;
// Item attribute lines that sit between a product name and its price.
const ATTRIBUTE_LINE = /^(?:qty|quantity|size|colou?r|variant|sku|style)\b/i;
// "Power Play Nxt Beard Trimmer × 1"
const INLINE_QUANTITY = /\s[x×]\s?\d+$/i;

const MAX_NAME_LINES = 3; // names wrapped over a few short lines ("Airdopes" / "Supreme")
const MAX_TITLES = 5;

// Subject templates that carry the product name.
const SUBJECT_PATTERNS = [
  // Amazon: Shipped: "boAt Airdopes 141…" and 1 more item
  /^(?:ordered|shipped|delivered|dispatched|out for delivery|arriving[^:]*)\s*:\s*["“'‘]?(.+?)["”'’]?(?:\s*(?:\.\.\.|…))?(?:\s+and\s+\d+\s+more\s+items?)?\s*$/i,
  // Flipkart: Your Order for Noise ColorFit… has been successfully placed
  /\border\s+for\s+(.+?)\s+(?:has|is|was|will)\b/i,
];

// Body labels that carry the product name.
const LABEL_PATTERNS = [
  /^items?:\s*(.+)/i,
  /^product(?:\s+name)?:\s*(.+)/i,
  /^shipment contains:\s*(.+)/i,
];

const cleanTitle = (value: string): string =>
  value
    .replace(INLINE_QUANTITY, "")
    .replace(/qty[:\s]*\d+/i, "")
    .replace(/\s+/g, " ")
    .trim();

const isNoise = (line: string): boolean => NOISE_PATTERNS.some((p) => p.test(line));

const isLikelyProduct = (line: string): boolean => {
  if (line.length < 4 || line.length > 120) return false;
  // numeric/symbol-only
  if (/^[^a-zA-Z]*$/.test(line)) return false;
  if (isNoise(line)) return false;
  // tracking-number-like
  if (/\d{10,}/.test(line)) return false;
  // postal addresses: PIN/ZIP codes, house numbers like 12-3-456/78
  if (/\b\d{5,6}\b/.test(line) || /\d+[-/]\d+[-/]\d+/.test(line)) return false;
  // sentences, questions and fragments: trailing ",", ":" or ".", any "?" / "!",
  // or a lowercase start (except brand names like "iPhone", "boAt", "eSIM")
  if (/[,:.]$/.test(line) || /[?!]/.test(line) || (/^[a-z]/.test(line) && !/^[a-z]+[A-Z]/.test(line))) return false;
  // greetings, headings and calls to action
  if (/^(dear|hey|here\s+(is|are)|shop|total|shipping|delivery|fee)\b/i.test(line)) return false;
  return line.split(/\s+/).length <= 12;
};

// Walk up from a price/quantity line and collect the product name above it.
const nameAbove = (lines: string[], anchor: number): string | null => {
  const parts: string[] = [];
  for (let i = anchor - 1; i >= 0 && parts.length < MAX_NAME_LINES; i--) {
    const line = lines[i];
    if (ATTRIBUTE_LINE.test(line) && parts.length === 0) continue; // skip "Size M", "Qty: 1"
    if (PRICE_LINE.test(line) || !isLikelyProduct(line)) break;   // previous item / heading
    parts.unshift(line);
  }
  const name = cleanTitle(parts.join(" "));
  return name && isLikelyProduct(name) ? name : null;
};

export const extractTitles = (body: string, subject = ""): string[] => {
  const titles = new Set<string>();
  const add = (value?: string | null) => {
    const title = value ? cleanTitle(value) : "";
    if (title && isLikelyProduct(title)) titles.add(title);
  };

  // 1. Subject templates (cleanest source when present)
  for (const pattern of SUBJECT_PATTERNS) add(subject.match(pattern)?.[1]);

  // 2. Item lines in the body
  const lines = body.split(/\r?\n/).map((l) => l.replace(/\t/g, " ").trim()).filter(Boolean);
  lines.forEach((line, i) => {
    for (const pattern of LABEL_PATTERNS) add(line.match(pattern)?.[1]);
    if (INLINE_QUANTITY.test(line)) add(line);
    if (PRICE_LINE.test(line) || /^(?:qty|quantity)\b/i.test(line)) add(nameAbove(lines, i));
  });

  return [...titles].slice(0, MAX_TITLES);
};

export const extractTitle = (body: string, subject = ""): string | null =>
  extractTitles(body, subject)[0] ?? null;
