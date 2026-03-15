import { CashFlowType, Prisma, TransactionStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getSmartInsightsFromPrisma } from "@/lib/db/smart-insights-store";
import { getLatestMortgageRates } from "@/lib/services/mortgage-rates";
import type {
  ExpenseTag,
  InsightsData,
  RecurringChargeItem,
  TripCategoryBreakdown,
  TripProjection,
  TripSummary,
  TripTransactionItem,
} from "@/types/contracts";

const TRIP_TAGS: ExpenseTag[] = ["vacation", "holiday", "business trip"];
const TAG_PREFIX = "TAG:";
const CUSTOM_TAG_PREFIX = "CUSTOM_TAG:";
const TRIP_ASSIGN_PREFIX = "trip:";

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value.toString());
}

function extractTags(notes: { note: string }[]): ExpenseTag[] {
  const tags = notes
    .map((n) => n.note)
    .filter((note) => note.startsWith(TAG_PREFIX))
    .map((note) => note.slice(TAG_PREFIX.length).trim().toLowerCase() as ExpenseTag)
    .filter((tag) =>
      TRIP_TAGS.includes(tag) ||
      tag === "medical" ||
      tag === "home repair" ||
      tag === "wedding" ||
      tag === "one-time event",
    );

  return [...new Set(tags)];
}

function extractCustomTags(notes: { note: string }[]): string[] {
  const tags = notes
    .map((n) => n.note)
    .filter((note) => note.startsWith(CUSTOM_TAG_PREFIX))
    .map((note) => note.slice(CUSTOM_TAG_PREFIX.length).trim())
    .filter((tag) => tag.length > 0);

  return [...new Set(tags)];
}

function normalizeTripId(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9:_-]/g, "");
}

function extractTripAssignment(customTags: string[]): string | null {
  const raw = customTags.find((tag) => tag.toLowerCase().startsWith(TRIP_ASSIGN_PREFIX));
  if (!raw) return null;

  const id = normalizeTripId(raw.slice(TRIP_ASSIGN_PREFIX.length));
  return id.length > 0 ? id : null;
}

