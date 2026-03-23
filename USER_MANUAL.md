# Confluence Signals — User Manual

This manual explains every metric, chart, and indicator displayed in the application.

---

## Table of Contents

1. [Backtest Performance Metrics](#1-backtest-performance-metrics)
2. [Trade Statistics](#2-trade-statistics)
3. [All Trades Table](#3-all-trades-table)
4. [Charts](#4-charts)
5. [Signal Dashboard](#5-signal-dashboard)
6. [Confluence Factors](#6-confluence-factors)
7. [Strategy Configurations](#7-strategy-configurations)
8. [Backtest Period Selector](#8-backtest-period-selector)

---

## 1. Backtest Performance Metrics

These are the six key metrics shown at the top of the Backtest tab.

### Strategy Return
The total percentage return of the trading strategy over the selected backtest period, starting from a hypothetical R10,000 investment. A value of +25% means R10,000 grew to R12,500. Green if positive, red if negative.

### Buy & Hold Return
The total percentage return from simply buying the asset at the start of the period and holding it until the end, with no trading. This is your benchmark — the strategy should ideally beat this number.

### Alpha vs B&H
The difference between Strategy Return and Buy & Hold Return. This measures how much value the strategy added (or lost) compared to doing nothing.
- **Positive alpha** = the strategy outperformed passive holding
- **Negative alpha** = you would have been better off just holding

**Formula:** `Alpha = Strategy Return − Buy & Hold Return`

### Strategy Sharpe Ratio
A risk-adjusted return metric. It measures how much return you earn per unit of risk (volatility). Calculated as the annualized ratio of average daily returns to the standard deviation of daily returns.

| Sharpe | Interpretation |
|--------|---------------|
| < 0 | Strategy lost money (red) |
| 0 – 0.99 | Positive but below-average risk-adjusted return (amber) |
| 1.0+ | Good risk-adjusted return (green) |
| 2.0+ | Excellent |

**Formula:** `Sharpe = (mean daily return / std dev of daily returns) × √252`

The √252 factor annualizes the ratio (252 trading days per year).

### Strategy Max Drawdown
The largest peak-to-trough decline in the strategy's equity curve during the backtest period, expressed as a percentage. This tells you the worst-case loss you would have experienced if you started at the worst possible time.

| Max Drawdown | Interpretation |
|-------------|---------------|
| ≤ 10% | Low risk (green) |
| 10–20% | Moderate risk (amber) |
| > 20% | High risk (red) |

**Example:** If the equity peaked at R15,000 then fell to R12,000 before recovering, the max drawdown is 20%.

### B&H Max Drawdown
The same max drawdown calculation but for the buy-and-hold benchmark. Comparing the two drawdowns shows whether the strategy protects capital better during downturns.

---

## 2. Trade Statistics

These metrics describe the characteristics of individual trades taken by the strategy.

### Total Trades
The total number of completed round-trip trades (entry + exit) during the backtest period. More trades give more statistical confidence in the results. Fewer than 10 trades means the results may not be reliable.

### Win Rate
The percentage of trades that were profitable (return > 0%).

| Win Rate | Interpretation |
|----------|---------------|
| < 50% | More losers than winners (red) — can still be profitable if average wins are much larger than average losses |
| ≥ 50% | More winners than losers (green) |

**Formula:** `Win Rate = (winning trades / total trades) × 100`

### Average Win
The mean percentage return of all winning trades. This tells you how much a typical profitable trade earns.

### Average Loss
The mean percentage return of all losing trades (shown as a negative number). This tells you how much a typical losing trade costs.

**Key relationship:** For a strategy to be profitable long-term, you need:
`(Win Rate × Avg Win) + ((1 − Win Rate) × Avg Loss) > 0`

### Profit Factor
The ratio of total gross profits to total gross losses. This is one of the most important metrics for evaluating a strategy.

| Profit Factor | Interpretation |
|--------------|---------------|
| < 1.0 | Strategy loses money overall (red) |
| 1.0 – 1.49 | Marginally profitable (neutral) |
| ≥ 1.5 | Solidly profitable (green) |
| ∞ | No losing trades (displayed as ∞) |

**Formula:** `Profit Factor = Sum of all winning trade returns / |Sum of all losing trade returns|`

### Average Holding Period
The mean number of calendar days each trade is held, from entry to exit. Short holding periods (1–5 days) suggest a swing trading style. Longer periods (20+ days) suggest trend following.

---

## 3. All Trades Table

A scrollable table listing every trade executed during the backtest period, in chronological order.

| Column | Description |
|--------|------------|
| **Entry Date** | The date the position was opened (bought) |
| **Exit Date** | The date the position was closed (sold) |
| **Return** | Percentage gain or loss on that trade. Green (+) for wins, red (−) for losses |
| **Hold Days** | Number of days the trade was held |

---

## 4. Charts

### Equity Curve Chart
Shows two lines plotted over the backtest period, both starting at R10,000:
- **Strategy (orange):** The value of R10,000 invested using the trading strategy
- **Buy & Hold (grey):** The value of R10,000 simply holding the asset

When the orange line is above the grey line, the strategy is outperforming. The gap between them is the alpha.

### Drawdown Chart
Shows the strategy's drawdown over time as a red filled area chart. Values are always zero or negative:
- **0%** = equity is at an all-time high
- **-10%** = equity has fallen 10% from its most recent peak

Deep, prolonged drawdowns indicate difficult periods for the strategy. The deepest point on this chart equals the Max Drawdown metric.

### Price + Moving Averages Chart (Signals Tab)
Shows the asset's daily closing price with two overlaid moving averages:
- **EMA 50 (amber dashed):** 50-day Exponential Moving Average — medium-term trend
- **SMA 200 (red dashed):** 200-day Simple Moving Average — long-term trend

When price is above both lines, the asset is in an uptrend. When price crosses below, it may signal a trend change.

---

## 5. Signal Dashboard

Shown on the Signals tab, these are real-time readings for the latest trading day.

### Current Price
The most recent closing price of the selected asset, displayed in the appropriate currency (USD for Gold/Silver/BTC, ZAc for South African stocks).

### Strategy Signal
The strategy's current recommendation based on the most recent data:
- **BUY (green):** Strategy has an open long position or conditions favor entry
- **SELL (red):** Strategy has exited or conditions are bearish
- **HOLD (neutral):** Between signals — no strong entry or exit trigger

### Market Regime
Determined by the relationship between the 50-day and 200-day simple moving averages:
- **BULL (green):** SMA 50 > SMA 200 (the "Golden Cross" regime)
- **BEAR (red):** SMA 50 < SMA 200 (the "Death Cross" regime)

### RSI (14)
The 14-period Relative Strength Index, measuring momentum on a 0–100 scale:

| RSI Range | Meaning | Color |
|-----------|---------|-------|
| < 30 | Oversold — potential bounce (green) |  |
| 30–70 | Neutral range (neutral) |  |
| > 70 | Overbought — potential reversal (red) |  |

### ATR (14)
The 14-period Average True Range, measuring daily price volatility in absolute price units. Higher ATR = more volatile. Used internally to set stop-loss distances (Chandelier exit = multiplier × ATR from the highest high).

---

## 6. Confluence Factors

The confluence system checks multiple independent signals and triggers a trade setup when 70%+ agree. Each factor is displayed with a checkmark (✓) or cross (✗).

### Config 1 — Channel Breakout Factors

| Factor | What It Checks | Passes When |
|--------|---------------|-------------|
| **Trend System** | Strategy's current signal | Signal = BUY |
| **EMA Alignment** | Fast/medium/slow EMA stacking | EMA 10 > EMA 30 > EMA 50 |
| **Channel Breakout** | Donchian channel position | Price above N-day high |
| **Trend Regime** | Long-term trend state | SMA 50 > SMA 200 |
| **RSI Filter** | Momentum within bounds | RSI between profile's low/high bounds |
| **MACD** | Momentum direction | MACD histogram > 0 |
| **MACD Momentum** | Momentum acceleration | MACD histogram rising |
| **ADX Trend Quality** | Trend strength | ADX ≥ 20 |
| **Trend Strength** | EMA 50 direction + price position | Price above EMA 50 and EMA 50 rising |
| **Volume** | Trading activity | Volume ≥ 20-day average |

### Config 2 — MA Bounce Factors

| Factor | What It Checks | Passes When |
|--------|---------------|-------------|
| **Bounce System** | Strategy's current signal | Signal = BUY |
| **MA Proximity** | Distance to nearest key MA | Price within 2% of SMA 200/100 or EMA 50/21/10 |
| **Bullish Candle** | Current candle direction | Close > Open |
| **RSI Dip Quality** | Dip health | RSI between 25 and 70 |
| **Macro Trend** | Long-term positioning | Price above SMA 200 |
| **MACD Momentum** | Recovery signal | MACD histogram rising |
| **Volume** | Bounce conviction | Volume ≥ 80% of 20-day average |
| **Trend Regime** | Bull market context | SMA 50 > SMA 200 |

### Confluence Score
**Formula:** `(Passed factors / Total factors) × 100`

When the score reaches 70% or higher, a **Trade Setup** panel appears with:
- **Entry:** Current price (suggested entry point)
- **Take Profit:** Entry + (ATR × TP multiplier) — the upside target
- **Stop Loss:** Entry − (ATR × SL multiplier) — the risk limit
- **Win Probability:** Historical win rate at similar confluence levels
- **Reward:Risk Ratio:** Distance to TP / Distance to SL
- **Historical Setups:** How many times similar confluence occurred in the data

---

## 7. Strategy Configurations

### Config 1 — Channel Breakout + Trend Following
Based on the Turtle Traders methodology. Buys when price breaks above the N-day Donchian channel high in a confirmed uptrend, and also enters on pullbacks to the medium EMA that bounce with bullish confirmation.

**Entry triggers:**
1. Price closes above the N-day Donchian high with EMA trend alignment and RSI momentum
2. Price pulls back to the medium EMA with bullish candle pattern and RSI in range
3. MACD crosses positive with ADX strength above threshold

**Exit triggers:**
1. Chandelier stop — price drops M × ATR from the highest high since entry
2. Channel breakdown — price closes below the shorter exit Donchian low
3. Trend reversal — fast EMA crosses below slow EMA

### Config 2 — MA Bounce Strategy
Buys bounces off key moving average levels and holds until the bounce fails.

**Bounce levels (checked deepest-first):** SMA 200, SMA 100, EMA 50, EMA 21, EMA 10

**Entry conditions (all required):**
1. Previous bar's low touched or pierced the MA's touch zone
2. Current bar closes above the MA
3. Current bar is bullish (close > open)
4. RSI < 55 (genuine dip, not distribution)
5. Candle body > 30% of range (strong bounce)

**Exit conditions (any one triggers):**
1. Price closes below the bounce MA for 2 consecutive bars (failure confirmed)
2. Chandelier stop — price drops 3.5 × ATR from highest high since entry

---

## 8. Backtest Period Selector

Choose how far back the backtest simulation runs:

| Period | Trading Days | Calendar Time |
|--------|-------------|---------------|
| 6 Months | ~126 days | 6 months back from today |
| 1 Year | ~252 days | 1 year back |
| 2 Years | ~504 days | 2 years back |
| 3 Years | ~756 days | 3 years back |

Longer periods provide more trades and statistical significance but may include different market regimes. Shorter periods reflect more recent market behavior.

---

## Glossary

| Term | Definition |
|------|-----------|
| **ATR** | Average True Range — a measure of daily price volatility |
| **ADX** | Average Directional Index — measures trend strength (not direction) |
| **Alpha** | Excess return above a benchmark (buy & hold) |
| **Chandelier Exit** | A trailing stop set at a multiple of ATR below the highest high |
| **Confluence** | Multiple independent signals agreeing on the same direction |
| **Donchian Channel** | The highest high and lowest low over N days |
| **Drawdown** | The decline from a peak to a subsequent trough in equity |
| **EMA** | Exponential Moving Average — recent prices weighted more heavily |
| **MACD** | Moving Average Convergence Divergence — trend/momentum indicator |
| **Profit Factor** | Gross profits divided by gross losses |
| **RSI** | Relative Strength Index — momentum oscillator (0–100 scale) |
| **Sharpe Ratio** | Risk-adjusted return (return per unit of volatility) |
| **SMA** | Simple Moving Average — equal-weighted average of N closing prices |
| **Win Rate** | Percentage of trades that were profitable |
