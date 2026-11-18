import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseEnv } from "./env";

const valid = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://postgres:pw@localhost:5432/all_orders",
  JWT_SECRET: "x".repeat(64),
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  GOOGLE_CLIENT_ID: "id.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "secret",
  GOOGLE_REDIRECT_URI: "http://localhost:4000/api/v1/auth/google/callback",
};

describe("parseEnv", () => {
  test("accepts a complete configuration and applies defaults", () => {
    const env = parseEnv(valid);
    assert.equal(env.PORT, 4000);
    assert.deepEqual(env.CORS_ORIGINS, []);
  });

  test("refuses to start without JWT_SECRET", () => {
    const { JWT_SECRET, ...rest } = valid;
    assert.throws(() => parseEnv(rest), /JWT_SECRET/);
  });

  test("refuses a short (guessable) JWT_SECRET", () => {
    assert.throws(() => parseEnv({ ...valid, JWT_SECRET: "short-secret1" }), /JWT_SECRET/);
  });

  test("encryption key must be exactly 32 bytes (base64)", () => {
    assert.throws(() => parseEnv({ ...valid, TOKEN_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") }), /TOKEN_ENCRYPTION_KEY/);
  });

  test("CORS_ORIGINS is a comma-separated list", () => {
    const env = parseEnv({ ...valid, CORS_ORIGINS: "https://app.allorders.in, http://localhost:3000" });
    assert.deepEqual(env.CORS_ORIGINS, ["https://app.allorders.in", "http://localhost:3000"]);
  });

  test("production requires an explicit CORS allow-list", () => {
    assert.throws(() => parseEnv({ ...valid, NODE_ENV: "production" }), /CORS_ORIGINS/);
  });

  test("the error never echoes secret values", () => {
    try {
      parseEnv({ ...valid, JWT_SECRET: "tooShortSecret" });
      assert.fail("should throw");
    } catch (e) {
      assert.doesNotMatch(String(e), /tooShortSecret/);
    }
  });
});
