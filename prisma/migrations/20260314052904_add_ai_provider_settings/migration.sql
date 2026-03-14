-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChatSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "welcomeMessage" TEXT NOT NULL DEFAULT 'Hi! How can I help you today?',
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiProvider" TEXT NOT NULL DEFAULT 'claude',
    "aiApiKey" TEXT,
    "aiModel" TEXT,
    "systemPrompt" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ChatSettings" ("aiEnabled", "createdAt", "id", "shop", "systemPrompt", "updatedAt", "welcomeMessage") SELECT "aiEnabled", "createdAt", "id", "shop", "systemPrompt", "updatedAt", "welcomeMessage" FROM "ChatSettings";
DROP TABLE "ChatSettings";
ALTER TABLE "new_ChatSettings" RENAME TO "ChatSettings";
CREATE UNIQUE INDEX "ChatSettings_shop_key" ON "ChatSettings"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
