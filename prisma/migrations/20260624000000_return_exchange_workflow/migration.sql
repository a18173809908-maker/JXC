ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'INITIAL_STOCK';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'SALES_RETURN';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'EXCHANGE_IN';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'EXCHANGE_OUT';

DO $$ BEGIN
  CREATE TYPE "BatchSource" AS ENUM ('PURCHASE', 'INITIAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "OutboundStatus" AS ENUM ('DRAFT', 'CONFIRMED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReturnStatus" AS ENUM ('PENDING', 'RECEIVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ExchangeInboundStatus" AS ENUM ('PENDING', 'RECEIVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ExchangeOutboundStatus" AS ENUM ('PENDING', 'SHIPPED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Product" ALTER COLUMN "unit" SET DEFAULT '包';
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SalesOrderItem" ADD COLUMN IF NOT EXISTS "validDeliveryDate" TIMESTAMP(3);
ALTER TABLE "OutboundOrder" ADD COLUMN IF NOT EXISTS "status" "OutboundStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "StockBatch" ADD COLUMN IF NOT EXISTS "sourceType" "BatchSource" NOT NULL DEFAULT 'PURCHASE';

CREATE TABLE IF NOT EXISTS "ReturnOrder" (
  "id" TEXT NOT NULL,
  "returnNo" TEXT NOT NULL,
  "outboundOrderId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "returnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "ReturnStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT NOT NULL,
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReturnOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ReturnOrderItem" (
  "id" TEXT NOT NULL,
  "returnOrderId" TEXT NOT NULL,
  "outboundOrderItemId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "stockBatchId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  CONSTRAINT "ReturnOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProductExternalCode" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "externalCode" TEXT NOT NULL,
  "externalName" TEXT,
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductExternalCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ExchangeOrder" (
  "id" TEXT NOT NULL,
  "exchangeNo" TEXT NOT NULL,
  "salesOrderId" TEXT,
  "customerId" TEXT NOT NULL,
  "exchangeDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "inboundStatus" "ExchangeInboundStatus" NOT NULL DEFAULT 'PENDING',
  "outboundStatus" "ExchangeOutboundStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT NOT NULL,
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExchangeOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ExchangeReturnItem" (
  "id" TEXT NOT NULL,
  "exchangeOrderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "stockBatchId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  CONSTRAINT "ExchangeReturnItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ExchangeOutItem" (
  "id" TEXT NOT NULL,
  "exchangeOrderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "stockBatchId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
  CONSTRAINT "ExchangeOutItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReturnOrder_returnNo_key" ON "ReturnOrder"("returnNo");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductExternalCode_customerId_externalCode_key" ON "ProductExternalCode"("customerId", "externalCode");
CREATE INDEX IF NOT EXISTS "ProductExternalCode_productId_idx" ON "ProductExternalCode"("productId");
CREATE UNIQUE INDEX IF NOT EXISTS "ExchangeOrder_exchangeNo_key" ON "ExchangeOrder"("exchangeNo");
CREATE INDEX IF NOT EXISTS "ExchangeReturnItem_exchangeOrderId_idx" ON "ExchangeReturnItem"("exchangeOrderId");
CREATE INDEX IF NOT EXISTS "ExchangeOutItem_exchangeOrderId_idx" ON "ExchangeOutItem"("exchangeOrderId");

DO $$ BEGIN
  ALTER TABLE "ReturnOrder" ADD CONSTRAINT "ReturnOrder_outboundOrderId_fkey" FOREIGN KEY ("outboundOrderId") REFERENCES "OutboundOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ReturnOrder" ADD CONSTRAINT "ReturnOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ReturnOrderItem" ADD CONSTRAINT "ReturnOrderItem_returnOrderId_fkey" FOREIGN KEY ("returnOrderId") REFERENCES "ReturnOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ReturnOrderItem" ADD CONSTRAINT "ReturnOrderItem_outboundOrderItemId_fkey" FOREIGN KEY ("outboundOrderItemId") REFERENCES "OutboundOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ReturnOrderItem" ADD CONSTRAINT "ReturnOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ReturnOrderItem" ADD CONSTRAINT "ReturnOrderItem_stockBatchId_fkey" FOREIGN KEY ("stockBatchId") REFERENCES "StockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ProductExternalCode" ADD CONSTRAINT "ProductExternalCode_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ProductExternalCode" ADD CONSTRAINT "ProductExternalCode_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ExchangeOrder" ADD CONSTRAINT "ExchangeOrder_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ExchangeOrder" ADD CONSTRAINT "ExchangeOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ExchangeReturnItem" ADD CONSTRAINT "ExchangeReturnItem_exchangeOrderId_fkey" FOREIGN KEY ("exchangeOrderId") REFERENCES "ExchangeOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ExchangeReturnItem" ADD CONSTRAINT "ExchangeReturnItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ExchangeReturnItem" ADD CONSTRAINT "ExchangeReturnItem_stockBatchId_fkey" FOREIGN KEY ("stockBatchId") REFERENCES "StockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ExchangeOutItem" ADD CONSTRAINT "ExchangeOutItem_exchangeOrderId_fkey" FOREIGN KEY ("exchangeOrderId") REFERENCES "ExchangeOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ExchangeOutItem" ADD CONSTRAINT "ExchangeOutItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ExchangeOutItem" ADD CONSTRAINT "ExchangeOutItem_stockBatchId_fkey" FOREIGN KEY ("stockBatchId") REFERENCES "StockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

UPDATE "ReturnOrder" SET "status" = 'RECEIVED';
UPDATE "ExchangeOrder" SET "inboundStatus" = 'RECEIVED', "outboundStatus" = 'SHIPPED';
