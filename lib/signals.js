export const TICKERS = [
  { code: 'GOLD',  ticker: 'GC=F',     name: 'Gold (COMEX Futures)' },
  { code: 'SILVER', ticker: 'SI=F',    name: 'Silver (COMEX Futures)' },
  { code: 'BTC',   ticker: 'BTC-USD',  name: 'Bitcoin' },
];

// Fetch Yahoo Finance crumb + cookie, then download CSV
async function fetchYahooCSV(ticker, period1, period2) {
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  const initRes = await fetch('https://finance.yahoo.com/quote/AAPL/', {
    headers: { 'User-Agent': userAgent },
    redirect: 'follow'
  });
  const cookies = initRes.headers.getSetCookie?.() || [];
  const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');

  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': userAgent, 'Cookie': cookieStr }
  });
  const crumb = await crumbRes.text();

  const p1 = Math.floor(period1.getTime() / 1000);
  const p2 = Math.floor(period2.getTime() / 1000);
  const csvUrl = `https://query1.finance.yahoo.com/v7/finance/download/${encodeURIComponent(ticker)}?period1=${p1}&period2=${p2}&interval=1d&events=history&crumb=${encodeURIComponent(crumb)}`;

  const csvRes = await fetch(csvUrl, {
    headers: { 'User-Agent': userAgent, 'Cookie': cookieStr }
  });

  if (!csvRes.ok) {
    const body = await csvRes.text();
    throw new Error(`Yahoo CSV download failed (${csvRes.status}): ${body.slice(0, 200)}`);
  }

  const csvText = await csvRes.text();
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) throw new Error('Empty CSV response');

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 6 || cols[4] === 'null') continue;
    rows.push({
      date: cols[0],
      open: parseFloat(cols[1]) || parseFloat(cols[4]),
      high: parseFloat(cols[2]) || parseFloat(cols[4]),
      low: parseFloat(cols[3]) || parseFloat(cols[4]),
      close: parseFloat(cols[5]) || parseFloat(cols[4]),
      volume: parseInt(cols[6]) || 0
    });
  }
  return rows;
}

