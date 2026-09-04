import { useEffect, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CircleAlert,
  Database,
  FileText,
  Gauge,
  Info,
  Layers3,
  RefreshCw,
  ShieldCheck,
  Target,
  TrendingUp,
} from 'lucide-react';
import {
  getHealthCheckQueryKey,
  useHealthCheck,
  useRunForecast,
  type ForecastObservation,
  type ForecastResult,
  type ModelMetric,
  type StockPricePoint,
} from '@workspace/api-client-react';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

const formatCurrency = (value: number, digits = 2) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

const formatRevenue = (value: number) => {
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}bn`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(0)}m`;
  return formatCurrency(value, 0);
};

const formatPct = (value: number, digits = 1, signed = false) =>
  `${signed && value > 0 ? '+' : ''}${value.toFixed(digits)}%`;

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));

function errorMessage(error: unknown) {
  const possible = error as { response?: { data?: { error?: string } }; message?: string };
  return possible?.response?.data?.error || possible?.message || 'The forecasting service did not return a result.';
}

function Wordmark() {
  return (
    <div className="flex items-center gap-3" data-testid="brand-mark">
      <div className="relative flex h-9 w-9 items-center justify-center rounded-[10px] bg-[hsl(var(--primary))] text-[hsl(var(--accent))]">
        <span className="absolute top-[16px] left-[8px] h-[3px] w-[22px] -rotate-[17deg] rounded-full bg-current" />
        <span className="absolute top-[13px] left-[12px] h-[3px] w-[16px] -rotate-[17deg] rounded-full bg-current" />
      </div>
      <div>
        <div className="font-display text-[22px] leading-none tracking-[-.03em]">Earnings Edge</div>
        <div className="mt-1 font-mono text-[9px] uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">research desk / 01</div>
      </div>
    </div>
  );
}

function HealthStatus() {
  const { data, isLoading, isError } = useHealthCheck({
    query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 30000 },
  });
  const online = !isError && (data?.status === 'ok' || data?.status === 'healthy');
  return (
    <div className="flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card)/.65)] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]" data-testid="status-health">
      <span className={`h-1.5 w-1.5 rounded-full ${isLoading ? 'bg-[hsl(var(--accent))] pulse-dot' : online ? 'bg-[hsl(var(--chart-4))]' : 'bg-[hsl(var(--destructive))]'}`} />
      {isLoading ? 'checking service' : online ? 'data service online' : 'service unavailable'}
    </div>
  );
}

function Header({ onRun, pending }: { onRun: () => void; pending: boolean }) {
  return (
    <header className="border-b border-[hsl(var(--border)/.75)] bg-[hsl(var(--background)/.82)] px-5 py-4 backdrop-blur-md md:px-10" data-testid="app-header">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
        <Wordmark />
        <div className="flex items-center gap-3">
          <HealthStatus />
          <button onClick={onRun} disabled={pending} className="flex h-9 items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-3.5 text-[11px] font-bold text-[hsl(var(--primary-foreground))] shadow-[3px_3px_0_hsl(var(--accent))] transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-wait disabled:opacity-70" data-testid="button-refresh-forecast">
            <RefreshCw size={13} className={pending ? 'animate-spin' : ''} /> {pending ? 'Running model' : 'Run forecast'}
          </button>
        </div>
      </div>
    </header>
  );
}

function Eyebrow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <div className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">{icon}{children}</div>;
}

function Metric({ label, value, detail, tone = 'default', testId }: { label: string; value: string; detail: string; tone?: 'default' | 'positive' | 'accent'; testId: string }) {
  const toneClass = tone === 'positive' ? 'text-[hsl(158_52%_65%)]' : tone === 'accent' ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--primary-foreground))]';
  return (
    <div className="border-l border-[hsl(var(--border))] pl-4 first:border-0 first:pl-0" data-testid={testId}>
      <div className="text-[10px] font-semibold uppercase tracking-[.12em] text-[hsl(var(--primary-foreground)/.62)]">{label}</div>
      <div className={`mono-numbers mt-2 text-[clamp(1.25rem,2vw,1.7rem)] font-medium tracking-[-.05em] ${toneClass}`}>{value}</div>
      <div className="mt-1 text-[10px] text-[hsl(var(--primary-foreground)/.55)]">{detail}</div>
    </div>
  );
}

