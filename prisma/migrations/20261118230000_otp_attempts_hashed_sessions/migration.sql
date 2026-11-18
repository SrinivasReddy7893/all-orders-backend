-- OTP: count wrong guesses
ALTER TABLE "otp" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

-- Sessions: store a hash of the refresh token instead of the token.
-- Existing sessions hold plaintext tokens, so they are ended (users log in again).
DELETE FROM "Session";
ALTER TABLE "Session" RENAME COLUMN "refreshToken" TO "tokenHash";
ALTER INDEX "Session_refreshToken_key" RENAME TO "Session_tokenHash_key";
