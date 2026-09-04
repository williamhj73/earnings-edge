import { Router, type IRouter, type Request } from "express";
import { RunForecastBody, RunForecastResponse } from "@workspace/api-zod";

type PriceBar = {
  date: string;
  close: number;
};

type RevenueFact = {
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  start?: string;
  end?: string;
  val?: number;
};

type Quarter = {
  fiscalQuarter: string;
  endDate: string;
  revenue: number;
  yoyGrowth: number;
  qoqGrowth: number;
  return3m: number;
  return6m: number;
};

type TrainingRow = {
  features: number[];
  target: number;
};

type ModelMetric = {
  mae: number;
  rmse: number;
  mape: number;
  sampleSize: number;
};

type Prediction = {
  fiscalQuarter: string;
  predictedRevenue: number;
  actualRevenue: number;
  forecastErrorPct: number;
};

const router: IRouter = Router();
const NIKE_CIK = "0000320187";
const SEC_USER_AGENT = "Earnings Edge research contact@replit.com";

function dateOnly(value: string | Date) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function parseNasdaqDate(value: string | undefined) {
  if (!value) return "";
  const [month, day, year] = value.split("/");
  return year ? `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` : value.slice(0, 10);
}

function parseMoney(value: unknown) {
  return Number(String(value ?? "").replace(/[$,]/g, ""));
}

