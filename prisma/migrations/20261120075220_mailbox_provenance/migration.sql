-- AlterTable
ALTER TABLE "ConnectedEmailAccount" ADD COLUMN     "needsReconnect" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "OrderMailbox" (
    "orderId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,

    CONSTRAINT "OrderMailbox_pkey" PRIMARY KEY ("orderId","accountId")
);

-- CreateIndex
CREATE INDEX "OrderMailbox_accountId_idx" ON "OrderMailbox"("accountId");

-- AddForeignKey
ALTER TABLE "OrderMailbox" ADD CONSTRAINT "OrderMailbox_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderMailbox" ADD CONSTRAINT "OrderMailbox_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ConnectedEmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Orders found before mailboxes were tracked came from the user's only
-- connected account, so link them to it.
INSERT INTO "OrderMailbox" ("orderId", "accountId")
SELECT o."id", a."id"
FROM "Order" o
JOIN "ConnectedEmailAccount" a ON a."userId" = o."userId"
WHERE o."source" = 'EMAIL'
ON CONFLICT DO NOTHING;
