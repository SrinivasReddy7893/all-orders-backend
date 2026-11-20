import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { brandLabel, extractBrandLogo } from "./extractBrandLogo";

describe("brandLabel", () => {
  it("reduces a sending host to its brand", () => {
    assert.equal(brandLabel("orders.apple.com"), "apple");
    assert.equal(brandLabel("email.boat-lifestyle.com"), "boatlifestyle");
    assert.equal(brandLabel("mail.nykaa.co.in"), "nykaa");
  });
});

describe("extractBrandLogo", () => {
  // Shaped like real emails from the brands' own senders.
  const apple = `
    <img src="https://email.images.apple.com/rover/aos/moe/apple_icon_2x.png" alt="Apple" width="auto" height="25">
    <img src="https://email.images.apple.com/dm/groups/aos/om/global/cmon/spacer.gif" alt="" width="1" height="2">
    <img src="https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/mac-mini-hero-202410?wid=96" alt="" width="96" height="96">`;
  const duke = `
    <img src="https://d3k81ch9hvuctc.cloudfront.net/company/RfFA8M/images/hero.png" alt="" width="600">
    <img src="https://d3k81ch9hvuctc.cloudfront.net/company/RfFA8M/images/brand.png" alt="Duke &amp; D'Or" width="350">
    <img src="https://d3k81ch9hvuctc.cloudfront.net/assets/email/buttons/subtleinverse/instagram_96.png" alt="Instagram" width="32">`;

  it("finds Apple's own logo and ignores spacers and product shots", () => {
    assert.equal(
      extractBrandLogo(apple, { vendor: "APPLE", from: "Apple Store <order_acknowledgment@orders.apple.com>" }),
      "https://email.images.apple.com/rover/aos/moe/apple_icon_2x.png"
    );
  });

  it("matches the alt text to the brand name, even on a shared CDN", () => {
    assert.equal(
      extractBrandLogo(duke, { vendor: "DUKEANDDOR", from: `"Duke & D'Or" <info@dukeanddor.com>` }),
      "https://d3k81ch9hvuctc.cloudfront.net/company/RfFA8M/images/brand.png"
    );
  });

  it("never takes a courier's logo for the brand's", () => {
    const shiprocket = `<img src="https://sr-cdn-1.shiprocket.in/img/sr/logo/elasticrunlogo.jpeg" alt="Courier Logo" width="70" height="24">
      <img src="https://bucket.s3.amazonaws.com/templates/SR-logo.png" alt="" width="204px" height="50px">`;
    assert.equal(extractBrandLogo(shiprocket, { vendor: "BOAT", from: "Shiprocket <info@net.shiprocket.in>" }), null);
  });

  it("rejects tracking pixels, data URIs, plain http and non-image files", () => {
    const bad = `
      <img src="https://mailtrack.io/trace/abc.png" alt="Apple" width="0" height="0">
      <img src="data:image/gif;base64,R0lGOD" alt="Apple" width="40">
      <img src="http://email.images.apple.com/apple_icon.png" alt="Apple" width="40">
      <img src="https://email.images.apple.com/apple_icon.svg" alt="Apple" width="40">`;
    assert.equal(extractBrandLogo(bad, { vendor: "APPLE", from: "noreply@email.apple.com" }), null);
  });

  it("drops the query string, which could carry a recipient's identity", () => {
    const html = `<img src="https://cdn.nykaa.com/logo.png?uid=12345&email=a@b.com" alt="Nykaa" width="80">`;
    assert.equal(extractBrandLogo(html, { vendor: "NYKAA", from: "orders@mail.nykaa.com" }), "https://cdn.nykaa.com/logo.png");
  });
});
