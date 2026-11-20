import { google } from "googleapis";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma";
import { createOAuthClient } from "../config/google";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";
import { decryptSecret, encryptSecret } from "../utils/tokenCrypto";
import { disconnectMailbox, planConnect } from "./mailbox.service";

// The OAuth `state` is a short-lived signed token, so the callback can trust
// which user started the flow. A separate secret keeps it from ever being
// accepted as an access token by authMiddleware.
const stateSecret = () => `${env().JWT_SECRET}:gmail-oauth-state`;

const GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export const generateGoogleAuthUrl = (userId: string) =>
  createOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    state: jwt.sign({ userId }, stateSecret(), { expiresIn: "10m" }),
    scope: ["openid", "email", "profile", GMAIL_READ_SCOPE],
  });

const verifyOAuthState = (state: string): string => {
  try {
    const { userId } = jwt.verify(state, stateSecret()) as { userId: string };
    return userId;
  } catch {
    throw new AppError("Invalid or expired OAuth state", 400, "INVALID_STATE");
  }
};

export const connectGmailAccount = async (code: string, state: string) => {
  const userId = verifyOAuthState(state);

  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);

  // Google lets users untick individual permissions on the consent screen.
  if (!tokens.scope?.split(" ").includes(GMAIL_READ_SCOPE)) {
    throw new AppError(
      "Gmail read access was not granted. Connect again and tick the Gmail permission on Google's consent screen.",
      403,
      "GMAIL_PERMISSION_MISSING"
    );
  }

  client.setCredentials(tokens);

  const { data } = await google.oauth2({ auth: client, version: "v2" }).userinfo.get();
  const email = data.email;

  if (!email) {
    throw new AppError("Google account has no email", 400, "INVALID_GOOGLE_DATA");
  }
  if (!tokens.access_token) {
    throw new AppError("Google did not return an access token", 400, "INVALID_GOOGLE_DATA");
  }

  const tokenExpiry = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

  const [existing, userMailboxCount] = await Promise.all([
    prisma.connectedEmailAccount.findUnique({ where: { email }, select: { id: true, userId: true } }),
    prisma.connectedEmailAccount.count({ where: { userId } }),
  ]);
  const plan = planConnect({ userId, existingOwnerId: existing?.userId ?? null, userMailboxCount });

  if (plan === "limit") {
    throw new AppError("You have reached the mailbox limit. Remove one to add another.", 400, "MAILBOX_LIMIT");
  }
  // A Gmail that moves to a new owner takes its orders along: the previous
  // owner's copies are removed first, so nobody keeps another person's mail.
  if (plan === "takeover" && existing) {
    logger.warn(`Gmail ${email} moved to a new owner; clearing the previous owner's orders from it`);
    await disconnectMailbox(existing.userId, existing.id);
  }

  const secrets = {
    googleAccessToken: encryptSecret(tokens.access_token),
    googleRefreshToken: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : undefined,
    tokenExpiry,
    needsReconnect: false,
  };
  let account: { id: string };
  if (plan === "refresh") {
    account = await prisma.connectedEmailAccount.update({ where: { email }, data: secrets, select: { id: true } });
  } else {
    account = await prisma.connectedEmailAccount.create({
      select: { id: true },
      data: { userId, email, provider: "gmail", ...secrets, googleRefreshToken: encryptSecret(tokens.refresh_token ?? "") },
    });
  }

  return { email, id: account.id, userId };
};

// Returns an OAuth client authorised for this user's connected Gmail account,
// refreshing (and persisting) the access token when needed.
export const getAuthorizedGmailClient = async (userId: string, accountId?: string) => {
  const connectedAccount = await prisma.connectedEmailAccount.findFirst({
    where: { userId, provider: "gmail", ...(accountId ? { id: accountId } : {}) },
  });

  if (!connectedAccount) {
    throw new AppError("No connected Gmail account found", 400, "GMAIL_NOT_CONNECTED");
  }

  const client = createOAuthClient();
  client.setCredentials({
    access_token: decryptSecret(connectedAccount.googleAccessToken),
    refresh_token: decryptSecret(connectedAccount.googleRefreshToken),
  });

  let accessToken: string | null | undefined;
  try {
    ({ token: accessToken } = await client.getAccessToken());
  } catch (error: any) {
    logger.error(
      `Google token refresh failed for ${connectedAccount.email}: ${JSON.stringify(
        error?.response?.data ?? error?.message ?? error
      )}`
    );
    throw error;
  }

  if (!accessToken) {
    throw new Error("Failed to refresh access token");
  }

  // Save a refreshed access token, and encrypt rows stored before encryption existed.
  const storedPlaintext = !connectedAccount.googleRefreshToken.startsWith("enc:");
  if (accessToken !== decryptSecret(connectedAccount.googleAccessToken) || storedPlaintext) {
    await prisma.connectedEmailAccount.update({
      where: { id: connectedAccount.id },
      data: {
        googleAccessToken: encryptSecret(accessToken),
        googleRefreshToken: encryptSecret(decryptSecret(connectedAccount.googleRefreshToken)),
      },
    });
  }

  return { client, connectedAccount };
};
