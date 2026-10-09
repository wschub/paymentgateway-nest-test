-- AlterTable
ALTER TABLE "public"."transactions" ADD COLUMN     "card_brand" TEXT,
ADD COLUMN     "card_last_four" TEXT,
ADD COLUMN     "installments" INTEGER,
ADD COLUMN     "payment_started_at" TIMESTAMP(3);

-- AddCheckConstraint
ALTER TABLE "public"."transactions"
  ADD CONSTRAINT "transactions_card_last_four_format" CHECK ("card_last_four" IS NULL OR "card_last_four" ~ '^[0-9]{4}$'),
  ADD CONSTRAINT "transactions_installments_positive" CHECK ("installments" IS NULL OR "installments" >= 1);

-- CreateIndex
CREATE INDEX "transactions_status_created_at_idx" ON "public"."transactions"("status", "created_at");