async function fetchRevenueFacts() {
  const response = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${NIKE_CIK}.json`, {
    headers: { accept: "application/json", "user-agent": SEC_USER_AGENT },
  });
  if (!response.ok) throw new Error(`SEC request failed with status ${response.status}`);

  const payload = (await response.json()) as {
    facts?: {
      "us-gaap"?: Record<string, { units?: { USD?: RevenueFact[] } }>;
    };
  };
  const gaap = payload.facts?.["us-gaap"] ?? {};
  const revenueTag =
    gaap.RevenueFromContractWithCustomerExcludingAssessedTax ??
    gaap.SalesRevenueNet ??
    gaap.RevenueFromContractWithCustomerIncludingAssessedTax;
  const facts = revenueTag?.units?.USD ?? [];

  const quarterly = facts.filter((fact) => {
    if (!fact.start || !fact.end || !fact.val || fact.val <= 0) return false;
    if (fact.form !== "10-Q" && fact.form !== "10-K") return false;
    const durationDays = (Date.parse(fact.end) - Date.parse(fact.start)) / 86_400_000;
    return durationDays >= 70 && durationDays <= 110;
  });

  const byEndDate = new Map<string, RevenueFact>();
  for (const fact of quarterly) {
    const end = fact.end;
    if (!end) continue;
    const previous = byEndDate.get(end);
    if (!previous || String(fact.filed ?? "") > String(previous.filed ?? "")) {
      byEndDate.set(end, fact);
    }
  }

  return [...byEndDate.values()]
    .sort((a, b) => String(a.end).localeCompare(String(b.end)))
    .map((fact) => ({
      fiscalQuarter:
        fact.fy && fact.fp ? `FY${fact.fy} ${fact.fp}` : `Quarter ended ${fact.end}`,
      endDate: String(fact.end),
      revenue: Number(fact.val),
    }));
}

async function fetchPriceBars(startDate: string, endDate: string): Promise<PriceBar[]> {
  const url = new URL("https://api.nasdaq.com/api/quote/NKE/historical");
  url.searchParams.set("assetclass", "stocks");
  url.searchParams.set("fromdate", startDate);
  url.searchParams.set("todate", endDate);
  url.searchParams.set("limit", "5000");

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Mozilla/5.0 (compatible; Earnings-Edge/1.0)",
    },
  });
  if (!response.ok) throw new Error(`Market data request failed with status ${response.status}`);

  const payload = (await response.json()) as {
    data?: {
      tradesTable?: {
        rows?: Array<{ date?: string; close?: string }>;
      };
    };
  };
  return (payload.data?.tradesTable?.rows ?? [])
    .map((row) => ({ date: parseNasdaqDate(row.date), close: parseMoney(row.close) }))
    .filter((bar) => bar.date && Number.isFinite(bar.close) && bar.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function closestBarIndex(bars: PriceBar[], date: string) {
  let index = -1;
  for (let cursor = 0; cursor < bars.length; cursor += 1) {
    if (bars[cursor]?.date && bars[cursor].date <= date) index = cursor;
    else break;
  }
  return index;
}

function priceReturn(bars: PriceBar[], endIndex: number, lookback: number) {
  const current = bars[endIndex]?.close;
  const prior = bars[endIndex - lookback]?.close;
  return current && prior ? current / prior - 1 : 0;
}

function buildQuarters(
  revenueFacts: Array<{ fiscalQuarter: string; endDate: string; revenue: number }>,
  bars: PriceBar[],
) {
  const enriched: Quarter[] = [];
  for (let index = 0; index < revenueFacts.length; index += 1) {
    const fact = revenueFacts[index];
    const priceIndex = closestBarIndex(bars, fact.endDate);
    const priorQuarter = revenueFacts[index - 1];
    const yearAgo = revenueFacts[index - 4];
    if (!fact || !priorQuarter || !yearAgo || priceIndex < 126) continue;

    enriched.push({
      fiscalQuarter: fact.fiscalQuarter,
      endDate: fact.endDate,
      revenue: fact.revenue,
      yoyGrowth: fact.revenue / yearAgo.revenue - 1,
      qoqGrowth: fact.revenue / priorQuarter.revenue - 1,
      return3m: priceReturn(bars, priceIndex, 63),
      return6m: priceReturn(bars, priceIndex, 126),
    });
  }
  return enriched;
}

function solveLinearSystem(matrix: number[][], vector: number[]) {
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let pivot = 0; pivot < augmented.length; pivot += 1) {
    let bestRow = pivot;
    for (let row = pivot + 1; row < augmented.length; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[bestRow][pivot])) bestRow = row;
    }
    [augmented[pivot], augmented[bestRow]] = [augmented[bestRow], augmented[pivot]];
    const divisor = augmented[pivot][pivot] || 1e-10;
    for (let column = pivot; column < augmented[pivot].length; column += 1) {
      augmented[pivot][column] /= divisor;
    }
    for (let row = 0; row < augmented.length; row += 1) {
      if (row === pivot) continue;
      const factor = augmented[row][pivot];
      for (let column = pivot; column < augmented[row].length; column += 1) {
        augmented[row][column] -= factor * augmented[pivot][column];
      }
    }
  }
  return augmented.map((row) => row[row.length - 1]);
}

function fitAndPredict(rows: TrainingRow[], input: number[], ridge = 0) {
  const dimension = input.length + 1;
  const matrix = Array.from({ length: dimension }, () => Array(dimension).fill(0));
  const vector = Array(dimension).fill(0);
  for (const row of rows) {
    const design = [1, ...row.features];
    for (let i = 0; i < dimension; i += 1) {
      vector[i] += design[i] * row.target;
      for (let j = 0; j < dimension; j += 1) matrix[i][j] += design[i] * design[j];
    }
  }
  for (let i = 1; i < dimension; i += 1) matrix[i][i] += ridge;
  const coefficients = solveLinearSystem(matrix, vector);
  return [1, ...input].reduce((sum, value, index) => sum + value * coefficients[index], 0);
}

function featureVector(quarter: Quarter, includeMarket: boolean) {
  const base = [quarter.revenue / 1_000_000_000, quarter.yoyGrowth * 100, quarter.qoqGrowth * 100];
  return includeMarket ? [...base, quarter.return3m * 100, quarter.return6m * 100] : base;
}

function buildTrainingRows(quarters: Quarter[], targetIndex: number, includeMarket: boolean) {
  return quarters.slice(0, targetIndex - 1).map((quarter, index) => ({
    features: featureVector(quarter, includeMarket),
    target: quarters[index + 1].revenue / 1_000_000_000,
  }));
}

function calculateMetrics(predictions: Prediction[]): ModelMetric {
  const errors = predictions.map((prediction) => prediction.predictedRevenue - prediction.actualRevenue);
  const absolute = errors.map((error) => Math.abs(error));
  const percentage = predictions.map((prediction) => Math.abs(prediction.forecastErrorPct));
  return {
    mae: absolute.reduce((sum, value) => sum + value, 0) / Math.max(1, absolute.length),
    rmse: Math.sqrt(errors.reduce((sum, value) => sum + value ** 2, 0) / Math.max(1, errors.length)),
    mape: percentage.reduce((sum, value) => sum + value, 0) / Math.max(1, percentage.length),
    sampleSize: predictions.length,
  };
}

function nextFiscalQuarter(label: string) {
  const match = label.match(/FY(\d{4})\s+Q([1-4])/);
  if (!match) return "Next quarter";
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  return quarter === 4 ? `FY${year + 1} Q1` : `FY${year} Q${quarter + 1}`;
}

function calculateForecast(quarters: Quarter[]) {
  const baselinePredictions: Prediction[] = [];
  const machineLearningPredictions: Prediction[] = [];
  const minimumTrainingRows = 6;

  for (let targetIndex = minimumTrainingRows + 1; targetIndex < quarters.length; targetIndex += 1) {
    const target = quarters[targetIndex];
    const baselineRows = buildTrainingRows(quarters, targetIndex, false);
    const machineRows = buildTrainingRows(quarters, targetIndex, true);
    const baselineValue = fitAndPredict(baselineRows, featureVector(quarters[targetIndex - 1], false));
    const machineValue = fitAndPredict(machineRows, featureVector(quarters[targetIndex - 1], true), 0.5);
    baselinePredictions.push({
      fiscalQuarter: target.fiscalQuarter,
      predictedRevenue: baselineValue * 1_000_000_000,
      actualRevenue: target.revenue,
      forecastErrorPct: (baselineValue * 1_000_000_000 / target.revenue - 1) * 100,
    });
    machineLearningPredictions.push({
      fiscalQuarter: target.fiscalQuarter,
      predictedRevenue: machineValue * 1_000_000_000,
      actualRevenue: target.revenue,
      forecastErrorPct: (machineValue * 1_000_000_000 / target.revenue - 1) * 100,
    });
  }

  const baselineMetrics = calculateMetrics(baselinePredictions);
  const machineLearningMetrics = calculateMetrics(machineLearningPredictions);
  const useMachineLearning = machineLearningMetrics.mape < baselineMetrics.mape;
  const latest = quarters[quarters.length - 1];
  const nextIndex = quarters.length;
  const trainingRows = buildTrainingRows(quarters, nextIndex, useMachineLearning);
  const nextForecastBillions = fitAndPredict(
    trainingRows,
    featureVector(latest, useMachineLearning),
    useMachineLearning ? 0.5 : 0,
  );
  const observations = (useMachineLearning ? machineLearningPredictions : baselinePredictions).map((prediction) => ({
    fiscalQuarter: prediction.fiscalQuarter,
    predictedRevenue: Number(prediction.predictedRevenue.toFixed(2)),
    actualRevenue: Number(prediction.actualRevenue.toFixed(2)),
    forecastErrorPct: Number(prediction.forecastErrorPct.toFixed(2)),
  }));

  return {
    nextRevenueForecast: Number((nextForecastBillions * 1_000_000_000).toFixed(2)),
    modelUsed: useMachineLearning ? "Machine Learning" as const : "Baseline" as const,
    historicalMapePct: Number((useMachineLearning ? machineLearningMetrics.mape : baselineMetrics.mape).toFixed(2)),
    baselineMetrics,
    machineLearningMetrics,
    observations,
  };
}

router.post("/forecast", async (req: Request, res) => {
  const parsed = RunForecastBody.safeParse(req.body);
  if (!parsed.success || parsed.data.symbol.toUpperCase() !== "NKE") {
    res.status(400).json({ error: "This first version is configured for NKE." });
    return;
  }

  try {
    const revenueFacts = await fetchRevenueFacts();
    const startDate = revenueFacts[0]?.endDate ?? "2010-01-01";
    const endDate = dateOnly(new Date());
    const bars = await fetchPriceBars(startDate, endDate);
    const quarters = buildQuarters(revenueFacts, bars);
    if (quarters.length < 10 || bars.length < 200) {
      res.status(502).json({ error: "Not enough public financial history was returned to build a forecast." });
      return;
    }

    const forecast = calculateForecast(quarters);
    const latestBar = bars[bars.length - 1];
    const latestQuarter = quarters[quarters.length - 1];
    const response = RunForecastResponse.parse({
      symbol: "NKE",
      currentSharePrice: latestBar.close,
      currentPriceDate: latestBar.date,
      nextFiscalQuarter: nextFiscalQuarter(latestQuarter.fiscalQuarter),
      previousQuarterRevenue: latestQuarter.revenue,
      expectedRevenueGrowthPct: (forecast.nextRevenueForecast / latestQuarter.revenue - 1) * 100,
      dataAsOf: latestBar.date,
      dataSource: "SEC company facts and Nasdaq historical daily prices",
      sourceNotes: [
        "Quarterly revenue is retrieved from Nike's SEC company facts.",
        "Historical share prices are retrieved from Nasdaq's public historical-price endpoint.",
        "Historical predictions use expanding-window validation: each quarter is predicted using only earlier quarters.",
        "Market features are trailing 3-month and 6-month close-to-close returns measured at each fiscal quarter end.",
      ],
      ...forecast,
    });
    res.json(response);
  } catch (error) {
    req.log.error({ err: error }, "Revenue forecast request failed");
    res.status(502).json({ error: "The SEC or market-data provider is temporarily unavailable." });
  }
});

export default router;