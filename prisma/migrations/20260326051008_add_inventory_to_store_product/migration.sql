-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StoreProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "productType" TEXT NOT NULL DEFAULT '',
    "vendor" TEXT NOT NULL DEFAULT '',
    "tags" TEXT NOT NULL DEFAULT '',
    "priceRange" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "imageUrl" TEXT,
    "inventoryQuantity" INTEGER,
    "tracksInventory" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_StoreProduct" ("description", "handle", "id", "imageUrl", "priceRange", "productId", "productType", "shop", "status", "syncedAt", "tags", "title", "vendor") SELECT "description", "handle", "id", "imageUrl", "priceRange", "productId", "productType", "shop", "status", "syncedAt", "tags", "title", "vendor" FROM "StoreProduct";
DROP TABLE "StoreProduct";
ALTER TABLE "new_StoreProduct" RENAME TO "StoreProduct";
CREATE INDEX "StoreProduct_shop_idx" ON "StoreProduct"("shop");
CREATE UNIQUE INDEX "StoreProduct_shop_productId_key" ON "StoreProduct"("shop", "productId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
