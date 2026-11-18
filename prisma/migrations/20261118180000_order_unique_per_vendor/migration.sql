-- DropIndex
DROP INDEX "Order_userId_externalOrderId_key";
-- CreateIndex
CREATE UNIQUE INDEX "Order_userId_vendor_externalOrderId_key" ON "Order"("userId", "vendor", "externalOrderId");
