/*
  Warnings:

  - A unique constraint covering the columns `[gmailMessageId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ConnectedEmailAccount" ADD COLUMN     "lastSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "gmailMessageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_gmailMessageId_key" ON "Order"("gmailMessageId");
