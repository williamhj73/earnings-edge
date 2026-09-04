# Earnings Edge

An investor research desk that forecasts Nike's next quarterly revenue from SEC fundamentals and historical NKE prices.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/nike-earnings-backtester/src/App.tsx` — Earnings Edge dashboard UI
- `artifacts/nike-earnings-backtester/src/index.css` — visual theme and typography
- `artifacts/api-server/src/routes/forecast.ts` — SEC/Nasdaq data retrieval and expanding-window model engine
- `lib/api-spec/openapi.yaml` — forecast API contract
- `lib/api-client-react/src/generated/` — generated frontend API hooks and types

## Architecture decisions

- Revenue facts come from the SEC company facts endpoint, with Nasdaq historical daily closes supplying market features.
- Historical forecasts use expanding-window validation; each target quarter is trained only on earlier quarters.
- The baseline model uses lagged revenue and revenue-growth features; the machine-learning model adds trailing 3-month and 6-month price returns with ridge regularization.
- The existing web artifact was repurposed as Earnings Edge so the live preview and shared API routing remain stable.

## Product

Earnings Edge shows Nike's current share price, next-quarter revenue forecast, expected growth, selected model, historical MAPE, model-by-model MAE/RMSE/MAPE, actual-versus-predicted revenue, forecast history, and methodology/provenance notes.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Financial data is fetched at run time and can be revised by the upstream SEC or market-data providers.
- Do not add random train/test splits; the no-look-ahead expanding-window protocol is part of the product's trust model.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
