/**
 * The delivery date an email promises. Only wordings seen in real order
 * emails are read, and every date is sanity-checked against the email's own
 * date, so a stray number is never taken for a delivery date.
 *
 *   Apple:  "Delivers 05/11/2026 by Express Shipping"   (day/month/year)
 *   boAt:   "Arriving on Sunday, May 10th"             (no year)
 */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAY_MS = 86_400_000;

// 12:00 IST, so the calendar day is the same in every timezone the app is used in.
const at = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, day, 6, 30));

const isRealDate = (d: Date, year: number, month: number, day: number) =>
  d.getUTCFullYear() === year && d.getUTCMonth() === month && d.getUTCDate() === day;

// Promised dates sit a little before (late email) to a few months after the email.
const plausible = (d: Date, sent: Date) => {
  const days = (d.getTime() - sent.getTime()) / DAY_MS;
  return days >= -2 && days <= 120;
};

export const extractExpectedDelivery = (text: string, sentAt: Date): Date | null => {
  // "Delivers 05/11/2026": day first, as in India; month first only if that is the sole reading that fits.
  const numeric = text.match(/\bDelivers\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\b/i);
  if (numeric) {
    const [a, b, year] = [Number(numeric[1]), Number(numeric[2]), Number(numeric[3])];
    for (const [day, month] of [[a, b], [b, a]]) {
      const d = at(year, month - 1, day);
      if (month >= 1 && month <= 12 && isRealDate(d, year, month - 1, day) && plausible(d, sentAt)) return d;
    }
  }

  // "Arriving on Sunday, May 10th": the year is whichever one puts the date near the email.
  const named = text.match(/\bArriving\s+on\s+(?:[A-Za-z]+,?\s+)?([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (named) {
    const month = MONTHS.indexOf(named[1].slice(0, 3).toLowerCase());
    const day = Number(named[2]);
    if (month >= 0) {
      for (const year of [sentAt.getUTCFullYear(), sentAt.getUTCFullYear() + 1, sentAt.getUTCFullYear() - 1]) {
        const d = at(year, month, day);
        if (isRealDate(d, year, month, day) && plausible(d, sentAt)) return d;
      }
    }
  }

  return null;
};