async function fetchYahooChart(ticker, period1, period2) {
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const p1 = Math.floor(period1.getTime() / 1000);
  const p2 = Math.floor(period2.getTime() / 1000);

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${p1}&period2=${p2}&interval=1d`;

  const res = await fetch(url, {
    headers: { 'User-Agent': userAgent }
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Yahoo chart API failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  const result = json.chart?.result?.[0];
  if (!result) throw new Error('No chart data in response');

  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const adjclose = result.indicators?.adjclose?.[0]?.adjclose || [];

  const rows = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = adjclose[i] ?? quote.close?.[i];
    if (close == null) continue;
    rows.push({
      date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
      open: quote.open?.[i] || close,
      high: quote.high?.[i] || close,
      low: quote.low?.[i] || close,
      close,
      volume: quote.volume?.[i] || 0
    });
  }
  return rows;
}

async function fetchHistorical(ticker, period1, period2) {
  try {
    const data = await fetchYahooChart(ticker, period1, period2);
    if (data.length > 0) return data;
  } catch (e) {
    console.log(`v8 chart failed for ${ticker}: ${e.message}`);
  }
  return await fetchYahooCSV(ticker, period1, period2);
}

// --- Technical indicators ---

function sma(hist, period) {
  const result = [];
  for (let i = period - 1; i < hist.length; i++) {
    const slice = hist.slice(i - period + 1, i + 1).map(h => h.close);
    result.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return result;
}

function rsi(hist, period = 14) {
  const values = [];
  for (let i = period; i < hist.length; i++) {
    let gain = 0, loss = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const change = hist[j].close - hist[j - 1].close;
      gain += Math.max(change, 0);
      loss += Math.abs(Math.min(change, 0));
    }
    const avgGain = gain / period;
    const avgLoss = loss / period;
    values.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return values;
}

function atr(hist, period = 14) {
  const trs = [];
  for (let i = 1; i < hist.length; i++) {
    const tr = Math.max(
      hist[i].high - hist[i].low,
      Math.abs(hist[i].high - hist[i - 1].close),
      Math.abs(hist[i].low - hist[i - 1].close)
    );
    trs.push(tr);
  }
  let atrVal = trs[0];
  const atrs = [atrVal];
  for (let i = 1; i < trs.length; i++) {
    atrVal = (atrVal * (period - 1) + trs[i]) / period;
    atrs.push(atrVal);
  }
  return atrs;
}

function ema(values, period) {
  const k = 2 / (period + 1);
  const result = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function macd(hist, fast = 12, slow = 26, sig = 9) {
  const closes = hist.map(h => h.close);
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = ema(macdLine, sig);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macd: macdLine, signal: signalLine, histogram };
}

function bollingerBands(hist, period = 20, mult = 2) {
  const upper = [], middle = [], lower = [];
  for (let i = period - 1; i < hist.length; i++) {
    const slice = hist.slice(i - period + 1, i + 1).map(h => h.close);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    middle.push(mean);
    upper.push(mean + mult * std);
    lower.push(mean - mult * std);
  }
  return { upper, middle, lower };
}

function stochastic(hist, period = 14, smoothK = 3, smoothD = 3) {
  const rawK = [];
  for (let i = period - 1; i < hist.length; i++) {
    const slice = hist.slice(i - period + 1, i + 1);
    const high = Math.max(...slice.map(h => h.high));
    const low = Math.min(...slice.map(h => h.low));
    rawK.push(high === low ? 50 : ((hist[i].close - low) / (high - low)) * 100);
  }
  const kLine = [];
  for (let i = smoothK - 1; i < rawK.length; i++) {
    kLine.push(rawK.slice(i - smoothK + 1, i + 1).reduce((a, b) => a + b, 0) / smoothK);
  }
  const dLine = [];
  for (let i = smoothD - 1; i < kLine.length; i++) {
    dLine.push(kLine.slice(i - smoothD + 1, i + 1).reduce((a, b) => a + b, 0) / smoothD);
  }
  return { k: kLine, d: dLine };
}

function volumeSma(hist, period = 20) {
  const result = [];
  for (let i = period - 1; i < hist.length; i++) {
    const slice = hist.slice(i - period + 1, i + 1).map(h => h.volume);
    result.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return result;
}

// --- ADX (Average Directional Index) for trend strength ---

function adx(hist, period = 14) {
  const plusDM = [], minusDM = [], trArr = [];
  for (let i = 1; i < hist.length; i++) {
    const upMove = hist[i].high - hist[i - 1].high;
    const downMove = hist[i - 1].low - hist[i].low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trArr.push(Math.max(
      hist[i].high - hist[i].low,
      Math.abs(hist[i].high - hist[i - 1].close),
      Math.abs(hist[i].low - hist[i - 1].close)
    ));
  }
  // Wilder's smoothing
  const smooth = (arr, p) => {
    const out = [arr.slice(0, p).reduce((a, b) => a + b, 0)];
    for (let i = p; i < arr.length; i++) {
      out.push(out[out.length - 1] - out[out.length - 1] / p + arr[i]);
    }
    return out;
  };
  const smTR = smooth(trArr, period);
  const smPlusDM = smooth(plusDM, period);
  const smMinusDM = smooth(minusDM, period);
  const dx = [];
  for (let i = 0; i < smTR.length; i++) {
    const plusDI = smTR[i] === 0 ? 0 : (smPlusDM[i] / smTR[i]) * 100;
    const minusDI = smTR[i] === 0 ? 0 : (smMinusDM[i] / smTR[i]) * 100;
    const sum = plusDI + minusDI;
    dx.push(sum === 0 ? 0 : (Math.abs(plusDI - minusDI) / sum) * 100);
  }
  // Smooth DX to get ADX
  const adxOut = [dx.slice(0, period).reduce((a, b) => a + b, 0) / period];
  for (let i = period; i < dx.length; i++) {
    adxOut.push((adxOut[adxOut.length - 1] * (period - 1) + dx[i]) / period);
  }
  return adxOut;
}

// --- Asset-specific parameter profiles ---

const ASSET_PROFILES = {
  gold: {
    rsiBounds: [35, 75],
    txCost: 0.0005,
    breakoutLen: 20, exitLen: 10, chandelierMult: 3.2,
    ema1: 10, ema2: 30, ema3: 50,
    pullbackReentry: true,
    pullbackZone: 0.03, pullbackRsiLo: 40, pullbackRsiHi: 65,
    macdAdxThresh: 22, cooldownBars: 2, maxEquityDD: 15,
    tpMultiplier: 3.0, slMultiplier: 1.0,
    breakoutRsiMin: 48,          // Require momentum on breakout entries
    requireStrongTrend: false,   // Gold trends with weaker alignment too
  },
  btc: {
    rsiBounds: [30, 82],
    txCost: 0.001,
    breakoutLen: 16, exitLen: 10, chandelierMult: 4.2,  // wider channels + chandelier = ride trends longer
    ema1: 5, ema2: 18, ema3: 45,
    pullbackReentry: true,
    pullbackZone: 0.06, pullbackRsiLo: 30, pullbackRsiHi: 75,
    macdAdxThresh: 22, cooldownBars: 2, maxEquityDD: 25,
    tpMultiplier: 4.0, slMultiplier: 1.5,
    breakoutRsiMin: 45,          // Require momentum on breakout entries
    requireStrongTrend: true,    // Full EMA alignment — filter chop/range breakouts
  },
  default: {
    rsiBounds: [40, 60],
    txCost: 0.0015,
    breakoutLen: 20, exitLen: 10, chandelierMult: 2.8,
    ema1: 10, ema2: 30, ema3: 50,
    pullbackReentry: true,
    pullbackZone: 0.03, pullbackRsiLo: 40, pullbackRsiHi: 65,
    macdAdxThresh: 25, cooldownBars: 3, maxEquityDD: 12,
    tpMultiplier: 2.0, slMultiplier: 1.0,
    breakoutRsiMin: 48,
    requireStrongTrend: true,
  }
};

function getAssetProfile(ticker) {
  const t = (ticker || '').toUpperCase();
  if (t === 'GC=F' || t.startsWith('GOLD') || t === 'XAUUSD' || t === 'GLD') return ASSET_PROFILES.gold;
  if (t === 'BTC-USD' || t.startsWith('BTC')) return ASSET_PROFILES.btc;
  return ASSET_PROFILES.default;
}

// --- Donchian Channel ---

function donchian(hist, period) {
  const upper = [], lower = [];
  for (let i = period; i < hist.length; i++) {
    const window = hist.slice(i - period, i);
    upper.push(Math.max(...window.map(h => h.high)));
    lower.push(Math.min(...window.map(h => h.low)));
  }
  return { upper, lower };
}

// --- Adaptive Channel Breakout + Trend Following Strategy ---
// Replaces Q-learning with a deterministic, proven commodity trading system.
// Based on Turtle Traders methodology adapted for modern gold markets.
//
// Entry signals:
//   1. Breakout: price closes above N-day Donchian high in confirmed uptrend
//   2. Pullback: price retraces to EMA then bounces (close > open for 2 bars) in uptrend
//
// Exit signals:
//   1. Chandelier: price drops M× ATR from highest high since entry
//   2. Channel: price closes below shorter N-day Donchian low
//   3. Trend reversal: fast EMA crosses below slow EMA
//
// Why this beats Q-learning for gold:
//   - Deterministic: no random seed variance, no training overfitting
//   - Gold-native: channel breakouts are how gold actually trends (new highs beget new highs)
//   - High exposure: stays in trends longer than RL which flip-flops on noisy Q-values
//   - Fast exits: chandelier + channel low gives two independent exit triggers

function runStrategy(aligned, regimes, rsiAligned, macdHist, atrAligned, adxAligned, ticker) {
  const profile = getAssetProfile(ticker);
  const len = aligned.length;
  const closes = aligned.map(h => h.close);

  // Compute EMAs for trend detection
  const ema1 = ema(closes, profile.ema1);
  const ema2 = ema(closes, profile.ema2);
  const ema3 = ema(closes, profile.ema3);

  // Compute Donchian channels
  const entryDonch = donchian(aligned, profile.breakoutLen);
  const exitDonch = donchian(aligned, profile.exitLen);
  // Donchian arrays start at index=period, so offset them
  const entryOffset = profile.breakoutLen;
  const exitOffset = profile.exitLen;

  // Forward pass
  const stratEquity = [10000];
  let position = 0;
  const trades = [];
  let entryPrice = 0, entryIdx = 0, trailingHigh = 0;
  let cooldownUntil = 0;
  let equityPeak = 10000;
  // Track last action for signal display
  let lastAction = 0; // 0=HOLD, 1=BUY, 2=SELL

  for (let t = 1; t < len; t++) {
    const curATR = atrAligned[t] ?? atrAligned[atrAligned.length - 1];
    const curADX = adxAligned[t] ?? 20;
    const curEquity = stratEquity[stratEquity.length - 1];
    if (curEquity > equityPeak) equityPeak = curEquity;
    const equityDD = ((equityPeak - curEquity) / equityPeak) * 100;

    const close = aligned[t].close;
    const prevClose = aligned[t - 1].close;

    // Trend state: EMA10 > EMA30 > EMA50 = strong uptrend
    const trendUp = ema1[t] > ema2[t] && ema2[t] > ema3[t];
    const trendConfirmed = ema1[t] > ema3[t]; // weaker: just fast > slow

    // --- EXIT LOGIC (check before entry) ---
    let forceExit = false;
    if (position === 1) {
      if (close > trailingHigh) trailingHigh = close;

      // Exit 1: Chandelier — price drops M× ATR from trailing high
      if (close < trailingHigh - profile.chandelierMult * curATR) forceExit = true;

      // Exit 2: Channel breakdown — price closes below exit Donchian low
      const exitDonchIdx = t - exitOffset;
      if (exitDonchIdx >= 0 && exitDonchIdx < exitDonch.lower.length) {
        if (close < exitDonch.lower[exitDonchIdx]) forceExit = true;
      }

      // Exit 3: Trend reversal — fast EMA crosses below slow EMA
      if (ema1[t] < ema3[t] && ema1[t - 1] >= ema3[t - 1]) forceExit = true;
    }

    // --- ENTRY LOGIC ---
    let enterSignal = false;
    const canEnter = position === 0 && t >= cooldownUntil && equityDD < profile.maxEquityDD;

    if (canEnter) {
      // Entry 1: Breakout — new Donchian high in uptrend
      const entryDonchIdx = t - entryOffset;
      const curRSI = rsiAligned[t] ?? 50;
      const trendReq = profile.requireStrongTrend ? trendUp : trendConfirmed;
      const rsiReq = curRSI >= (profile.breakoutRsiMin || 0);
      if (entryDonchIdx >= 0 && entryDonchIdx < entryDonch.upper.length) {
        if (close > entryDonch.upper[entryDonchIdx] && trendReq && rsiReq) {
          enterSignal = true;
        }
      }

      // Entry 2: Pullback re-entry — price pulls back to EMA then bounces
      if (!enterSignal && profile.pullbackReentry && trendUp) {
        const pbZone = profile.pullbackZone || 0.03;
        const nearEMA = close <= ema2[t] * (1 + pbZone * 0.33) && close >= ema2[t] * (1 - pbZone);
        const bouncing = aligned[t].close > aligned[t].open
                      && (t >= 2 && aligned[t - 1].close > aligned[t - 1].open);
        const pbRsiLo = profile.pullbackRsiLo || 40;
        const pbRsiHi = profile.pullbackRsiHi || 65;
        const curRSI = rsiAligned[t] ?? 50;
        const rsiOk = curRSI > pbRsiLo && curRSI < pbRsiHi;
        if (nearEMA && bouncing && rsiOk) {
          enterSignal = true;
        }
      }

      // Entry 3: Momentum confirmation — MACD crossing positive with ADX strength
      if (!enterSignal && trendConfirmed && curADX > (profile.macdAdxThresh || 25)) {
        const macdNow = macdHist[t] ?? 0;
        const macdPrev = macdHist[t - 1] ?? 0;
        if (macdNow > 0 && macdPrev <= 0 && close > ema2[t]) {
          enterSignal = true;
        }
      }
    }

    // --- EXECUTE ---
    if (enterSignal && position === 0) {
      position = 1;
      entryPrice = close;
      entryIdx = t;
      trailingHigh = close;
      lastAction = 1;
    }
    if (forceExit && position === 1) {
      const retPct = ((close - entryPrice) / entryPrice) * 100;
      position = 0;
      trades.push({
        entryDate: aligned[entryIdx].date,
        exitDate: aligned[t].date,
        entryPrice,
        exitPrice: close,
        returnPct: retPct,
        holdDays: t - entryIdx
      });
      cooldownUntil = t + (retPct < 0 ? profile.cooldownBars + 1 : profile.cooldownBars);
      lastAction = 2;
    }

    const dailyRet = (close / prevClose) - 1;
    stratEquity.push(stratEquity[stratEquity.length - 1] * (1 + dailyRet * position));
  }

  // Determine latest signal for display
  // Check if right now would be an entry or exit
  const L = len - 1;
  let currentAction;
  if (position === 1) {
    currentAction = 'BUY'; // still in position = bullish
  } else if (lastAction === 2) {
    currentAction = 'SELL';
  } else {
    // Check if conditions are forming for entry
    const trendUp = ema1[L] > ema2[L] && ema2[L] > ema3[L];
    const trendConfirmed = ema1[L] > ema3[L];
    const entryDonchIdx = L - entryOffset;
    const nearBreakout = entryDonchIdx >= 0 && entryDonchIdx < entryDonch.upper.length
      && closes[L] > entryDonch.upper[entryDonchIdx] * 0.99;
    if (trendConfirmed && nearBreakout) currentAction = 'BUY';
    else if (trendUp) currentAction = 'HOLD';
    else currentAction = 'SELL';
  }

  // Record open trade if still in position at end of backtest
  if (position === 1) {
    const lastClose = aligned[len - 1].close;
    const retPct = ((lastClose - entryPrice) / entryPrice) * 100;
    trades.push({
      entryDate: aligned[entryIdx].date,
      exitDate: null,
      entryPrice,
      exitPrice: lastClose,
      returnPct: retPct,
      holdDays: (len - 1) - entryIdx,
      open: true
    });
  }

  return { stratEquity, trades, currentAction, position };
}

// --- Config 2: MA Bounce Strategy ---
// Buy bounces off key SMA/EMA levels, hold until failure confirms.
// Gold-optimized: no trend filter (gold bounces off MAs in all regimes),
// exit on 1 close below the bounce MA (fast failure detection).
//
// Bounce levels (deepest = highest priority):
//   SMA 200, SMA 100, EMA 50, EMA 21, EMA 10
//
// Entry: previous bar's low touched/pierced MA zone, today closes above MA
//        with a bullish candle (close > open). Deepest MA wins.
// Exit:  price closes below the bounce MA (failure confirmed) OR
//        chandelier stop (3× ATR from highest high since entry).

const BOUNCE_LEVELS = [
  { key: 'sma200', type: 'sma', period: 200, touchZone: 0.012 },
  { key: 'sma100', type: 'sma', period: 100, touchZone: 0.01 },
  { key: 'ema50',  type: 'ema', period: 50,  touchZone: 0.008 },
  { key: 'ema21',  type: 'ema', period: 21,  touchZone: 0.006 },
  { key: 'ema10',  type: 'ema', period: 10,  touchZone: 0.004 },
];

function runBounceStrategy(aligned, rsiAligned, atrAligned) {
  const len = aligned.length;
  const closes = aligned.map(h => h.close);

  // Compute all MAs
  const mas = {};
  for (const m of BOUNCE_LEVELS) {
    if (m.type === 'ema') {
      mas[m.key] = ema(closes, m.period);
    } else {
      const raw = sma(aligned, m.period);
      const pad = new Array(m.period - 1).fill(null);
      mas[m.key] = [...pad, ...raw];
    }
  }

  const stratEquity = [10000];
  let position = 0;
  const trades = [];
  let entryPrice = 0, entryIdx = 0, trailingHigh = 0;
  let bounceMA = null, failCount = 0;
  let cooldownUntil = 0;
  let lastAction = 0;

  const failBars = 2;        // 2 closes below MA = failure confirmed (wider = higher win rate)
  const chandelierMult = 3.5; // 3.5× ATR trailing stop backup (wider = more room to recover)
  const cooldownBars = 2;

  for (let t = 1; t < len; t++) {
    const close = aligned[t].close;
    const prevClose = aligned[t - 1].close;
    const curATR = atrAligned[t] ?? atrAligned[atrAligned.length - 1];

    // --- EXIT ---
    let forceExit = false;
    if (position === 1) {
      if (close > trailingHigh) trailingHigh = close;

      // Exit 1: Failure — price closes below the bounce MA
      const maVal = mas[bounceMA] ? mas[bounceMA][t] : null;
      if (maVal != null && close < maVal) {
        failCount++;
        if (failCount >= failBars) forceExit = true;
      } else {
        failCount = 0;
      }

      // Exit 2: Chandelier backup
      if (close < trailingHigh - chandelierMult * curATR) forceExit = true;
    }

    // --- ENTRY ---
    let enterSignal = false;
    let enterMA = null;
    if (position === 0 && t >= cooldownUntil) {
      // Check each MA level (deepest first = highest priority)
      for (const m of BOUNCE_LEVELS) {
        const maVal = mas[m.key] ? mas[m.key][t] : null;
        const maPrev = mas[m.key] ? mas[m.key][t - 1] : null;
        if (maVal == null || maPrev == null) continue;

        // Bounce: yesterday's low touched/pierced MA zone, today closes above with bullish candle
        const touchedMA = aligned[t - 1].low <= maPrev * (1 + m.touchZone);
        const bouncedAbove = close > maVal;
        const bullishCandle = close > aligned[t].open;
        // Win-rate filter: require RSI < 55 (genuine dip, not distribution)
        const curRSI = rsiAligned[t] ?? 50;
        const rsiDip = curRSI < 55;
        // Win-rate filter: bounce candle must have meaningful body (>30% of range)
        const candleRange = aligned[t].high - aligned[t].low;
        const candleBody = close - aligned[t].open;
        const strongBounce = candleRange > 0 ? (candleBody / candleRange) > 0.3 : false;

        if (touchedMA && bouncedAbove && bullishCandle && rsiDip && strongBounce) {
          enterSignal = true;
          enterMA = m.key;
          break; // deepest MA wins
        }
      }
    }

    // --- EXECUTE ---
    if (enterSignal && position === 0) {
      position = 1;
      entryPrice = close;
      entryIdx = t;
      trailingHigh = close;
      bounceMA = enterMA;
      failCount = 0;
      lastAction = 1;
    }
    if (forceExit && position === 1) {
      const retPct = ((close - entryPrice) / entryPrice) * 100;
      position = 0;
      trades.push({
        entryDate: aligned[entryIdx].date,
        exitDate: aligned[t].date,
        entryPrice,
        exitPrice: close,
        returnPct: retPct,
        holdDays: t - entryIdx,
        bounceLevel: bounceMA
      });
      bounceMA = null;
      failCount = 0;
      cooldownUntil = t + cooldownBars;
      lastAction = 2;
    }

    const dailyRet = (close / prevClose) - 1;
    stratEquity.push(stratEquity[stratEquity.length - 1] * (1 + dailyRet * position));
  }

  // Record open trade if still in position at end of backtest
  if (position === 1) {
    const lastClose = aligned[len - 1].close;
    const retPct = ((lastClose - entryPrice) / entryPrice) * 100;
    trades.push({
      entryDate: aligned[entryIdx].date,
      exitDate: null,
      entryPrice,
      exitPrice: lastClose,
      returnPct: retPct,
      holdDays: (len - 1) - entryIdx,
      bounceLevel: bounceMA,
      open: true
    });
  }

  // Current action for signal display
  const L = len - 1;
  let currentAction;
  if (position === 1) {
    currentAction = 'BUY';
  } else if (lastAction === 2) {
    currentAction = 'SELL';
  } else {
    // Check if any MA is being tested right now
    let nearBounce = false;
    for (const m of BOUNCE_LEVELS) {
      const maVal = mas[m.key] ? mas[m.key][L] : null;
      if (maVal != null && aligned[L].close >= maVal * 0.99 && aligned[L].close <= maVal * 1.02) {
        nearBounce = true;
        break;
      }
    }
    currentAction = nearBounce ? 'HOLD' : 'SELL';
  }

  return { stratEquity, trades, currentAction, position, mas };
}

// --- Backtest statistics ---

function computeBacktestStats(rlEquity, bhEquity, trades, aligned) {
  const len = rlEquity.length;

  // Returns
  const rlReturn = ((rlEquity[len - 1] / rlEquity[0]) - 1) * 100;
  const bhReturn = ((bhEquity[len - 1] / bhEquity[0]) - 1) * 100;

  // Max drawdown
  function maxDrawdown(equity) {
    let peak = equity[0], maxDD = 0;
    for (let i = 1; i < equity.length; i++) {
      if (equity[i] > peak) peak = equity[i];
      const dd = ((peak - equity[i]) / peak) * 100;
      if (dd > maxDD) maxDD = dd;
    }
    return maxDD;
  }

  // Sharpe ratio (annualized, assuming 252 trading days)
  function sharpe(equity) {
    const returns = [];
    for (let i = 1; i < equity.length; i++) {
      returns.push((equity[i] / equity[i - 1]) - 1);
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
    const std = Math.sqrt(variance);
    return std === 0 ? 0 : (mean / std) * Math.sqrt(252);
  }

  // Drawdown series for charting
  const drawdownSeries = [];
  let peak = rlEquity[0];
  for (let i = 0; i < len; i++) {
    if (rlEquity[i] > peak) peak = rlEquity[i];
    drawdownSeries.push(-((peak - rlEquity[i]) / peak) * 100);
  }

  // Trade stats (exclude open trades from closed-trade statistics)
  const closedTrades = trades.filter(t => !t.open);
  const wins = closedTrades.filter(t => t.returnPct > 0);
  const losses = closedTrades.filter(t => t.returnPct <= 0);
  const avgWin = wins.length > 0 ? wins.reduce((a, t) => a + t.returnPct, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, t) => a + t.returnPct, 0) / losses.length : 0;
  const grossProfit = wins.reduce((a, t) => a + t.returnPct, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.returnPct, 0));
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss;
  const avgHoldDays = closedTrades.length > 0 ? closedTrades.reduce((a, t) => a + t.holdDays, 0) / closedTrades.length : 0;

  return {
    rlReturn: +rlReturn.toFixed(2),
    bhReturn: +bhReturn.toFixed(2),
    rlMaxDD: +maxDrawdown(rlEquity).toFixed(2),
    bhMaxDD: +maxDrawdown(bhEquity).toFixed(2),
    rlSharpe: +sharpe(rlEquity).toFixed(2),
    bhSharpe: +sharpe(bhEquity).toFixed(2),
    totalTrades: closedTrades.length,
    winRate: closedTrades.length > 0 ? +((wins.length / closedTrades.length) * 100).toFixed(1) : 0,
    avgWin: +avgWin.toFixed(2),
    avgLoss: +avgLoss.toFixed(2),
    profitFactor: profitFactor === Infinity ? 999 : +profitFactor.toFixed(2),
    avgHoldDays: +avgHoldDays.toFixed(1),
    trades: trades, // all trades during backtest period
    drawdownSeries: drawdownSeries.map(v => +v.toFixed(2))
  };
}

// Backtest period options (trading days approximation)
export const BACKTEST_PERIODS = [
  { key: '6m', label: '6 Months', days: 126 },
  { key: '1y', label: '1 Year', days: 252 },
  { key: '2y', label: '2 Years', days: 504 },
  { key: '3y', label: '3 Years', days: 756 },
];

// Strategy configs
export const STRATEGY_CONFIGS = [
  { key: 'config1', label: 'Config 1: Breakout', description: 'Channel breakout + trend following' },
  { key: 'config2', label: 'Config 2: Bounce', description: 'MA bounce + hold until failure' },
];

// --- Main signal + backtest function ---

export async function fetchSignals(tickerCode = 'GC=F', backtestPeriod = '6m', strategyKey = 'config1') {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 3); // 3 years for full backtest depth

  const hist = await fetchHistorical(tickerCode, start, end);

  if (hist.length < 215) {
    throw new Error(`Not enough historical data for ${tickerCode} (got ${hist.length} bars, need ~215)`);
  }

  const tickerInfo = TICKERS.find(t => t.ticker === tickerCode) || { code: tickerCode, name: tickerCode };

  // Compute raw indicators
  const sma50Raw = sma(hist, 50);
  const sma200Raw = sma(hist, 200);
  const rsiRaw = rsi(hist);
  const atrRaw = atr(hist);
  const macdRaw = macd(hist);
  const bbRaw = bollingerBands(hist, 20, 2);
  const stochRaw = stochastic(hist, 14, 3, 3);
  const volSmaRaw = volumeSma(hist, 20);
  const adxRaw = adx(hist, 14);

  // Align everything to start at index 199
  const offset = 199;
  const alignedLen = hist.length - offset;
  const aligned = hist.slice(offset);
  const sma50Aligned = sma50Raw.slice(offset - 49);
  const sma200Aligned = sma200Raw;
  const rsiAligned = rsiRaw.slice(offset - 14);
  const atrAligned = atrRaw.slice(offset - 1);

  const macdAligned = {
    macd: macdRaw.macd.slice(offset),
    signal: macdRaw.signal.slice(offset),
    histogram: macdRaw.histogram.slice(offset)
  };
  const bbAligned = {
    upper: bbRaw.upper.slice(offset - 19),
    middle: bbRaw.middle.slice(offset - 19),
    lower: bbRaw.lower.slice(offset - 19)
  };
  const stochKAligned = stochRaw.k.slice(offset - 15);
  const stochDAligned = stochRaw.d.slice(offset - 17);
  const volSmaAligned = volSmaRaw.slice(offset - 19);
  // ADX starts producing values after ~2×period bars; align to offset
  const adxAligned = adxRaw.length >= alignedLen ? adxRaw.slice(adxRaw.length - alignedLen) : adxRaw;

  // Regimes
  const regimes = sma200Aligned.map((s200, i) => (sma50Aligned[i] > s200 ? 2 : 0));

  const profile = getAssetProfile(tickerCode);
  const L = alignedLen - 1;
  const latestClose = aligned[L].close;
  const latestRegime = regimes[L];
  const latestRSI = rsiAligned[L] ?? 50;
  const latestATR = atrAligned[L];
  const latestADX = adxAligned[L] ?? 20;

  // Compute EMAs for display + Config 1
  const allCloses = aligned.map(h => h.close);
  const ema10 = ema(allCloses, profile.ema1);
  const ema30 = ema(allCloses, profile.ema2);
  const ema50 = ema(allCloses, profile.ema3);

  let stratEquity, trades, currentAction;

  if (strategyKey === 'config2') {
    // --- Config 2: MA Bounce Strategy ---
    const result = runBounceStrategy(aligned, rsiAligned, atrAligned);
    stratEquity = result.stratEquity;
    trades = result.trades;
    currentAction = result.currentAction;
  } else {
    // --- Config 1: Channel Breakout + Trend Following ---
    const result = runStrategy(aligned, regimes, rsiAligned, macdAligned.histogram, atrAligned, adxAligned, tickerCode);
    stratEquity = result.stratEquity;
    trades = result.trades;
    currentAction = result.currentAction;
  }

  const rlAction = currentAction;

  // --- Confluence factors (adapt to strategy) ---
  const factors = [];
  const rsiLow = profile.rsiBounds[0];
  const rsiHigh = profile.rsiBounds[1];

  if (strategyKey === 'config2') {
    // Config 2 bounce confluence factors

    // 1. Strategy signal
    factors.push({
      name: 'Bounce System',
      description: 'MA bounce strategy recommends BUY',
      passed: currentAction === 'BUY',
      value: currentAction
    });

    // 2. Near a key MA (within touch zone of any bounce level)
    const bounceMAs = {};
    for (const m of BOUNCE_LEVELS) {
      if (m.type === 'ema') bounceMAs[m.key] = ema(allCloses, m.period);
      else {
        const raw = sma(aligned, m.period);
        const pad = new Array(m.period - 1).fill(null);
        bounceMAs[m.key] = [...pad, ...raw];
      }
    }
    let nearestMA = null, nearestDist = Infinity;
    for (const m of BOUNCE_LEVELS) {
      const maVal = bounceMAs[m.key][L];
      if (maVal == null) continue;
      const dist = Math.abs(latestClose - maVal) / maVal;
      if (dist < nearestDist) { nearestDist = dist; nearestMA = m; }
    }
    const nearMA = nearestMA && nearestDist < 0.02;
    factors.push({
      name: 'MA Proximity',
      description: 'Price near a key moving average (bounce zone)',
      passed: nearMA,
      value: nearestMA ? `${(nearestDist * 100).toFixed(1)}% from ${nearestMA.key.toUpperCase()}` : 'N/A'
    });

    // 3. Bullish candle pattern (close > open)
    const bullish = aligned[L].close > aligned[L].open;
    factors.push({
      name: 'Bullish Candle',
      description: 'Current candle is bullish (close > open)',
      passed: bullish,
      value: bullish ? 'BULLISH' : 'BEARISH'
    });

    // 4. RSI not oversold crash (RSI > 25 = healthy dip, not crash)
    factors.push({
      name: 'RSI Dip Quality',
      description: 'RSI above 25 (healthy dip, not crash)',
      passed: latestRSI > 25 && latestRSI < 70,
      value: latestRSI.toFixed(1)
    });

    // 5. Price above SMA 200 (macro uptrend)
    const sma200Val = bounceMAs['sma200'][L];
    const aboveSMA200 = sma200Val != null && latestClose > sma200Val;
    factors.push({
      name: 'Macro Trend',
      description: 'Price above SMA 200 (long-term uptrend)',
      passed: aboveSMA200,
      value: aboveSMA200 ? 'ABOVE' : 'BELOW'
    });

    // 6. MACD direction
    const latestMACDHist = macdAligned.histogram[L];
    const prevMACDHist = macdAligned.histogram[L - 1];
    factors.push({
      name: 'MACD Momentum',
      description: 'MACD histogram rising (momentum recovering)',
      passed: latestMACDHist > prevMACDHist,
      value: latestMACDHist > prevMACDHist ? 'RISING' : 'FALLING'
    });

    // 7. Volume on bounce
    const latestVol = aligned[L].volume;
    const latestVolSma = volSmaAligned[L] || 1;
    const volRatio = latestVol / latestVolSma;
    factors.push({
      name: 'Volume',
      description: 'Volume above average (conviction)',
      passed: volRatio >= 0.8,
      value: `${(volRatio * 100).toFixed(0)}% avg`
    });

    // 8. SMA 50 > SMA 200 (bull regime)
    factors.push({
      name: 'Trend Regime',
      description: 'SMA 50 > SMA 200 (bull market)',
      passed: latestRegime === 2,
      value: latestRegime === 2 ? 'BULL' : 'BEAR/NEUTRAL'
    });

  } else {
    // Config 1 breakout confluence factors (unchanged)

    // Donchian for confluence display
    const dch = donchian(aligned, profile.breakoutLen);
    const dchIdx = L - profile.breakoutLen;
    const atBreakout = dchIdx >= 0 && dchIdx < dch.upper.length && latestClose > dch.upper[dchIdx];

    factors.push({
      name: 'Trend System',
      description: 'Channel breakout strategy recommends BUY',
      passed: currentAction === 'BUY',
      value: currentAction
    });

    const emaAlignedFlag = ema10[L] > ema30[L] && ema30[L] > ema50[L];
    factors.push({
      name: 'EMA Alignment',
      description: 'EMA 10 > EMA 30 > EMA 50 (stacked uptrend)',
      passed: emaAlignedFlag,
      value: emaAlignedFlag ? 'ALIGNED' : 'MIXED'
    });

    factors.push({
      name: 'Channel Breakout',
      description: `Price above ${profile.breakoutLen}-day Donchian high`,
      passed: atBreakout,
      value: atBreakout ? 'BREAKOUT' : 'INSIDE'
    });

    factors.push({
      name: 'Trend Regime',
      description: 'SMA 50 > SMA 200 (bull market)',
      passed: latestRegime === 2,
      value: latestRegime === 2 ? 'BULL' : 'BEAR/NEUTRAL'
    });

    factors.push({
      name: 'RSI Filter',
      description: `RSI between ${rsiLow}-${rsiHigh} (momentum room)`,
      passed: latestRSI >= rsiLow && latestRSI <= rsiHigh,
      value: latestRSI.toFixed(1)
    });

    const latestMACDHist = macdAligned.histogram[L];
    const prevMACDHist = macdAligned.histogram[L - 1];
    factors.push({
      name: 'MACD',
      description: 'MACD histogram positive (bullish momentum)',
      passed: latestMACDHist > 0,
      value: latestMACDHist > 0 ? 'BULLISH' : 'BEARISH'
    });

    factors.push({
      name: 'MACD Momentum',
      description: 'MACD histogram rising (accelerating)',
      passed: latestMACDHist > prevMACDHist,
      value: latestMACDHist > prevMACDHist ? 'RISING' : 'FALLING'
    });

    factors.push({
      name: 'ADX Trend Quality',
      description: 'ADX above 20 (trending market)',
      passed: latestADX >= 20,
      value: latestADX.toFixed(1)
    });

    const ema50Now = ema50[L];
    const ema50Prev = ema50[Math.max(0, L - 10)];
    const ema50Rising = ema50Now > ema50Prev;
    factors.push({
      name: 'Trend Strength',
      description: 'Price above EMA 50 and EMA 50 rising',
      passed: latestClose > ema50Now && ema50Rising,
      value: ema50Rising ? `+${(((ema50Now - ema50Prev) / ema50Prev) * 100).toFixed(2)}%` : `${(((ema50Now - ema50Prev) / ema50Prev) * 100).toFixed(2)}%`
    });

    const latestVol = aligned[L].volume;
    const latestVolSma = volSmaAligned[L] || 1;
    const volRatio = latestVol / latestVolSma;
    factors.push({
      name: 'Volume',
      description: 'Volume above 20-day average',
      passed: volRatio >= 1.0,
      value: `${(volRatio * 100).toFixed(0)}% avg`
    });
  }

  // Confluence scoring — need 70%+ of factors
  const passedCount = factors.filter(f => f.passed).length;
  const totalFactors = factors.length;
  const confluenceScore = Math.round((passedCount / totalFactors) * 100);
  const confluence = confluenceScore >= 70;

  let entry = null, tp = null, sl = null, winProb = 55, totalSetups = 0;

  if (confluence) {
    entry = latestClose;
    tp = entry + profile.tpMultiplier * latestATR;
    sl = entry - profile.slMultiplier * latestATR;

    // Historical win probability
    let wins = 0, total = 0;
    for (let i = 200; i < alignedLen - 30; i++) {
      const pastBull = regimes[i] === 2;
      const pastEMAOk = ema10[i] > ema30[i] && ema30[i] > ema50[i];
      const pastMACDPos = macdAligned.histogram[i] > 0;
      const pastADXOk = (adxAligned[i] ?? 20) >= 20;
      const pastRSI = rsiAligned[i] ?? 50;
      const pastRSIOk = pastRSI >= rsiLow && pastRSI <= rsiHigh;
      const pastScore = [pastBull, pastEMAOk, pastMACDPos, pastADXOk, pastRSIOk].filter(Boolean).length;
      if (pastScore >= 4) {
        total++;
        const pastEntry = aligned[i].close;
        const pastTP = pastEntry + profile.tpMultiplier * atrAligned[i];
        const pastSL = pastEntry - profile.slMultiplier * atrAligned[i];
        let hitTP = false;
        for (let k = i + 1; k < Math.min(i + 30, alignedLen); k++) {
          if (aligned[k].close >= pastTP) { hitTP = true; break; }
          if (aligned[k].close <= pastSL) break;
        }
        if (hitTP) wins++;
      }
    }
    winProb = total > 0 ? Math.round((wins / total) * 100) : 55;
    totalSetups = total;
  }

  // Use strategy equity (renamed from rlEquity for API compat)
  const rlEquity = stratEquity;

  const dates = aligned.map(h => h.date);
  const prices = aligned.map(h => h.close);

  // Full equity curves for RL training reference
  const bhEquityFull = aligned.map(h => 10000 * (h.close / aligned[0].close));

  // Backtest display: configurable period
  const periodConfig = BACKTEST_PERIODS.find(p => p.key === backtestPeriod) || BACKTEST_PERIODS[0];
  const btWindow = Math.min(periodConfig.days, alignedLen);
  const btStart = alignedLen - btWindow;
  const btAligned = aligned.slice(btStart);
  const btRLEquity = rlEquity.slice(btStart).map(v => 10000 * (v / rlEquity[btStart]));
  const btBHEquity = btAligned.map(h => 10000 * (h.close / btAligned[0].close));
  const btTrades = trades.filter(t => t.entryDate >= btAligned[0].date);

  // Compute backtest statistics
  const backtest = computeBacktestStats(btRLEquity, btBHEquity, btTrades, btAligned);
  backtest.periodLabel = periodConfig.label;

  const activeConfig = STRATEGY_CONFIGS.find(s => s.key === strategyKey) || STRATEGY_CONFIGS[0];

  return {
    tickerInfo,
    strategyKey,
    strategyLabel: activeConfig.label,
    signal: {
      currentPrice: latestClose,
      rlAction,
      regime: latestRegime === 2 ? 'BULL' : 'BEAR/NEUTRAL',
      rsi: latestRSI,
      atr: latestATR,
      confluence,
      confluenceScore,
      passedCount,
      totalFactors,
      factors,
      entry,
      tp,
      sl,
      winProb,
      totalSetups,
      date: hist[hist.length - 1].date
    },
    charts: {
      dates,
      prices,
      sma50: ema50.map(v => +v.toFixed(2)),
      sma200: sma200Aligned.map(v => +v.toFixed(2)),
      macdHist: macdAligned.histogram.map(v => +v.toFixed(2)),
      // Backtest charts use 6-month window
      btDates: btAligned.map(h => h.date),
      bhEquity: btBHEquity,
      rlEquity: btRLEquity,
      drawdown: backtest.drawdownSeries
    },
    backtest,
  };
}
