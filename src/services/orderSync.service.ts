import prisma from "../config/prisma";
import { logger } from "../utils/logger";
import { fetchOrdersFromGmail } from "./gmail.service";
import { saveBrandLogos, upsertOrders } from "./order.service";
import { SYNC_LOCK_TTL_MS } from "./syncLock";

/** Google's "invalid_grant": the user revoked access or the refresh token expired. */
export const isAccessRevoked = (error: unknown) => {
  const e = error as { response?: { data?: { error?: string } }; message?: string };
  return e?.response?.data?.error === "invalid_grant" || /invalid_grant/.test(e?.message ?? "");
};

export type SyncResult = { email: string; status: "SYNCED" | "BUSY"; orders: number };

/**
 * Sync one connected Gmail account. Used by both the 15-minute job and the
 * manual POST /orders/sync, so the two never run the same account at once.
 * The lock is taken atomically; a lock older than SYNC_LOCK_TTL_MS (crash)
 * can be taken over.
 */
export const syncAccount = async (account: { id: string; userId: string; email: string }): Promise<SyncResult> => {
  const now = new Date();
  const lock = await prisma.connectedEmailAccount.updateMany({
    where: {
      id: account.id,
      OR: [
        { isSyncing: false },
        { syncStartedAt: null },
        { syncStartedAt: { lt: new Date(now.getTime() - SYNC_LOCK_TTL_MS) } },
      ],
    },
    data: { isSyncing: true, syncStartedAt: now },
  });
  if (lock.count === 0) return { email: account.email, status: "BUSY", orders: 0 };

  try {
    const orders = await fetchOrdersFromGmail(account.userId, { accountId: account.id });
    await saveBrandLogos(orders);
    await upsertOrders(orders.map((o) => ({ ...o, userId: account.userId, accountId: account.id })));
    await prisma.connectedEmailAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: new Date(), needsReconnect: false },
    });
    return { email: account.email, status: "SYNCED", orders: orders.length };
  } catch (error) {
    // Google revoked or expired our access: flag it so the app can ask to
    // reconnect, instead of failing silently every 15 minutes.
    if (isAccessRevoked(error)) {
      await prisma.connectedEmailAccount.update({ where: { id: account.id }, data: { needsReconnect: true } });
    }
    throw error;
  } finally {
    await prisma.connectedEmailAccount.update({
      where: { id: account.id },
      data: { isSyncing: false, syncStartedAt: null },
    });
  }
};

/** Sync every connected account; one failing account doesn't stop the others. */
export const syncAllAccounts = async () => {
  const accounts = await prisma.connectedEmailAccount.findMany({ select: { id: true, userId: true, email: true } });
  logger.info(`Order sync: ${accounts.length} connected account(s)`);
  for (const account of accounts) {
    try {
      const result = await syncAccount(account);
      logger.info(`Order sync ${account.email}: ${result.status} (${result.orders} orders)`);
    } catch (error) {
      logger.error(`Order sync failed for ${account.email}`, error);
    }
  }
};