function Summary({ result }: { result: ForecastResult }) {
  const growthPositive = result.expectedRevenueGrowthPct >= 0;
  return (
    <section className="animate-rise-in overflow-hidden rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[var(--shadow-md)]" data-testid="forecast-summary">
      <div className="relative px-5 py-6 md:px-8 md:py-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border-[28px] border-[hsl(var(--accent)/.12)]" />
        <div className="relative flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <div>
            <Eyebrow icon={<Activity size={13} />}>NKE / next earnings view</Eyebrow>
            <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-2">
              <h1 className="font-display text-[clamp(3.2rem,7vw,6.6rem)] leading-[.8] tracking-[-.07em]">NIKE</h1>
              <span className="font-mono text-sm text-[hsl(var(--primary-foreground)/.55)]">NYSE: {result.symbol}</span>
            </div>
            <p className="mt-5 max-w-xl text-sm leading-6 text-[hsl(var(--primary-foreground)/.68)]">A transparent quarterly revenue view built for the next print — with the evidence, error history, and training logic in frame.</p>
          </div>
          <div className="min-w-[240px] rounded-xl border border-[hsl(var(--primary-foreground)/.14)] bg-[hsl(var(--primary-foreground)/.06)] p-4">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[.13em] text-[hsl(var(--primary-foreground)/.52)]"><span>Next fiscal quarter</span><Target size={14} /></div>
            <div className="mt-3 font-mono text-lg font-medium">{result.nextFiscalQuarter}</div>
            <div className="mt-1 font-display text-4xl leading-none text-[hsl(var(--accent))]">{formatRevenue(result.nextRevenueForecast)}</div>
            <div className={`mt-3 flex items-center gap-1 font-mono text-xs ${growthPositive ? 'text-[hsl(158_52%_65%)]' : 'text-[hsl(5_68%_72%)]'}`}>
              {growthPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />} {formatPct(result.expectedRevenueGrowthPct, 1, true)} expected growth
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-y-5 border-t border-[hsl(var(--primary-foreground)/.12)] px-5 py-5 sm:grid-cols-4 md:px-8">
        <Metric label="Share price" value={formatCurrency(result.currentSharePrice)} detail={`as of ${formatDate(result.currentPriceDate)}`} testId="metric-share-price" />
        <Metric label="Prior quarter" value={formatRevenue(result.previousQuarterRevenue)} detail="reported revenue" testId="metric-prior-revenue" />
        <Metric label="Expected growth" value={formatPct(result.expectedRevenueGrowthPct, 1, true)} detail="quarter-over-quarter" tone={growthPositive ? 'positive' : 'default'} testId="metric-growth" />
        <Metric label="Historical MAPE" value={formatPct(result.historicalMapePct, 2)} detail="expanding-window history" tone="accent" testId="metric-historical-mape" />
      </div>
    </section>
  );
}

