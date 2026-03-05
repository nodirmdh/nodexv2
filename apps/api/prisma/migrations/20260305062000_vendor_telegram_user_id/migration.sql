-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN "telegramUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_telegramUserId_key" ON "Vendor"("telegramUserId");
