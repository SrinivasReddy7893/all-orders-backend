/**
 * Connected mailboxes: what a user can connect, what happens when a Gmail
 * changes hands, and what disconnecting one takes with it.
 */

import prisma from "../config/prisma";
import { createOAuthClient } from "../config/google";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";
import { decryptSecret } from "../utils/tokenCrypto";

export const MAX_MAILBOXES = 3;

export type ConnectPlan = "create" | "refresh" | "takeover" | "limit";

/**
 * What connecting `email` does for `userId`. The person who just proved they
 * own the Gmail gets it (so a lost phone number never locks it away), but the
 * previous owner's orders from it must go with it.
 */
export const planConnect = (input: {
  userId: string;
  existingOwnerId: string | null;
  userMailboxCount: number;
}): ConnectPlan => {
  if (input.existingOwnerId === input.userId) return "refresh";
  if (input.userMailboxCount >= MAX_MAILBOXES) return "limit";
  return input.existingOwnerId ? "takeover" : "create";
};

export const assertCanConnectMore = async (userId: string) => {
  const [count, stale] = await Promise.all([
    prisma.connectedEmailAccount.count({ where: { userId } }),
    prisma.connectedEmailAccount.count({ where: { userId, needsReconnect: true } }),
  ]);
  // At the limit, connecting is still allowed to repair a mailbox that lost access.
  if (count >= MAX_MAILBOXES && stale === 0) {
    throw new AppError(
      `You can connect up to ${MAX_MAILBOXES} mailboxes. Remove one to add another.`,
      400,
      "MAILBOX_LIMIT"
    );
  }
};

/** Mailboxes for the app: who, how fresh, whether it needs attention, how many orders. */
export const listMailboxes = async (userId: string) => {
  const rows = await prisma.connectedEmailAccount.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      lastSyncedAt: true,
      isSyncing: true,
      needsReconnect: true,
      _count: { select: { orders: true } },
    },
  });
  return rows.map(({ _count, ...row }) => ({ ...row, orderCount: _count.orders }));
};

/**
 * Remove a mailbox and the orders that were found only there. Orders also
 * found in another mailbox, or added another way (phone messages), stay.
 */
export const disconnectMailbox = async (userId: string, accountId: string) => {
  const account = await prisma.connectedEmailAccount.findFirst({
    where: { id: accountId, userId },
    select: { id: true, googleRefreshToken: true },
  });
  if (!account) throw new AppError("Mailbox not found", 404, "MAILBOX_NOT_FOUND");

  const removed = await prisma.$transaction(async (tx) => {
    const orphans = await tx.order.findMany({
      where: {
        userId,
        source: "EMAIL",
        mailboxes: { some: { accountId } },
        NOT: { mailboxes: { some: { accountId: { not: accountId } } } },
      },
      select: { id: true },
    });
    await tx.order.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
    await tx.connectedEmailAccount.delete({ where: { id: accountId } });
    return orphans.length;
  });

  // Best effort: tell Google to drop our access too.
  try {
    const client = createOAuthClient();
    const token = decryptSecret(account.googleRefreshToken);
    if (token) await client.revokeToken(token);
  } catch (error) {
    logger.warn(`Could not revoke Google access for mailbox ${accountId}`, error);
  }

  return { removedOrders: removed };
};
