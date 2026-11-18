/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `ConnectedEmailAccount` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "ConnectedEmailAccount_email_key" ON "ConnectedEmailAccount"("email");