function defaultTripId(tag: "vacation" | "holiday" | "business trip", date: Date): string {
  const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${tag.replace(" ", "_")}:${month}`;
}

function tripTypeFromId(id: string): "vacation" | "holiday" | "business trip" {
  if (id.startsWith("holiday")) return "holiday";
  if (id.startsWith("business_trip")) return "business trip";
  return "vacation";
}

function labelFromTripId(id: string): string {
  const [rawType, suffix] = id.split(":");
  const typeLabel = (rawType ?? "trip")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (x) => x.toUpperCase());

  if (!suffix) return typeLabel;
  if (/^\d{4}-\d{2}$/.test(suffix)) return `${typeLabel} ${suffix}`;

  return `${typeLabel} ${suffix.replaceAll("_", " ")}`;
}

function daysBetween(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.floor(ms / (1000 * 60 * 60 * 24)) + 1);
}


type Frequency = "weekly" | "biweekly" | "monthly" | "irregular";

function inferFrequency(intervalDays: number): Frequency {
  if (intervalDays <= 9) return "weekly";
  if (intervalDays <= 18) return "biweekly";
  if (intervalDays <= 40) return "monthly";
  return "irregular";
}

function monthlyFactor(frequency: Frequency) {
  if (frequency === "weekly") return 4.33;
  if (frequency === "biweekly") return 2.17;
  if (frequency === "monthly") return 1;
  return 1;
}type GroupedTrip = {
  tripId: string;
  tripType: "vacation" | "holiday" | "business trip";
  start: Date;
  end: Date;
  total: number;
  categoryMap: Map<string, number>;
  transactions: TripTransactionItem[];
};

export async function getInsightsDataFromPrisma(userId: string): Promise<InsightsData> {
  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      status: { not: TransactionStatus.REMOVED },
      cashFlowType: CashFlowType.EXPENSE,
    },
    include: {
      notes: { select: { note: true } },
    },
    orderBy: { date: "desc" },
  });

  const grouped = new Map<string, GroupedTrip>();

  for (const row of rows) {
    const tags = extractTags(row.notes);
    const tripTag = tags.find((tag): tag is "vacation" | "holiday" | "business trip" => TRIP_TAGS.includes(tag));
    const customTags = extractCustomTags(row.notes);
    const assignedTripId = extractTripAssignment(customTags);

    if (!tripTag && !assignedTripId) continue;

    const resolvedTripType = tripTag ?? tripTypeFromId(assignedTripId ?? "vacation");
    const tripId = assignedTripId ?? defaultTripId(resolvedTripType, row.date);

    const current = grouped.get(tripId) ?? {
      tripId,
      tripType: resolvedTripType,
      start: row.date,
      end: row.date,
      total: 0,
      categoryMap: new Map<string, number>(),
      transactions: [],
    };

    if (row.date < current.start) current.start = row.date;
    if (row.date > current.end) current.end = row.date;

    const amount = toNumber(row.amount);
    current.total += amount;

    const category = row.categoryPrimary ?? "Uncategorized";
    current.categoryMap.set(category, (current.categoryMap.get(category) ?? 0) + amount);

    current.transactions.push({
      id: row.id,
      date: row.date.toISOString().slice(0, 10),
      merchant: row.merchantRaw ?? row.merchantNormalized ?? "Unknown merchant",
      category,
      amount: Number(amount.toFixed(2)),
    });

    grouped.set(tripId, current);
  }

  const recurringCandidatesMap = new Map<string, { merchant: string; dates: Date[]; amounts: number[] }>();

  for (const row of rows) {
    const merchant = row.merchantRaw ?? row.merchantNormalized ?? "Unknown merchant";
    const amount = toNumber(row.amount);
    const current = recurringCandidatesMap.get(merchant) ?? { merchant, dates: [], amounts: [] };
    current.dates.push(row.date);
    current.amounts.push(amount);
    recurringCandidatesMap.set(merchant, current);
  }

  const recurringCharges: RecurringChargeItem[] = [...recurringCandidatesMap.values()]
    .filter((candidate) => candidate.dates.length >= 2)
    .map((candidate) => {
      const sortedDates = candidate.dates.slice().sort((a, b) => a.getTime() - b.getTime());
      const intervals: number[] = [];
      for (let i = 1; i < sortedDates.length; i += 1) {
        intervals.push((sortedDates[i].getTime() - sortedDates[i - 1].getTime()) / (1000 * 60 * 60 * 24));
      }

      const avgInterval = intervals.length > 0 ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : 30;
      const frequency = inferFrequency(avgInterval);
      const avgAmount = candidate.amounts.reduce((sum, value) => sum + value, 0) / candidate.amounts.length;
      const estimatedMonthlyCost = Number((avgAmount * monthlyFactor(frequency)).toFixed(2));

      return {
        merchant: candidate.merchant,
        estimatedFrequency: frequency,
        estimatedMonthlyCost,
        recentChargeCount: candidate.dates.length,
      };
    })
    .sort((a, b) => b.estimatedMonthlyCost - a.estimatedMonthlyCost)
    .slice(0, 8);

  const totalRecurringMonthlyCost = recurringCharges.reduce((sum, item) => sum + item.estimatedMonthlyCost, 0);
  const recurringChargesSummary =
    recurringCharges.length > 0
      ? `You spend about $${totalRecurringMonthlyCost.toFixed(2)}/month on recurring charges.`
      : "No likely recurring charges detected yet from synced transactions.";
  const tripSummaries: TripSummary[] = [...grouped.values()]
    .map((value) => {
      const days = daysBetween(value.start, value.end);
      const travelers = 1;
      const categoryBreakdown: TripCategoryBreakdown[] = [...value.categoryMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([category, amount]) => ({ category, amount: Number(amount.toFixed(2)) }));

      const transactions = value.transactions
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : -1));

      return {
        id: value.tripId,
        tripLabel: labelFromTripId(value.tripId),
        tripType: value.tripType,
        startDate: value.start.toISOString().slice(0, 10),
        endDate: value.end.toISOString().slice(0, 10),
        totalTripCost: Number(value.total.toFixed(2)),
        days,
        travelers,
        costPerDay: Number((value.total / days).toFixed(2)),
        costPerTraveler: Number((value.total / travelers).toFixed(2)),
        categoryBreakdown,
        transactions,
      };
    })
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));

  const baselineAverageTripCost =
    tripSummaries.length > 0
      ? Number((tripSummaries.reduce((sum, trip) => sum + trip.totalTripCost, 0) / tripSummaries.length).toFixed(2))
      : 0;

  const recentTrip = tripSummaries[0];
  const baseCostPerTravelerDay =
    tripSummaries.length > 0
      ? Number(
          (
            tripSummaries.reduce(
              (sum, trip) => sum + trip.totalTripCost / Math.max(1, trip.days * trip.travelers),
              0,
            ) / tripSummaries.length
          ).toFixed(2),
        )
      : 0;

  const defaultDays = 7;
  const defaultTravelers = 2;
  const expectedTotal = Number((baseCostPerTravelerDay * defaultDays * defaultTravelers).toFixed(2));
  const lowEstimate = Number((expectedTotal * 0.85).toFixed(2));
  const highEstimate = Number((expectedTotal * 1.2).toFixed(2));

  const baselineProjection: TripProjection = {
    priorTripTotal: recentTrip?.totalTripCost ?? 0,
    priorTripCostPerDay: recentTrip?.costPerDay ?? 0,
    expectedTotal,
    lowEstimate,
    highEstimate,
    expectedCostPerDay: defaultDays > 0 ? Number((expectedTotal / defaultDays).toFixed(2)) : 0,
    expectedCostPerTraveler: defaultTravelers > 0 ? Number((expectedTotal / defaultTravelers).toFixed(2)) : 0,
    baseCostPerTravelerDay,
    baselineAverageTripCost,
    assumptions: [
      "Expected estimate uses average historical cost per traveler-day from tagged trips.",
      "Low estimate is 15% below expected and high estimate is 20% above expected.",
      "Projection scales linearly by trip length and traveler count.",
    ],
  };

  const [mortgageRates, smartInsights] = await Promise.all([
    getLatestMortgageRates(),
    getSmartInsightsFromPrisma(userId),
  ]);

  return {
    title: "Insights & Planning",
    description: "Analyze travel spending patterns and plan future trips with market context.",
    selectedRange: "Last 12 months",
    actions: [
      { label: "Recalculate", variant: "primary" },
      { label: "Export", variant: "secondary" },
    ],
    smartInsights,
    recurringCharges,
    recurringChargesSummary,
    tripSummaries,
    projectionDefaults: {
      days: 7,
      travelers: 2,
    },
    projectionBaseline: baselineProjection,
    mortgageRates,
  };
}

export async function setTripAssignmentInPrisma(userId: string, transactionId: string, tripId: string | null): Promise<boolean> {
  const tx = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
    select: { id: true },
  });

  if (!tx) return false;

  await prisma.transactionNote.deleteMany({
    where: {
      transactionId,
      userId,
      note: { startsWith: `${CUSTOM_TAG_PREFIX}${TRIP_ASSIGN_PREFIX}` },
    },
  });

  const normalized = tripId ? normalizeTripId(tripId) : "";
  if (normalized.length > 0) {
    await prisma.transactionNote.create({
      data: {
        transactionId,
        userId,
        note: `${CUSTOM_TAG_PREFIX}${TRIP_ASSIGN_PREFIX}${normalized}`,
      },
    });
  }

  return true;
}






