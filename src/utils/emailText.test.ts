import { test } from "node:test";
import assert from "node:assert/strict";
import { getEmailAllText } from "./emailText";

const b64 = (s: string) => Buffer.from(s).toString("base64url");

test("getEmailAllText includes details that only the HTML version has (Shiprocket AWB)", () => {
  const payload = {
    mimeType: "multipart/alternative",
    parts: [
      { mimeType: "text/plain", body: { data: b64("Your boAt order is arriving early!") } },
      { mimeType: "text/html", body: { data: b64("<p>Your boAt order is arriving early!</p><td>AWB No.</td><td>1332150816</td>") } },
    ],
  };
  assert.match(getEmailAllText(payload), /AWB No\.\s+1332150816/);
});
