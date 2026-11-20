import type { gmail_v1 } from "googleapis";

const decodeBase64Url = (data: string) => Buffer.from(data, "base64url").toString("utf8");

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', ndash: "-", mdash: "-", "#8377": "₹" };

export const htmlToText = (html: string): string =>
  html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h[1-6]|table|section)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#?\w+);/g, (m, e) => ENTITIES[e] ?? (e.startsWith("#") ? String.fromCharCode(Number(e.slice(1))) : m));

const collectParts = (payload?: gmail_v1.Schema$MessagePart) => {
  const parts: { type: string; text: string }[] = [];

  const walk = (part?: gmail_v1.Schema$MessagePart) => {
    if (!part) return;
    if (part.body?.data && /^text\/(plain|html)/.test(part.mimeType ?? "")) {
      parts.push({ type: part.mimeType!, text: decodeBase64Url(part.body.data) });
    }
    part.parts?.forEach(walk);
  };
  walk(payload);
  return {
    plain: parts.find((p) => p.type.startsWith("text/plain"))?.text,
    html: parts.find((p) => p.type.startsWith("text/html"))?.text,
  };
};

const toLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && !/^https?:\/\/\S+$/.test(line))
    .join("\n");

// Plain text of an email: prefers the text/plain part, falls back to HTML.
// Returns one trimmed, non-empty line per line of content.
export const getEmailText = (payload?: gmail_v1.Schema$MessagePart): string => {
  const { plain, html } = collectParts(payload);
  return toLines(plain ?? (html ? htmlToText(html) : ""));
};

// Plain AND HTML text. Shipping details (AWB, courier) are sometimes only in
// the HTML version, so tracking detection reads both.
export const getEmailAllText = (payload?: gmail_v1.Schema$MessagePart): string => {
  const { plain, html } = collectParts(payload);
  return toLines([plain ?? "", html ? htmlToText(html) : ""].join("\n"));
};

// Every http(s) link in an email (hrefs and bare URLs), de-duplicated.
export const getEmailLinks = (payload?: gmail_v1.Schema$MessagePart): string[] => {
  const links = new Set<string>();
  const walk = (part?: gmail_v1.Schema$MessagePart) => {
    if (!part) return;
    if (part.body?.data && /^text\/(plain|html)/.test(part.mimeType ?? "")) {
      for (const [url] of decodeBase64Url(part.body.data).matchAll(/https?:\/\/[^\s"'<>)\]]+/g)) {
        links.add(url.replace(/&amp;/g, "&").replace(/[.,;]+$/, ""));
      }
    }
    part.parts?.forEach(walk);
  };
  walk(payload);
  return [...links];
};

// The HTML body of an email, if it has one.
export const getEmailHtml = (payload?: gmail_v1.Schema$MessagePart): string => collectParts(payload).html ?? "";