function RevenueChart({ observations }: { observations: ForecastObservation[] }) {
  if (!observations?.length) return <EmptyState compact title="No revenue observations" body="The service returned no historical quarters for this run." />;
  const width = 920;
  const height = 310;
  const pad = { left: 66, right: 20, top: 20, bottom: 48 };
  const values = observations.flatMap((item) => [item.predictedRevenue, item.actualRevenue]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const low = min - range * .18;
  const high = max + range * .18;
  const x = (index: number) => pad.left + (index / Math.max(1, observations.length - 1)) * (width - pad.left - pad.right);
  const y = (value: number) => pad.top + (1 - (value - low) / (high - low)) * (height - pad.top - pad.bottom);
  const actualPath = observations.map((item, index) => `${index ? 'L' : 'M'} ${x(index).toFixed(1)} ${y(item.actualRevenue).toFixed(1)}`).join(' ');
  const predictedPath = observations.map((item, index) => `${index ? 'L' : 'M'} ${x(index).toFixed(1)} ${y(item.predictedRevenue).toFixed(1)}`).join(' ');
  const ticks = [0, 1, 2, 3].map((index) => low + ((high - low) * index) / 3);
  const labelIndexes = observations.length < 4 ? observations.map((_, index) => index) : [0, Math.floor((observations.length - 1) / 2), observations.length - 1];
  return (
    <div className="overflow-x-auto scrollbar-thin" data-testid="revenue-chart">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[650px] w-full" role="img" aria-label="Actual versus predicted quarterly revenue">
        {ticks.map((tick) => <g key={tick}><line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="hsl(38 21% 80% / .78)" strokeDasharray="3 5" /><text x={pad.left - 10} y={y(tick) + 4} textAnchor="end" fill="hsl(214 10% 47%)" fontSize="10" fontFamily="DM Mono">{formatRevenue(tick)}</text></g>)}
        <path d={predictedPath} fill="none" stroke="hsl(35 92% 57%)" strokeWidth="2" strokeDasharray="6 5" strokeLinecap="round" />
        <path d={actualPath} fill="none" stroke="hsl(212 66% 46%)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {observations.map((item, index) => <g key={`${item.fiscalQuarter}-${index}`}><circle cx={x(index)} cy={y(item.actualRevenue)} r="4.5" fill="hsl(43 38% 98%)" stroke="hsl(212 66% 46%)" strokeWidth="2.5" /><circle cx={x(index)} cy={y(item.predictedRevenue)} r="3.5" fill="hsl(35 92% 57%)" /><title>{`${item.fiscalQuarter}: actual ${formatRevenue(item.actualRevenue)}, predicted ${formatRevenue(item.predictedRevenue)}`}</title></g>)}
        {labelIndexes.map((index) => <text key={index} x={x(index)} y={height - 16} textAnchor={index === 0 ? 'start' : index === observations.length - 1 ? 'end' : 'middle'} fill="hsl(214 10% 47%)" fontSize="10" fontFamily="DM Mono">{observations[index].fiscalQuarter}</text>)}
      </svg>
    </div>
  );
}

function ChartSection({ result }: { result: ForecastResult }) {
  return (
    <section className="animate-rise-in delay-1 rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow-sm)] md:p-7" data-testid="revenue-history-section">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><Eyebrow icon={<TrendingUp size={13} />}>Revenue history / model fit</Eyebrow><h2 className="mt-2 font-display text-3xl tracking-[-.035em]">Actual versus predicted</h2><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Quarterly revenue in millions · predictions are out-of-sample</p></div>
        <div className="flex items-center gap-4 pt-1 text-[10px] text-[hsl(var(--muted-foreground))]"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[hsl(var(--chart-1))]" /> actual</span><span className="flex items-center gap-2"><span className="h-0.5 w-5 border-t-2 border-dashed border-[hsl(var(--accent))]" /> predicted</span></div>
      </div>
      <div className="mt-6"><RevenueChart observations={result.observations} /></div>
    </section>
  );
}

function ModelMetricRow({ label, metric, selected }: { label: string; metric: ModelMetric; selected: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${selected ? 'border-[hsl(var(--accent)/.55)] bg-[hsl(var(--accent)/.09)]' : 'border-[hsl(var(--border))] bg-[hsl(var(--background)/.32)]'}`} data-testid={`model-metric-${label.toLowerCase().replaceAll(' ', '-')}`}>
      <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold">{label}</span>{selected && <span className="rounded-full bg-[hsl(var(--accent))] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[.08em] text-[hsl(var(--accent-foreground))]">selected</span>}</div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div><div className="font-mono text-[9px] uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">MAPE</div><div className="mono-numbers mt-1 text-sm font-medium">{formatPct(metric.mape, 2)}</div></div>
        <div><div className="font-mono text-[9px] uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">MAE</div><div className="mono-numbers mt-1 text-sm font-medium">{formatRevenue(metric.mae)}</div></div>
        <div><div className="font-mono text-[9px] uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">RMSE</div><div className="mono-numbers mt-1 text-sm font-medium">{formatRevenue(metric.rmse)}</div></div>
      </div>
      <div className="mt-3 border-t border-[hsl(var(--border)/.7)] pt-2 font-mono text-[9px] text-[hsl(var(--muted-foreground))]">n = {metric.sampleSize} out-of-sample quarters</div>
    </div>
  );
}

function ModelComparison({ result }: { result: ForecastResult }) {
  const selectedMachineLearning = result.modelUsed === 'Machine Learning';
  return (
    <section className="animate-rise-in delay-2 rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow-sm)] md:p-6" data-testid="model-comparison">
      <div className="flex items-start justify-between gap-3"><div><Eyebrow icon={<Gauge size={13} />}>Model desk</Eyebrow><h2 className="mt-2 font-display text-3xl tracking-[-.035em]">Quality, side by side</h2></div><div className="rounded-lg bg-[hsl(var(--secondary))] p-2 text-[hsl(var(--chart-1))]"><BarChart3 size={17} /></div></div>
      <div className="mt-5 rounded-xl bg-[hsl(var(--primary))] p-4 text-[hsl(var(--primary-foreground))]"><div className="font-mono text-[9px] uppercase tracking-[.14em] text-[hsl(var(--primary-foreground)/.55)]">Selected model</div><div className="mt-2 flex items-center justify-between gap-3"><span className="font-display text-2xl">{result.modelUsed}</span><ShieldCheck size={18} className="text-[hsl(var(--accent))]" /></div><p className="mt-2 text-[11px] leading-5 text-[hsl(var(--primary-foreground)/.62)]">Chosen from expanding-window validation, not a fit to the latest quarter.</p></div>
      <div className="mt-3 space-y-2"><ModelMetricRow label="Baseline" metric={result.baselineMetrics} selected={!selectedMachineLearning} /><ModelMetricRow label="Machine Learning" metric={result.machineLearningMetrics} selected={selectedMachineLearning} /></div>
    </section>
  );
}

function ResultsTable({ observations }: { observations: ForecastObservation[] }) {
  return (
    <section className="animate-rise-in delay-2 overflow-hidden rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] shadow-[var(--shadow-sm)]" data-testid="historical-results">
      <div className="flex items-start justify-between gap-4 border-b border-[hsl(var(--border))] p-5 md:p-6"><div><Eyebrow icon={<Database size={13} />}>Audit trail / {observations?.length ?? 0} quarters</Eyebrow><h2 className="mt-2 font-display text-3xl tracking-[-.035em]">Historical results</h2></div><div className="hidden items-center gap-2 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-[10px] text-[hsl(var(--muted-foreground))] sm:flex"><FileText size={13} /> forecast errors are signed</div></div>
      {!observations?.length ? <EmptyState compact title="No historical results" body="A result table will appear when the API returns observations." /> : <div className="scrollbar-thin overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-left"><thead><tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background)/.3)] text-[10px] uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]"><th className="px-5 py-3 font-semibold md:px-6">Fiscal quarter</th><th className="px-3 py-3 font-semibold">Predicted revenue</th><th className="px-3 py-3 font-semibold">Actual revenue</th><th className="px-5 py-3 text-right font-semibold md:px-6">Forecast error</th></tr></thead><tbody>{observations.map((item, index) => <tr key={`${item.fiscalQuarter}-${index}`} className="border-b border-[hsl(var(--border)/.72)] last:border-0 hover:bg-[hsl(var(--secondary)/.3)]" data-testid={`row-observation-${index}`}><td className="px-5 py-4 font-mono text-xs font-medium md:px-6">{item.fiscalQuarter}</td><td className="px-3 py-4 mono-numbers text-xs">{formatRevenue(item.predictedRevenue)}</td><td className="px-3 py-4 mono-numbers text-xs">{formatRevenue(item.actualRevenue)}</td><td className={`px-5 py-4 text-right mono-numbers text-xs font-medium md:px-6 ${item.forecastErrorPct > 0 ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--chart-4))]'}`}>{formatPct(item.forecastErrorPct, 2, true)}</td></tr>)}</tbody></table></div>}
    </section>
  );
}

