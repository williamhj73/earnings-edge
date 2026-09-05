# Earnings Edge

A live equity-research and revenue-forecasting application focused on Nike (NKE).

🔗 **Live Model:** https://vigorous-colossal-arrays--whewettjones.replit.app/

## Project Overview

Earnings Edge analyses Nike's historical financial and market data to forecast quarterly revenue and evaluate forecasting performance.

The project was designed to test whether more complex machine-learning approaches genuinely outperform a simpler forecasting baseline.

## Key Features

- Quarterly Nike revenue forecasting
- SEC financial data
- Historical market-price data
- Expanding-window time-series validation
- Out-of-sample forecast testing
- Baseline vs machine-learning model comparison
- MAPE, MAE and RMSE model evaluation
- Historical forecast-error analysis
- Experimental stock-price forecasting
- No look-ahead bias in historical testing

## Model Performance

The forecasting models were evaluated across 23 out-of-sample quarters.

### Selected Baseline Model
- MAPE: 13.57%
- MAE: $1.62bn
- RMSE: $2.78bn

### Machine-Learning Model
- MAPE: 27.57%
- MAE: $3.19bn
- RMSE: $9.60bn

The baseline model was selected because it demonstrated better out-of-sample performance than the more complex machine-learning model.

## Current Revenue Forecast

The model currently forecasts Nike FY2027 Q1 revenue of approximately:

**$11.29bn**

representing approximately **2.9% quarter-on-quarter growth** from FY2026 Q4.

## Methodology

Historical forecasts use expanding-window validation.

For each prediction, the model is trained only using information that would have been available before the quarter being forecast.

This prevents look-ahead bias and produces out-of-sample historical results.

## Data Sources

- Nike / SEC Company Facts
- Public historical market-price data
- Nike fiscal-period information

Where standalone Q4 revenue is unavailable, quarterly revenue is derived only from verified annual and nine-month SEC figures.

## Stock Price Experiment

The application also contains an experimental statistical stock-price forecasting module.

Historical testing showed limited directional predictive accuracy, so this feature is clearly labelled as experimental and should not be interpreted as an investment recommendation.

## What I Learned

This project demonstrated that increasing model complexity does not automatically improve forecasting performance.

The simpler baseline significantly outperformed the tested machine-learning model, highlighting the importance of:

- out-of-sample validation
- model selection
- financial data quality
- avoiding look-ahead bias
- evaluating models objectively

## Disclaimer

This project was created for educational and research purposes only. Forecasts are statistical estimates and are not investment advice.
