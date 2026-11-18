// Months are counted in India time; IST has no daylight saving, so a fixed offset is exact.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const SUMMARY_CURRENCY = "INR";
const NOT_SPENDING = new Set(["CANCELLED", "RETURNED", "REFUNDED"]);

/** "2026-05" → [1 May 00:00 IST, 1 Jun 00:00 IST) as UTC instants. */
export const monthRange = (month: string) => {
  const [year, m] = month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, m - 1, 1) - IST_OFFSET_MS),
    end: new Date(Date.UTC(year, m, 1) - IST_OFFSET_MS),
  };
};

/** The current month in India time, as "YYYY-MM". */
export const currentMonth = (now = new Date()) =>
  new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 7);

type SpendOrder = { category: string; status: string; amount: number | null; currency: string | null };
type Category = { key: string; label: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Spend for one month, overall and per category. Every known category is listed
 * (zeros included, biggest spend first) so the dashboard layout stays stable.
 */
export const summarizeSpend = (month: string, categories: Category[], orders: SpendOrder[]) => {
  const counted = orders.filter((o) => !NOT_SPENDING.has(o.status));
  const isPriced = (o: SpendOrder) => o.amount != null && (o.currency ?? SUMMARY_CURRENCY) === SUMMARY_CURRENCY;

  const rows = categories
    .map(({ key, label }) => {
      const inCategory = counted.filter((o) => o.category === key);
      return {
        category: key,
        label,
        orderCount: inCategory.length,
        spent: round2(inCategory.filter(isPriced).reduce((sum, o) => sum + o.amount!, 0)),
      };
    })
    .sort((a, b) => b.spent - a.spent || b.orderCount - a.orderCount);

  return {
    month,
    currency: SUMMARY_CURRENCY,
    totalSpent: round2(counted.filter(isPriced).reduce((sum, o) => sum + o.amount!, 0)),
    orderCount: counted.length,
    unpricedOrders: counted.filter((o) => !isPriced(o)).length,
    categories: rows,
  };
};
