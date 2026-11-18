import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generateOtp, hashOtp, otpMatches, MAX_OTP_ATTEMPTS } from "./otp";

describe("OTP helpers", () => {
  test("OTPs are 6 digits", () => {
    for (let i = 0; i < 200; i++) assert.match(generateOtp(), /^\d{6}$/);
  });

  test("OTPs vary (not a fixed or tiny set)", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateOtp()));
    assert.ok(seen.size > 190);
  });

  test("only the right OTP matches its stored hash", () => {
    const stored = hashOtp("482913");
    assert.equal(otpMatches("482913", stored), true);
    assert.equal(otpMatches("482914", stored), false);
  });

  test("malformed input never matches (and never throws)", () => {
    const stored = hashOtp("482913");
    assert.equal(otpMatches("", stored), false);
    assert.equal(otpMatches("482913", "not-a-hash"), false);
  });

  test("a code allows a handful of wrong guesses, not a million", () => {
    assert.ok(MAX_OTP_ATTEMPTS >= 3 && MAX_OTP_ATTEMPTS <= 5);
  });
});
