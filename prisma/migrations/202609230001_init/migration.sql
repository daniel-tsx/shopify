-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "InstallationStatus" AS ENUM ('INSTALLED', 'UNINSTALLED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('BULK_PRODUCTS', 'BULK_ORDERS', 'WEBHOOK_PRODUCT', 'WEBHOOK_ORDER', 'WEBHOOK_PRODUCT_DELETE', 'WEBHOOK_UNINSTALL', 'WEBHOOK_SCOPES', 'WEBHOOK_CUSTOMER_DATA_REQUEST', 'WEBHOOK_CUSTOMER_REDACT', 'WEBHOOK_SHOP_REDACT');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "domain" TEXT NOT NULL,
    "installationStatus" "InstallationStatus" NOT NULL DEFAULT 'INSTALLED',
    "grantedScopes" TEXT NOT NULL DEFAULT '',
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("domain")
);

-- CreateTable
CREATE TABLE "ProductMirror" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "shopifyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "vendor" TEXT,
    "tags" TEXT[],
    "shopifyUpdatedAt" TIMESTAMP(3) NOT NULL,
    "mirroredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductMirror_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderMirror" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "shopifyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayFinancialStatus" TEXT NOT NULL,
    "displayFulfillmentStatus" TEXT NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL,
    "shopifyUpdatedAt" TIMESTAMP(3) NOT NULL,
    "mirroredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderMirror_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "resourceId" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncJob" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "kind" "JobKind" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resourceId" TEXT,
    "webhookId" TEXT,
    "shopifyBulkOperationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "shopDomain" TEXT NOT NULL,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("shopDomain")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_shop_idx" ON "Session"("shop");

-- CreateIndex
CREATE INDEX "ProductMirror_shopDomain_title_idx" ON "ProductMirror"("shopDomain", "title");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMirror_shopDomain_shopifyId_key" ON "ProductMirror"("shopDomain", "shopifyId");

-- CreateIndex
CREATE INDEX "OrderMirror_shopDomain_processedAt_idx" ON "OrderMirror"("shopDomain", "processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderMirror_shopDomain_shopifyId_key" ON "OrderMirror"("shopDomain", "shopifyId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_shopDomain_receivedAt_idx" ON "WebhookDelivery"("shopDomain", "receivedAt");

-- CreateIndex
CREATE INDEX "SyncJob_status_nextRunAt_idx" ON "SyncJob"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "SyncJob_shopDomain_createdAt_idx" ON "SyncJob"("shopDomain", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_shopDomain_createdAt_idx" ON "AuditLog"("shopDomain", "createdAt");

-- AddForeignKey
ALTER TABLE "ProductMirror" ADD CONSTRAINT "ProductMirror_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop"("domain") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderMirror" ADD CONSTRAINT "OrderMirror_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop"("domain") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop"("domain") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncJob" ADD CONSTRAINT "SyncJob_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop"("domain") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop"("domain") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop"("domain") ON DELETE CASCADE ON UPDATE CASCADE;
