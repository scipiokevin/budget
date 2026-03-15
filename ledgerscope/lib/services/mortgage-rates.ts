import type { MortgageRatesSnapshot } from "@/types/contracts";

const FALLBACK_RATES = {
  average30Year: 6.78,
  average15Year: 6.02,
};

function buildFallbackSnapshot(reason: string): MortgageRatesSnapshot {
  return {
    asOf: new Date().toISOString().slice(0, 10),
    average30Year: FALLBACK_RATES.average30Year,
    average15Year: FALLBACK_RATES.average15Year,
    sourceLabel: `Latest market averages (fallback: ${reason})`,
  };
}

async function fetchLatestValue(seriesId: "MORTGAGE30US" | "MORTGAGE15US"): Promise<{ date: string; value: number } | null> {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;

  const csv = await response.text();
  const lines = csv.trim().split(/\r?\n/);
  for (let i = lines.length - 1; i >= 1; i -= 1) {
    const [date, raw] = lines[i].split(",");
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    return { date, value };
  }

  return null;
}

export async function getLatestMortgageRates(): Promise<MortgageRatesSnapshot> {
  const provider = process.env.MORTGAGE_RATES_PROVIDER?.toLowerCase().trim();

  // Keep a clear placeholder path when no live provider is configured.
  if (!provider || provider === "none" || provider === "placeholder") {
    return buildFallbackSnapshot("provider_not_configured");
  }

  if (provider !== "fred") {
    return buildFallbackSnapshot("unsupported_provider");
  }

  try {
    const [r30, r15] = await Promise.all([fetchLatestValue("MORTGAGE30US"), fetchLatestValue("MORTGAGE15US")]);

    if (r30 && r15) {
      const asOf = r30.date > r15.date ? r30.date : r15.date;
      return {
        asOf,
        average30Year: Number(r30.value.toFixed(2)),
        average15Year: Number(r15.value.toFixed(2)),
        sourceLabel: "Latest market averages (FRED / Freddie Mac PMMS)",
      };
    }
  } catch {
    // fall through to fallback values
  }

  return buildFallbackSnapshot("live_fetch_failed");
}
