import { prisma } from "@/lib/db/prisma";

export type FinancialResetSummary = {
  bankConnectionsDeleted: number;
  transactionsDeleted: number;
  budgetsDeleted: number;
  statementImportsDeleted: number;
  watchRulesDeleted: number;
  exportsDeleted: number;
  insightsDeleted: number;
};

export async function resetFinancialDataInPrisma(userId: string): Promise<FinancialResetSummary> {
  return prisma.$transaction(async (tx) => {
    const [
      bankConnectionsDeleted,
      transactionsDeleted,
      budgetsDeleted,
      statementImportsDeleted,
      watchRulesDeleted,
      exportsDeleted,
      spendingInsightsDeleted,
      savingsOpportunitiesDeleted,
    ] = await Promise.all([
      tx.bankConnection.count({ where: { userId } }),
      tx.transaction.count({ where: { userId } }),
      tx.budget.count({ where: { userId } }),
      tx.statementImport.count({ where: { userId } }),
      tx.watchRule.count({ where: { userId } }),
      tx.exportRun.count({ where: { userId } }),
      tx.spendingInsight.count({ where: { userId } }),
      tx.savingsOpportunity.count({ where: { userId } }),
    ]);

    await tx.auditLog.deleteMany({ where: { userId } });
    await tx.statementImport.deleteMany({ where: { userId } });
    await tx.exportRun.deleteMany({ where: { userId } });
    await tx.watchMatch.deleteMany({ where: { userId } });
    await tx.watchRule.deleteMany({ where: { userId } });
    await tx.incomeAlert.deleteMany({ where: { userId } });
    await tx.incomePrediction.deleteMany({ where: { userId } });
    await tx.incomeSchedule.deleteMany({ where: { userId } });
    await tx.incomeSource.deleteMany({ where: { userId } });
    await tx.employerProfile.deleteMany({ where: { userId } });
    await tx.forecastSnapshot.deleteMany({ where: { userId } });
    await tx.savingsOpportunity.deleteMany({ where: { userId } });
    await tx.spendingInsight.deleteMany({ where: { userId } });
    await tx.subscriptionCandidate.deleteMany({ where: { userId } });
    await tx.merchantProfile.deleteMany({ where: { userId } });
    await tx.merchantRule.deleteMany({ where: { userId } });
    await tx.categoryOverrideRule.deleteMany({ where: { userId } });
    await tx.purposeOverrideRule.deleteMany({ where: { userId } });
    await tx.budget.deleteMany({ where: { userId } });
    await tx.category.deleteMany({ where: { userId } });
    await tx.transaction.deleteMany({ where: { userId } });
    await tx.transactionRaw.deleteMany({ where: { userId } });
    await tx.syncCursor.deleteMany({ where: { userId } });
    await tx.webhookEvent.deleteMany({ where: { userId } });
    await tx.bankConnection.deleteMany({ where: { userId } });

    return {
      bankConnectionsDeleted,
      transactionsDeleted,
      budgetsDeleted,
      statementImportsDeleted,
      watchRulesDeleted,
      exportsDeleted,
      insightsDeleted: spendingInsightsDeleted + savingsOpportunitiesDeleted,
    };
  });
}
