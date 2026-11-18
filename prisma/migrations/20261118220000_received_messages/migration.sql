-- AlterEnum
ALTER TYPE "OrderSource" ADD VALUE 'NOTIFICATION';
-- CreateTable
CREATE TABLE "ReceivedMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "orderId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReceivedMessage_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "ReceivedMessage_userId_source_externalId_key" ON "ReceivedMessage"("userId", "source", "externalId");
-- AddForeignKey
ALTER TABLE "ReceivedMessage" ADD CONSTRAINT "ReceivedMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
