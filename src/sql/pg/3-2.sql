ALTER TABLE "L_FULFILLMENTS" DROP COLUMN "FULFILLMENT_DATA";

ALTER TABLE "L_TRANSFER_ADJUSTMENTS"
  ALTER COLUMN "MEMO" TYPE VARCHAR(4000),
  ALTER COLUMN "REJECTION_MESSAGE" TYPE VARCHAR(4000);
