import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { encryptSecret, decryptSecret } from "./tokenCrypto";

const key = crypto.randomBytes(32);
const token = "ya29.a0Example-Google-Access-Token";

describe("tokenCrypto", () => {
  test("round-trips a token", () => {
    assert.equal(decryptSecret(encryptSecret(token, key), key), token);
  });

  test("stored value does not contain the token", () => {
    const stored = encryptSecret(token, key);
    assert.ok(stored.startsWith("enc:v1:"));
    assert.ok(!stored.includes(token));
  });

  test("same token encrypts differently each time (random IV)", () => {
    assert.notEqual(encryptSecret(token, key), encryptSecret(token, key));
  });

  test("tampered ciphertext is rejected", () => {
    const stored = encryptSecret(token, key);
    const tampered = stored.slice(0, -4) + (stored.endsWith("AAAA") ? "BBBB" : "AAAA");
    assert.throws(() => decryptSecret(tampered, key));
  });

  test("the wrong key cannot decrypt", () => {
    assert.throws(() => decryptSecret(encryptSecret(token, key), crypto.randomBytes(32)));
  });

  test("values saved before encryption existed are read as-is", () => {
    assert.equal(decryptSecret("1//0legacy-plain-refresh-token", key), "1//0legacy-plain-refresh-token");
  });
});
