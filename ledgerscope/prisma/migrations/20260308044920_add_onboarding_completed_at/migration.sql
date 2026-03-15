-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR');

-- CreateEnum
CREATE TYPE "TransactionDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "TransactionPurpose" AS ENUM ('PERSONAL', 'BUSINESS', 'SPLIT', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "CashFlowType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER', 'REFUND', 'REIMBURSEMENT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'POSTED', 'REMOVED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('UNREVIEWED', 'REVIEWED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "AssignmentSource" AS ENUM ('PLAID', 'RULE', 'USER', 'OVERRIDE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "BudgetPeriodType" AS ENUM ('MONTHLY');

-- CreateEnum
CREATE TYPE "BudgetAlertType" AS ENUM ('THRESHOLD_80', 'THRESHOLD_100');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ForecastStatus" AS ENUM ('ON_TRACK', 'WATCH', 'OVER_BUDGET', 'BELOW_PACE');

-- CreateEnum
CREATE TYPE "PayFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY', 'IRREGULAR');

-- CreateEnum
CREATE TYPE "IncomeType" AS ENUM ('SALARY_PAYROLL', 'BUSINESS_INCOME', 'TRANSFER', 'REFUND', 'REIMBURSEMENT', 'INTEREST', 'MISC_CREDIT');

-- CreateEnum
CREATE TYPE "WatchMatchType" AS ENUM ('EXACT', 'FUZZY');

-- CreateEnum
CREATE TYPE "WatchMatchStatus" AS ENUM ('NEW', 'ACKNOWLEDGED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('CSV', 'XLSX', 'PDF');

-- CreateEnum
CREATE TYPE "ExportMode" AS ENUM ('SUMMARY_ONLY', 'ITEMIZED_ONLY', 'SUMMARY_AND_ITEMIZED');

-- CreateEnum
CREATE TYPE "ExportScope" AS ENUM ('ALL', 'PERSONAL_ONLY', 'BUSINESS_ONLY');

-- CreateEnum
CREATE TYPE "ExportGroupBy" AS ENUM ('NONE', 'CATEGORY', 'MERCHANT', 'MONTH');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('TRANSACTION', 'BUDGET', 'EXPORT', 'WATCHLIST', 'INCOME', 'SYSTEM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT,
    "onboardingCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "BankConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plaidItemId" TEXT NOT NULL,
    "institutionId" TEXT,
    "institutionName" TEXT,
    "accessTokenEncrypted" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankConnectionId" TEXT NOT NULL,
    "plaidAccountId" TEXT NOT NULL,
    "mask" TEXT,
    "name" TEXT NOT NULL,
    "officialName" TEXT,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "currentBalance" DECIMAL(14,2),
    "availableBalance" DECIMAL(14,2),
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncCursor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankConnectionId" TEXT NOT NULL,
    "cursor" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankConnectionId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'plaid',
    "eventType" TEXT NOT NULL,
    "eventCode" TEXT,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionRaw" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankConnectionId" TEXT,
    "bankAccountId" TEXT,
    "plaidTransactionId" TEXT,
    "payload" JSONB NOT NULL,
    "authorizedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "amount" DECIMAL(14,2),
    "currency" TEXT,
    "isPending" BOOLEAN NOT NULL DEFAULT true,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionRaw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "transactionRawId" TEXT,
    "plaidTransactionId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "authorizedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "direction" "TransactionDirection" NOT NULL,
    "merchantRaw" TEXT,
    "merchantNormalized" TEXT,
    "description" TEXT,
    "categoryPrimary" TEXT,
    "categoryDetailed" TEXT,
    "purpose" "TransactionPurpose" NOT NULL DEFAULT 'UNCERTAIN',
    "cashFlowType" "CashFlowType" NOT NULL DEFAULT 'EXPENSE',
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "isSuspicious" BOOLEAN NOT NULL DEFAULT false,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionSplit" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "personalAmount" DECIMAL(14,2) NOT NULL,
    "businessAmount" DECIMAL(14,2) NOT NULL,
    "splitMethod" TEXT NOT NULL,
    "personalPercent" DECIMAL(5,2),
    "businessPercent" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionSplit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionNote" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionFlag" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "flagType" TEXT NOT NULL DEFAULT 'suspicious',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentKey" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionCategoryAssignment" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT,
    "categoryKey" TEXT,
    "source" "AssignmentSource" NOT NULL DEFAULT 'SYSTEM',
    "confidence" DECIMAL(5,2),
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionCategoryAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionPurposeAssignment" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "TransactionPurpose" NOT NULL,
    "source" "AssignmentSource" NOT NULL DEFAULT 'SYSTEM',
    "confidence" DECIMAL(5,2),
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionPurposeAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "merchantPattern" TEXT NOT NULL,
    "normalizedMerchant" TEXT,
    "categoryId" TEXT,
    "categoryKey" TEXT,
    "purpose" "TransactionPurpose",
    "cashFlowType" "CashFlowType",
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryOverrideRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "merchantPattern" TEXT,
    "descriptionPattern" TEXT,
    "amountMin" DECIMAL(14,2),
    "amountMax" DECIMAL(14,2),
    "categoryFromKey" TEXT,
    "categoryToKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryOverrideRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurposeOverrideRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "merchantPattern" TEXT,
    "descriptionPattern" TEXT,
    "amountMin" DECIMAL(14,2),
    "amountMax" DECIMAL(14,2),
    "purposeTo" "TransactionPurpose" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurposeOverrideRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT,
    "categoryKey" TEXT,
    "name" TEXT NOT NULL,
    "periodType" "BudgetPeriodType" NOT NULL DEFAULT 'MONTHLY',
    "amount" DECIMAL(14,2) NOT NULL,
    "alert80Enabled" BOOLEAN NOT NULL DEFAULT true,
    "alert100Enabled" BOOLEAN NOT NULL DEFAULT true,
    "rolloverEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetPeriod" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "actualSpend" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pendingSpend" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "projectedSpend" DECIMAL(14,2),
    "remainingBudget" DECIMAL(14,2),
    "progressPercent" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetAlert" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "budgetPeriodId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "BudgetAlertType" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "message" TEXT,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "BudgetAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "merchantRaw" TEXT NOT NULL,
    "merchantNormalized" TEXT NOT NULL,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "totalSpend" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalIncome" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionCandidate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "merchantProfileId" TEXT,
    "merchantName" TEXT NOT NULL,
    "estimatedAmount" DECIMAL(14,2),
    "cadenceDays" INTEGER,
    "confidenceScore" DECIMAL(5,2),
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpendingInsight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "insightType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "metricValue" DECIMAL(14,2),
    "trendDirection" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpendingInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsOpportunity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "monthlySavingsEst" DECIMAL(14,2),
    "confidenceScore" DECIMAL(5,2),
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavingsOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "categoryId" TEXT,
    "categoryKey" TEXT,
    "actualSpent" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pendingSpent" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "projectedSpent" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "budgetAmount" DECIMAL(14,2),
    "projectedIncome" DECIMAL(14,2),
    "projectedNetCashFlow" DECIMAL(14,2),
    "status" "ForecastStatus" NOT NULL DEFAULT 'ON_TRACK',
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForecastSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employerProfileId" TEXT,
    "sourceType" "IncomeType" NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nameRaw" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "payrollProcessor" TEXT,
    "payFrequency" "PayFrequency",
    "averageNetAmount" DECIMAL(14,2),
    "lastPayDate" TIMESTAMP(3),
    "nextExpectedPayDate" TIMESTAMP(3),
    "confidenceScore" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeSchedule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employerProfileId" TEXT,
    "payFrequency" "PayFrequency" NOT NULL,
    "typicalAmount" DECIMAL(14,2),
    "amountMin" DECIMAL(14,2),
    "amountMax" DECIMAL(14,2),
    "weekday" INTEGER,
    "dayOfMonth" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomeSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomePrediction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employerProfileId" TEXT,
    "expectedDate" TIMESTAMP(3) NOT NULL,
    "expectedAmount" DECIMAL(14,2),
    "confidenceScore" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomePrediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employerProfileId" TEXT,
    "alertType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomeAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdFromTransactionId" TEXT,
    "categoryId" TEXT,
    "categoryKey" TEXT,
    "merchantPattern" TEXT NOT NULL,
    "amountMin" DECIMAL(14,2),
    "amountMax" DECIMAL(14,2),
    "matchType" "WatchMatchType" NOT NULL DEFAULT 'FUZZY',
    "accountContextId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchMatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "watchRuleId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "similarityScore" DECIMAL(5,2),
    "status" "WatchMatchStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "mode" "ExportMode" NOT NULL,
    "scope" "ExportScope" NOT NULL,
    "groupBy" "ExportGroupBy" NOT NULL DEFAULT 'NONE',
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "filePath" TEXT,
    "rowCount" INTEGER,
    "totalAmount" DECIMAL(14,2),
    "status" "ExportStatus" NOT NULL DEFAULT 'QUEUED',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ExportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "BankConnection_plaidItemId_key" ON "BankConnection"("plaidItemId");

-- CreateIndex
CREATE INDEX "BankConnection_userId_idx" ON "BankConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_plaidAccountId_key" ON "BankAccount"("plaidAccountId");

-- CreateIndex
CREATE INDEX "BankAccount_userId_idx" ON "BankAccount"("userId");

-- CreateIndex
CREATE INDEX "BankAccount_bankConnectionId_idx" ON "BankAccount"("bankConnectionId");

-- CreateIndex
CREATE INDEX "SyncCursor_userId_idx" ON "SyncCursor"("userId");

-- CreateIndex
CREATE INDEX "SyncCursor_bankConnectionId_syncedAt_idx" ON "SyncCursor"("bankConnectionId", "syncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SyncCursor_bankConnectionId_cursor_key" ON "SyncCursor"("bankConnectionId", "cursor");

-- CreateIndex
CREATE INDEX "WebhookEvent_userId_createdAt_idx" ON "WebhookEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_bankConnectionId_idx" ON "WebhookEvent"("bankConnectionId");

-- CreateIndex
CREATE INDEX "TransactionRaw_userId_importedAt_idx" ON "TransactionRaw"("userId", "importedAt");

-- CreateIndex
CREATE INDEX "TransactionRaw_bankConnectionId_idx" ON "TransactionRaw"("bankConnectionId");

-- CreateIndex
CREATE INDEX "TransactionRaw_bankAccountId_idx" ON "TransactionRaw"("bankAccountId");

-- CreateIndex
CREATE INDEX "TransactionRaw_plaidTransactionId_idx" ON "TransactionRaw"("plaidTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_transactionRawId_key" ON "Transaction"("transactionRawId");

-- CreateIndex
CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", "date");

-- CreateIndex
CREATE INDEX "Transaction_bankAccountId_date_idx" ON "Transaction"("bankAccountId", "date");

-- CreateIndex
CREATE INDEX "Transaction_plaidTransactionId_idx" ON "Transaction"("plaidTransactionId");

-- CreateIndex
CREATE INDEX "Transaction_purpose_idx" ON "Transaction"("purpose");

-- CreateIndex
CREATE INDEX "Transaction_cashFlowType_idx" ON "Transaction"("cashFlowType");

-- CreateIndex
CREATE INDEX "Transaction_reviewStatus_idx" ON "Transaction"("reviewStatus");

-- CreateIndex
CREATE INDEX "TransactionSplit_transactionId_idx" ON "TransactionSplit"("transactionId");

-- CreateIndex
CREATE INDEX "TransactionNote_transactionId_idx" ON "TransactionNote"("transactionId");

-- CreateIndex
CREATE INDEX "TransactionNote_userId_idx" ON "TransactionNote"("userId");

-- CreateIndex
CREATE INDEX "TransactionFlag_transactionId_idx" ON "TransactionFlag"("transactionId");

-- CreateIndex
CREATE INDEX "TransactionFlag_userId_flagType_idx" ON "TransactionFlag"("userId", "flagType");

-- CreateIndex
CREATE INDEX "Category_key_idx" ON "Category"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_key_key" ON "Category"("userId", "key");

-- CreateIndex
CREATE INDEX "TransactionCategoryAssignment_transactionId_isCurrent_idx" ON "TransactionCategoryAssignment"("transactionId", "isCurrent");

-- CreateIndex
CREATE INDEX "TransactionCategoryAssignment_userId_createdAt_idx" ON "TransactionCategoryAssignment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TransactionCategoryAssignment_categoryId_idx" ON "TransactionCategoryAssignment"("categoryId");

-- CreateIndex
CREATE INDEX "TransactionPurposeAssignment_transactionId_isCurrent_idx" ON "TransactionPurposeAssignment"("transactionId", "isCurrent");

-- CreateIndex
CREATE INDEX "TransactionPurposeAssignment_userId_createdAt_idx" ON "TransactionPurposeAssignment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MerchantRule_userId_isActive_idx" ON "MerchantRule"("userId", "isActive");

-- CreateIndex
CREATE INDEX "MerchantRule_categoryId_idx" ON "MerchantRule"("categoryId");

-- CreateIndex
CREATE INDEX "CategoryOverrideRule_userId_isActive_idx" ON "CategoryOverrideRule"("userId", "isActive");

-- CreateIndex
CREATE INDEX "PurposeOverrideRule_userId_isActive_idx" ON "PurposeOverrideRule"("userId", "isActive");

-- CreateIndex
CREATE INDEX "Budget_userId_isActive_idx" ON "Budget"("userId", "isActive");

-- CreateIndex
CREATE INDEX "Budget_categoryId_idx" ON "Budget"("categoryId");

-- CreateIndex
CREATE INDEX "BudgetPeriod_userId_periodStart_periodEnd_idx" ON "BudgetPeriod"("userId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetPeriod_budgetId_periodStart_periodEnd_key" ON "BudgetPeriod"("budgetId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "BudgetAlert_budgetId_type_status_idx" ON "BudgetAlert"("budgetId", "type", "status");

-- CreateIndex
CREATE INDEX "BudgetAlert_userId_triggeredAt_idx" ON "BudgetAlert"("userId", "triggeredAt");

-- CreateIndex
CREATE INDEX "MerchantProfile_userId_lastSeenAt_idx" ON "MerchantProfile"("userId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantProfile_userId_merchantNormalized_key" ON "MerchantProfile"("userId", "merchantNormalized");

-- CreateIndex
CREATE INDEX "SubscriptionCandidate_userId_confidenceScore_idx" ON "SubscriptionCandidate"("userId", "confidenceScore");

-- CreateIndex
CREATE INDEX "SubscriptionCandidate_merchantProfileId_idx" ON "SubscriptionCandidate"("merchantProfileId");

-- CreateIndex
CREATE INDEX "SpendingInsight_userId_createdAt_idx" ON "SpendingInsight"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SavingsOpportunity_userId_status_idx" ON "SavingsOpportunity"("userId", "status");

-- CreateIndex
CREATE INDEX "ForecastSnapshot_userId_periodStart_periodEnd_idx" ON "ForecastSnapshot"("userId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "ForecastSnapshot_categoryId_idx" ON "ForecastSnapshot"("categoryId");

-- CreateIndex
CREATE INDEX "IncomeSource_userId_sourceType_idx" ON "IncomeSource"("userId", "sourceType");

-- CreateIndex
CREATE INDEX "IncomeSource_employerProfileId_idx" ON "IncomeSource"("employerProfileId");

-- CreateIndex
CREATE INDEX "EmployerProfile_userId_nextExpectedPayDate_idx" ON "EmployerProfile"("userId", "nextExpectedPayDate");

-- CreateIndex
CREATE UNIQUE INDEX "EmployerProfile_userId_nameNormalized_key" ON "EmployerProfile"("userId", "nameNormalized");

-- CreateIndex
CREATE INDEX "IncomeSchedule_userId_isActive_idx" ON "IncomeSchedule"("userId", "isActive");

-- CreateIndex
CREATE INDEX "IncomeSchedule_employerProfileId_idx" ON "IncomeSchedule"("employerProfileId");

-- CreateIndex
CREATE INDEX "IncomePrediction_userId_expectedDate_idx" ON "IncomePrediction"("userId", "expectedDate");

-- CreateIndex
CREATE INDEX "IncomePrediction_employerProfileId_idx" ON "IncomePrediction"("employerProfileId");

-- CreateIndex
CREATE INDEX "IncomeAlert_userId_status_triggeredAt_idx" ON "IncomeAlert"("userId", "status", "triggeredAt");

-- CreateIndex
CREATE INDEX "IncomeAlert_employerProfileId_idx" ON "IncomeAlert"("employerProfileId");

-- CreateIndex
CREATE INDEX "WatchRule_userId_isActive_idx" ON "WatchRule"("userId", "isActive");

-- CreateIndex
CREATE INDEX "WatchRule_createdFromTransactionId_idx" ON "WatchRule"("createdFromTransactionId");

-- CreateIndex
CREATE INDEX "WatchRule_categoryId_idx" ON "WatchRule"("categoryId");

-- CreateIndex
CREATE INDEX "WatchMatch_userId_status_createdAt_idx" ON "WatchMatch"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "WatchMatch_transactionId_idx" ON "WatchMatch"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "WatchMatch_watchRuleId_transactionId_key" ON "WatchMatch"("watchRuleId", "transactionId");

-- CreateIndex
CREATE INDEX "ExportRun_userId_createdAt_idx" ON "ExportRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ExportRun_status_idx" ON "ExportRun"("status");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankConnection" ADD CONSTRAINT "BankConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_bankConnectionId_fkey" FOREIGN KEY ("bankConnectionId") REFERENCES "BankConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncCursor" ADD CONSTRAINT "SyncCursor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncCursor" ADD CONSTRAINT "SyncCursor_bankConnectionId_fkey" FOREIGN KEY ("bankConnectionId") REFERENCES "BankConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_bankConnectionId_fkey" FOREIGN KEY ("bankConnectionId") REFERENCES "BankConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionRaw" ADD CONSTRAINT "TransactionRaw_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionRaw" ADD CONSTRAINT "TransactionRaw_bankConnectionId_fkey" FOREIGN KEY ("bankConnectionId") REFERENCES "BankConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionRaw" ADD CONSTRAINT "TransactionRaw_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_transactionRawId_fkey" FOREIGN KEY ("transactionRawId") REFERENCES "TransactionRaw"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionSplit" ADD CONSTRAINT "TransactionSplit_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionNote" ADD CONSTRAINT "TransactionNote_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionNote" ADD CONSTRAINT "TransactionNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionFlag" ADD CONSTRAINT "TransactionFlag_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionFlag" ADD CONSTRAINT "TransactionFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCategoryAssignment" ADD CONSTRAINT "TransactionCategoryAssignment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCategoryAssignment" ADD CONSTRAINT "TransactionCategoryAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCategoryAssignment" ADD CONSTRAINT "TransactionCategoryAssignment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionPurposeAssignment" ADD CONSTRAINT "TransactionPurposeAssignment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionPurposeAssignment" ADD CONSTRAINT "TransactionPurposeAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantRule" ADD CONSTRAINT "MerchantRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantRule" ADD CONSTRAINT "MerchantRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryOverrideRule" ADD CONSTRAINT "CategoryOverrideRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurposeOverrideRule" ADD CONSTRAINT "PurposeOverrideRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetPeriod" ADD CONSTRAINT "BudgetPeriod_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetPeriod" ADD CONSTRAINT "BudgetPeriod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAlert" ADD CONSTRAINT "BudgetAlert_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAlert" ADD CONSTRAINT "BudgetAlert_budgetPeriodId_fkey" FOREIGN KEY ("budgetPeriodId") REFERENCES "BudgetPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAlert" ADD CONSTRAINT "BudgetAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantProfile" ADD CONSTRAINT "MerchantProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionCandidate" ADD CONSTRAINT "SubscriptionCandidate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionCandidate" ADD CONSTRAINT "SubscriptionCandidate_merchantProfileId_fkey" FOREIGN KEY ("merchantProfileId") REFERENCES "MerchantProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpendingInsight" ADD CONSTRAINT "SpendingInsight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsOpportunity" ADD CONSTRAINT "SavingsOpportunity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastSnapshot" ADD CONSTRAINT "ForecastSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastSnapshot" ADD CONSTRAINT "ForecastSnapshot_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeSource" ADD CONSTRAINT "IncomeSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeSource" ADD CONSTRAINT "IncomeSource_employerProfileId_fkey" FOREIGN KEY ("employerProfileId") REFERENCES "EmployerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployerProfile" ADD CONSTRAINT "EmployerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeSchedule" ADD CONSTRAINT "IncomeSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeSchedule" ADD CONSTRAINT "IncomeSchedule_employerProfileId_fkey" FOREIGN KEY ("employerProfileId") REFERENCES "EmployerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomePrediction" ADD CONSTRAINT "IncomePrediction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomePrediction" ADD CONSTRAINT "IncomePrediction_employerProfileId_fkey" FOREIGN KEY ("employerProfileId") REFERENCES "EmployerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeAlert" ADD CONSTRAINT "IncomeAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeAlert" ADD CONSTRAINT "IncomeAlert_employerProfileId_fkey" FOREIGN KEY ("employerProfileId") REFERENCES "EmployerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchRule" ADD CONSTRAINT "WatchRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchRule" ADD CONSTRAINT "WatchRule_createdFromTransactionId_fkey" FOREIGN KEY ("createdFromTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchRule" ADD CONSTRAINT "WatchRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchMatch" ADD CONSTRAINT "WatchMatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchMatch" ADD CONSTRAINT "WatchMatch_watchRuleId_fkey" FOREIGN KEY ("watchRuleId") REFERENCES "WatchRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchMatch" ADD CONSTRAINT "WatchMatch_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportRun" ADD CONSTRAINT "ExportRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
