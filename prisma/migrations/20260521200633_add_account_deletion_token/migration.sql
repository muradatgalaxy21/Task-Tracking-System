-- CreateTable
CREATE TABLE "AccountDeletionToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountDeletionToken_user_id_key" ON "AccountDeletionToken"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "AccountDeletionToken_token_key" ON "AccountDeletionToken"("token");
