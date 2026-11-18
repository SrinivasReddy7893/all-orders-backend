-- CreateTable
CREATE TABLE "Category" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("key")
);

-- Seed the starting categories (before the foreign key, so existing orders resolve)
INSERT INTO "Category" ("key", "label") VALUES
  ('APPAREL', 'Apparel'), ('FOOD', 'Food'), ('GROCERIES', 'Groceries'), ('GADGETS', 'Gadgets'),
  ('PERSONAL_CARE', 'Beauty & Personal Care'), ('HOME', 'Home'), ('OTHER', 'Other')
ON CONFLICT ("key") DO NOTHING;

-- Any category already used by an order but not in the defaults
INSERT INTO "Category" ("key", "label")
SELECT DISTINCT "category", INITCAP(REPLACE("category", '_', ' ')) FROM "Order"
ON CONFLICT ("key") DO NOTHING;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_category_fkey" FOREIGN KEY ("category") REFERENCES "Category"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