function StockPriceChart({ points }: { points: StockPricePoint[] }) {
  if (!points?.length) return <EmptyState compact title="No stock-price series" body="The service returned no historical price points for this run." />;
  const width = 920;
  const height = 290;
  const pad = { left: 54, right: 22, top: 22, bottom: 48 };
  const values = points.map((point) => point.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const low = min - range * .18;
  const high = max + range * .18;
  const x = (index: number) => pad.left + (index / Math.max(1, points.length - 1)) * (width - pad.left - pad.right);
  const y = (value: number) => pad.top + (1 - (value - low) / (high - low)) * (height - pad.top - pad.bottom);
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${x(index).toFixed(1)} ${y(point.price).toFixed(1)}`).join(' ');
  const ticks = [0, 1, 2, 3].map((index) => low + ((high - low) * index) / 3);
  const labels = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => point.kind !== 'HISTORICAL');
  return (
    <div className="overflow-x-auto scrollbar-thin" data-testid="stock-price-chart">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[650px] w-full" role="img" aria-label="Historical Nike share price with model forecasts">
        {ticks.map((tick) => <g key={tick}><line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="hsl(38 21% 80% / .78)" strokeDasharray="3 5" /><text x={pad.left - 9} y={y(tick) + 4} textAnchor="end" fill="hsl(214 10% 47%)" fontSize="10" fontFamily="DM Mono">{formatCurrency(tick)}</text></g>)}
        <path d={path} fill="none" stroke="hsl(212 66% 46%)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => <g key={`${point.date}-${point.kind}`}><circle cx={x(index)} cy={y(point.price)} r={point.kind === 'FORECAST' ? 5 : point.kind === 'CURRENT' ? 5 : 3} fill={point.kind === 'FORECAST' ? 'hsl(35 92% 57%)' : point.kind === 'CURRENT' ? 'hsl(214 29% 18%)' : 'hsl(43 38% 98%)'} stroke={point.kind === 'HISTORICAL' ? 'hsl(212 66% 46%)' : point.kind === 'CURRENT' ? 'hsl(35 92% 57%)' : 'hsl(35 92% 57%)'} strokeWidth={point.kind === 'HISTORICAL' ? 1.5 : 2.5} /><title>{`${point.label}: ${formatCurrency(point.price)}`}</title></g>)}
        {labels.map(({ point, index }) => {
          const shortLabel = point.kind === 'CURRENT' ? 'Current' : point.label.replace(' forecast', '');
          return <text key={`${point.label}-${index}`} x={x(index)} y={height - 17} textAnchor={index === points.length - 1 ? 'end' : 'middle'} fill={point.kind === 'FORECAST' ? 'hsl(35 72% 42%)' : 'hsl(214 10% 47%)'} fontSize="10" fontFamily="DM Mono">{shortLabel}</text>;
        })}
      </svg>
    </div>
  );
}

function StockPriceForecastSection({ result }: { result: ForecastResult }) {
  const forecasts = result.stockPriceForecasts ?? [];
  return (
    <section className="animate-rise-in delay-3 overflow-hidden rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] shadow-[var(--shadow-sm)]" data-testid="stock-price-forecast">
      <div className="border-b border-[hsl(var(--border))] p-5 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Eyebrow icon={<TrendingUp size={13} />}>NKE / price intelligence</Eyebrow>
            <h2 className="mt-2 font-display text-3xl tracking-[-.035em]">Stock Price Forecast</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-[hsl(var(--muted-foreground))]">A lightweight Ridge Regression forecast using recent returns, moving averages, volatility, and lagged revenue growth.</p>
          </div>
          <div className="rounded-lg border border-[hsl(var(--accent)/.55)] bg-[hsl(var(--accent)/.1)] px-3 py-2 text-[10px] font-semibold text-[hsl(var(--accent-foreground))]">Model Forecast – Not Guaranteed</div>
        </div>
        <div className="mt-6 overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[680px] border-collapse text-left">
            <thead><tr className="border-b border-[hsl(var(--border))] text-[10px] uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]"><th className="pb-3 font-semibold">Horizon</th><th className="pb-3 font-semibold">Forecast date</th><th className="pb-3 font-semibold">Current price</th><th className="pb-3 font-semibold">Predicted price</th><th className="pb-3 text-right font-semibold">Expected return</th></tr></thead>
            <tbody>{forecasts.map((forecast) => <tr key={forecast.horizon} className="border-b border-[hsl(var(--border)/.7)] last:border-0" data-testid={`stock-forecast-${forecast.horizon.toLowerCase().replaceAll(' ', '-')}`}><td className="py-4 font-semibold">{forecast.horizon}</td><td className="py-4 font-mono text-xs text-[hsl(var(--muted-foreground))]">{formatDate(forecast.forecastDate)}</td><td className="py-4 mono-numbers text-sm">{formatCurrency(forecast.currentPrice)}</td><td className="py-4 mono-numbers text-sm font-semibold text-[hsl(var(--accent-foreground))]">{formatCurrency(forecast.predictedPrice)}</td><td className={`py-4 text-right mono-numbers text-sm font-semibold ${forecast.expectedReturnPct >= 0 ? 'text-[hsl(var(--chart-4))]' : 'text-[hsl(var(--destructive))]'}`}>{formatPct(forecast.expectedReturnPct, 1, true)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <div className="p-5 md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="font-mono text-[10px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">Price path / model output</div><h3 className="mt-2 font-display text-2xl tracking-[-.03em]">Historical NKE price → forecast path</h3></div>
          <div className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{result.stockPriceModel}</div>
        </div>
        <div className="mt-5"><StockPriceChart points={result.stockPriceSeries ?? []} /></div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[hsl(var(--border))] pt-4">
          <div className="flex items-center gap-4 text-[10px] text-[hsl(var(--muted-foreground))]"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[hsl(var(--chart-1))]" /> historical</span><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[hsl(var(--accent))]" /> model forecast</span></div>
          <div className="font-mono text-xs font-medium">Historical Directional Accuracy: <span className="text-[hsl(var(--chart-4))]">{formatPct(result.historicalDirectionalAccuracyPct, 1)}</span></div>
        </div>
      </div>
    </section>
  );
}

function Methodology({ result }: { result: ForecastResult }) {
  const notes = result.sourceNotes ?? [];
  return (
    <section className="animate-rise-in delay-3 overflow-hidden rounded-2xl border border-[hsl(var(--primary)/.18)] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[var(--shadow-md)]" data-testid="model-methodology">
      <div className="grid lg:grid-cols-[1.15fr_1fr]">
        <div className="border-b border-[hsl(var(--primary-foreground)/.13)] p-5 md:p-8 lg:border-b-0 lg:border-r"><Eyebrow icon={<Layers3 size={13} />}>Model methodology</Eyebrow><h2 className="mt-3 max-w-lg font-display text-[clamp(2.3rem,4vw,4rem)] leading-[.92] tracking-[-.05em]">No look-ahead.<br /><em className="text-[hsl(var(--accent))]">No black box.</em></h2><p className="mt-5 max-w-lg text-sm leading-6 text-[hsl(var(--primary-foreground)/.64)]">Every forecast is evaluated the way an investor would have experienced it: only information available at that quarter enters the prediction.</p><div className="mt-7 flex items-center gap-3 border-t border-[hsl(var(--primary-foreground)/.13)] pt-4 text-[10px] text-[hsl(var(--primary-foreground)/.54)]"><ShieldCheck size={15} className="text-[hsl(var(--accent))]" /> expanding-window training protocol</div></div>
        <div className="p-5 md:p-8"><div className="space-y-5"><MethodologyItem number="01" title="Data" body={`SEC revenue facts and public market prices, sourced from ${result.dataSource}.`} /><MethodologyItem number="02" title="Features" body="Lagged quarterly revenue, seasonality, growth context, and price-derived signals are available at the forecast date." /><MethodologyItem number="03" title="Training" body="An expanding window retrains through time. Each historical prediction is out-of-sample; the future quarter is never used to tune its own forecast." /></div>{notes.length > 0 && <div className="mt-7 border-t border-[hsl(var(--primary-foreground)/.13)] pt-4"><div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.13em] text-[hsl(var(--primary-foreground)/.5)]"><Info size={12} /> Source notes</div><ul className="mt-3 space-y-2 text-[11px] leading-5 text-[hsl(var(--primary-foreground)/.64)]">{notes.map((note, index) => <li key={index} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[hsl(var(--accent))]" />{note}</li>)}</ul></div>}</div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[hsl(var(--primary-foreground)/.13)] px-5 py-3 font-mono text-[9px] uppercase tracking-[.1em] text-[hsl(var(--primary-foreground)/.45)] md:px-8"><span>Data as of {result.dataAsOf}</span><span>Source: {result.dataSource}</span></div>
    </section>
  );
}

function MethodologyItem({ number, title, body }: { number: string; title: string; body: string }) {
  return <div className="flex gap-4"><div className="font-mono text-[10px] text-[hsl(var(--accent))]">{number}</div><div><div className="text-sm font-semibold">{title}</div><p className="mt-1.5 text-[11px] leading-5 text-[hsl(var(--primary-foreground)/.61)]">{body}</p></div></div>;
}

function EmptyState({ title, body, compact = false }: { title: string; body: string; compact?: boolean }) {
  return <div className={`flex flex-col items-center justify-center text-center ${compact ? 'min-h-[190px] p-7' : 'min-h-[430px] p-8'}`} data-testid="empty-state"><div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--secondary))]"><Database size={17} className="text-[hsl(var(--muted-foreground))]" /></div><div className="text-sm font-semibold">{title}</div><p className="mt-1 max-w-xs text-xs leading-5 text-[hsl(var(--muted-foreground))]">{body}</p></div>;
}

function LoadingState() {
  return <div className="space-y-5" data-testid="loading-state"><div className="h-[310px] animate-pulse rounded-2xl bg-[hsl(var(--secondary))]" /><div className="grid gap-5 lg:grid-cols-2"><div className="h-[300px] animate-pulse rounded-2xl bg-[hsl(var(--secondary))]" /><div className="h-[300px] animate-pulse rounded-2xl bg-[hsl(var(--secondary))]" /></div><div className="h-[260px] animate-pulse rounded-2xl bg-[hsl(var(--secondary))]" /></div>;
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="flex min-h-[530px] flex-col items-center justify-center rounded-2xl border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.045)] p-8 text-center" data-testid="error-state"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--destructive)/.12)] text-[hsl(var(--destructive))]"><CircleAlert size={21} /></div><h2 className="mt-4 font-display text-3xl">Forecast unavailable</h2><p className="mt-2 max-w-md text-sm leading-6 text-[hsl(var(--muted-foreground))]">{message}</p><button onClick={onRetry} className="mt-6 flex h-10 items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 text-xs font-bold text-[hsl(var(--primary-foreground))] transition-transform hover:-translate-y-0.5" data-testid="button-retry-forecast"><RefreshCw size={14} /> Retry forecast</button></div>;
}

function Home() {
  const { mutate, data, error, isPending } = useRunForecast();
  const mutateRef = useRef(mutate);
  mutateRef.current = mutate;
  const [hasRun, setHasRun] = useState(false);
  useEffect(() => {
    mutateRef.current({ data: { symbol: 'NKE' } });
    setHasRun(true);
  }, []);
  const result = data as ForecastResult | undefined;
  const run = () => { setHasRun(true); mutateRef.current({ data: { symbol: 'NKE' } }); };
  return (
    <div className="noise-overlay min-h-[100dvh] bg-[radial-gradient(circle_at_90%_-10%,hsl(var(--accent)/.13),transparent_25rem)]" data-testid="earnings-edge-app">
      <Header onRun={run} pending={isPending} />
      <main className="mx-auto max-w-[1440px] px-5 py-7 md:px-10 md:py-10">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><div className="font-mono text-[10px] uppercase tracking-[.19em] text-[hsl(var(--muted-foreground))]">Equity research / revenue intelligence</div><p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">A concise view of what the next quarter could say about NKE.</p></div><div className="flex items-center gap-2 text-[10px] text-[hsl(var(--muted-foreground))]"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--chart-4))]" /> refreshed on demand</div></div>
        {!hasRun || isPending ? <LoadingState /> : error ? <ErrorState message={errorMessage(error)} onRetry={run} /> : result ? <div className="space-y-5"><Summary result={result} /><div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,.85fr)]"><ChartSection result={result} /><ModelComparison result={result} /></div><ResultsTable observations={result.observations} /><StockPriceForecastSection result={result} /><Methodology result={result} /></div> : <EmptyState title="No forecast loaded" body="Run the model to load the latest NKE revenue view." />}
        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[hsl(var(--border)/.7)] pt-4 text-[10px] text-[hsl(var(--muted-foreground))]"><span className="font-mono uppercase tracking-[.13em]">Earnings Edge / NKE</span><span>Research aid only. Validate assumptions before making investment decisions.</span></footer>
      </main>
    </div>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Home} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter></QueryClientProvider>;
}

export default App;