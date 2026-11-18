import crypto from "crypto";
import { env } from "../config/env";

/**
 * Encryption at rest for third-party tokens (Gmail access/refresh tokens):
 * AES-256-GCM with a random IV per value; the auth tag detects tampering.
 * Stored format: "enc:v1:<iv>:<tag>:<ciphertext>" (base64 parts).
 * Values without the prefix were saved before encryption existed and are
 * returned as-is; they are encrypted the next time they are written.
 */

const PREFIX = "enc:v1:";
const defaultKey = () => Buffer.from(env().TOKEN_ENCRYPTION_KEY, "base64");

export const encryptSecret = (plain: string, key: Buffer = defaultKey()): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(":");
};

export const decryptSecret = (stored: string, key: Buffer = defaultKey()): string => {
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext
  const [iv, tag, data] = stored.slice(PREFIX.length).split(":").map((p) => Buffer.from(p, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
};
