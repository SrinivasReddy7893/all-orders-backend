/**
 * Tracking number / AWB from shipping-email text. Only values right after an
 * explicit label are taken, and they must contain a digit — so "Tracking
 * information" or a courier's phone number never becomes a tracking number.
 */

const LABEL = String.raw`(?:tracking|awb|air\s*waybill|waybill|consignment|docket|shipment)`;
const SUFFIX = String.raw`(?:\s*(?:number|no\.?|id|#|code))?`;
const VALUE = String.raw`([A-Z0-9]{8,25})`;

const TRACKING_RE = new RegExp(String.raw`\b${LABEL}${SUFFIX}\s*[:#\-]?\s*${VALUE}\b`, "gi");

export const extractTrackingNumber = (text: string): string | null => {
  for (const match of text.replace(/\n/g, " ").matchAll(TRACKING_RE)) {
    const value = match[1].toUpperCase();
    if (/\d/.test(value)) return value;
  }
  return null;
};
