-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "carrierCode" TEXT,
ADD COLUMN     "carrierName" TEXT,
ADD COLUMN     "trackingUrl" TEXT;
-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OrderStatus",
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "OrderEvent_orderId_occurredAt_idx" ON "OrderEvent"("orderId", "occurredAt");
-- CreateIndex
CREATE UNIQUE INDEX "OrderEvent_orderId_sourceRef_key" ON "OrderEvent"("orderId", "sourceRef");
-- CreateIndex
CREATE INDEX "Order_userId_trackingNumber_idx" ON "Order"("userId", "trackingNumber");
-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
