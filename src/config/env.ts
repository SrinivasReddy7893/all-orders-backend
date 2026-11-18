import "dotenv/config";
import { z } from "zod";

/**
 * Every setting the server needs, checked once at startup. A missing or weak
 * value stops the server with a clear message instead of failing later on the
 * first login. Error messages name the setting, never its value.
 */
const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().url(),

    // Signs login tokens: must be long and random (e.g. `openssl rand -base64 48`).
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    // Encrypts Gmail tokens at rest: 32 random bytes, base64 (`openssl rand -base64 32`).
    TOKEN_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, "base64").length === 32, "TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded"),

    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    GOOGLE_REDIRECT_URI: z.string().url(),

    // Frontend origins allowed to call the API, comma-separated.
    CORS_ORIGINS: z
      .string()
      .optional()
      .transform((v) => (v ? v.split(",").map((o) => o.trim()).filter(Boolean) : [])),
  })
  .refine((env) => env.NODE_ENV !== "production" || env.CORS_ORIGINS.length > 0, {
    message: "CORS_ORIGINS must list the frontend origin(s) in production",
    path: ["CORS_ORIGINS"],
  });

export type Env = z.infer<typeof schema>;

export const parseEnv = (raw: Record<string, string | undefined>): Env => {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join(".") || "env"}: ${i.message}`).join("\n");
    throw new Error(`Invalid server configuration:\n${problems}`);
  }
  return result.data;
};

// Lazily parsed so unit tests can import modules without a full .env.
let cached: Env | null = null;
export const env = (): Env => (cached ??= parseEnv(process.env));
