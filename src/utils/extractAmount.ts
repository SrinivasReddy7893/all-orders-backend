export type OrderTotal = { amount: number; currency: string };

// Labels for the amount actually paid, best first. Each is matched at the start
// of a line, so "Subtotal" / "Sub Total" never count as the order total.
const TOTAL_LABELS = [
  /^(?:total\s+charged|total\s+paid|amount\s+paid|amount\s+charged)\b/i,
  /^(?:grand\s+total|order\s+total|total\s+amount|order\s+amount|net\s+amount)\b/i,
  /^total\b/i,
];

const MONEY = /(₹|rs\.?|inr|\$|usd)\s*([\d,]+(?:\.\d+)?)/i;

const toTotal = (match: RegExpMatchArray): OrderTotal | null => {
  const amount = Number(match[2].replace(/,/g, ""));
  if (!Number.isFinite(amount)) return null;
  const currency = /\$|usd/i.test(match[1]) ? "USD" : "INR";
  return { amount, currency };
};

/** The order's total from an email body, or null if it states none. */
export const extractOrderTotal = (text: string): OrderTotal | null => {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const label of TOTAL_LABELS) {
    for (let i = 0; i < lines.length; i++) {
      if (!label.test(lines[i])) continue;
      // The amount is on the label's line ("Total Amount ₹411.9") or the next one ("ORDER TOTAL :" / "Rs. 3,499.00").
      const sameLine = lines[i].match(MONEY);
      const nextLine = lines[i + 1]?.match(new RegExp(String.raw`^:?\s*${MONEY.source}`, "i"));
      const match = sameLine ?? nextLine;
      if (match) {
        const total = toTotal(match);
        if (total) return total;
      }
    }
  }
  return null;
};
