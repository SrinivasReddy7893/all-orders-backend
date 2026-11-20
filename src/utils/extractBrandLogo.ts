/**
 * A brand's own logo, taken from one of its order emails.
 *
 * Only an email sent by the brand itself is read (a courier's email would give
 * the courier's logo), and an image must say it is the brand: its alt text is
 * the brand's name, or its file name says logo/icon and the image is hosted on
 * the brand's own domain. Tracking pixels, spacers, social icons and
 * per-recipient URLs never qualify. The URL is stored, never fetched here.
 */

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
// Second-level public suffixes, so "orders.apple.co.in" reduces to "apple".
const SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "ac"]);

const decode = (s: string) =>
  s.replace(/&amp;/gi, "&").replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"');

// "Duke & D'Or" → "dukeanddor", "boAt Lifestyle" → "boatlifestyle".
const squash = (s: string) =>
  decode(s).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

/** The brand part of a hostname: "orders.apple.com" → "apple", "x.boat-lifestyle.com" → "boatlifestyle". */
export const brandLabel = (host: string): string => {
  const parts = host.toLowerCase().split(".").filter(Boolean);
  while (parts.length > 2 && SECOND_LEVEL.has(parts[parts.length - 2])) parts.splice(-2, 1);
  return squash(parts.length >= 2 ? parts[parts.length - 2] : parts[0] ?? "");
};

const senderHost = (from: string) => from.match(/@([\w.-]+)/)?.[1] ?? "";

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] ?? "";

/** Strip query and fragment: a logo is a plain file, and a query can carry a recipient's identity. */
const cleanUrl = (raw: string): string | null => {
  try {
    const url = new URL(decode(raw));
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.search = "";
    url.hash = "";
    return IMAGE_EXT.test(url.pathname) ? url.toString() : null;
  } catch {
    return null;
  }
};

const isTiny = (tag: string) => {
  for (const name of ["width", "height"]) {
    const n = parseInt(attr(tag, name), 10);
    if (Number.isFinite(n) && n < 16) return true;
  }
  return false;
};

export const extractBrandLogo = (html: string, brand: { vendor: string; from: string }): string | null => {
  const host = senderHost(brand.from);
  const label = brandLabel(host);
  const vendor = squash(brand.vendor);
  if (!host || !vendor || !label) return null;
  // The email must come from the brand itself, not a courier or mail platform.
  if (!(label.includes(vendor) || vendor.includes(label))) return null;

  let best: { url: string; score: number } | null = null;
  [...html.matchAll(/<img\b[^>]*>/gi)].slice(0, 12).forEach(([tag], index) => {
    if (isTiny(tag)) return;
    const url = cleanUrl(attr(tag, "src"));
    if (!url) return;

    const alt = squash(attr(tag, "alt"));
    const path = new URL(url).pathname.toLowerCase();
    const altIsBrand = alt.length > 0 && (alt.includes(vendor) || vendor.includes(alt));
    const named = /(logo|icon|brand)/.test(path.split("/").pop() ?? "");
    const ownHost = brandLabel(new URL(url).hostname) === label;
    if (!altIsBrand && !(named && ownHost)) return;

    const height = parseInt(attr(tag, "height"), 10);
    const width = parseInt(attr(tag, "width"), 10);
    const score =
      (altIsBrand ? 3 : 0) + (named ? 2 : 0) + (ownHost ? 1 : 0) + (width >= 40 || height >= 24 ? 1 : 0) + (index < 4 ? 1 : 0);
    if (!best || score > best.score) best = { url, score };
  });
  return (best as { url: string; score: number } | null)?.url ?? null;
};
