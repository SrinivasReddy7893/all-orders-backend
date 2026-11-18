-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'OTHER';
-- CreateIndex
CREATE INDEX "Order_userId_orderedAt_idx" ON "Order"("userId", "orderedAt");
