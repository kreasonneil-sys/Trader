export const TICKERS = [
  { code: 'STX40', ticker: 'STX40.JO', name: 'Satrix 40 ETF' },
  { code: 'BHG',   ticker: 'BHG.JO',   name: 'BHP Group' },
  { code: 'PRX',   ticker: 'PRX.JO',   name: 'Prosus' },
  { code: 'ANH',   ticker: 'ANH.JO',   name: 'AB InBev' },
  { code: 'CFR',   ticker: 'CFR.JO',   name: 'Richemont' },
  { code: 'GLN',   ticker: 'GLN.JO',   name: 'Glencore' },
  { code: 'NPN',   ticker: 'NPN.JO',   name: 'Naspers' },
  { code: 'BTI',   ticker: 'BTI.JO',   name: 'British American Tobacco' },
  { code: 'AGL',   ticker: 'AGL.JO',   name: 'Anglo American' },
  { code: 'GFI',   ticker: 'GFI.JO',   name: 'Gold Fields' },
  { code: 'ANG',   ticker: 'ANG.JO',   name: 'AngloGold Ashanti' },
  { code: 'FSR',   ticker: 'FSR.JO',   name: 'FirstRand' },
  { code: 'SBK',   ticker: 'SBK.JO',   name: 'Standard Bank' },
  { code: 'MTN',   ticker: 'MTN.JO',   name: 'MTN Group' },
  { code: 'SOL',   ticker: 'SOL.JO',   name: 'Sasol' },
  { code: 'SHP',   ticker: 'SHP.JO',   name: 'Shoprite' },
  { code: 'VOD',   ticker: 'VOD.JO',   name: 'Vodacom' },
  { code: 'ABG',   ticker: 'ABG.JO',   name: 'Absa Group' },
  { code: 'CPI',   ticker: 'CPI.JO',   name: 'Capitec' },
  { code: 'IMP',   ticker: 'IMP.JO',   name: 'Impala Platinum' },
  { code: 'SLM',   ticker: 'SLM.JO',   name: 'Sanlam' },
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

// --- RL Q-Learning ---

function runQLearning(aligned, regimes, rsiAligned, macdHist, atrAligned) {
  // Expanded state space: regime(3) × RSI bucket(3) × MACD direction(2) × volatility(2) = 36 states
  const nStates = 36, nActions = 3;
  const Q = Array.from({ length: nStates }, () => Array(nActions).fill(0));
  const alpha = 0.15, gamma = 0.95;
  const len = aligned.length;
  const txCost = 0.0015; // 0.15% transaction cost (realistic for JSE)

  // Compute median ATR for volatility bucketing
  const sortedATR = atrAligned.slice().sort((a, b) => a - b);
  const medianATR = sortedATR[Math.floor(sortedATR.length / 2)];

  const states = regimes.map((reg, i) => {
    const r = rsiAligned[i] ?? 50;
    const rsiBucket = r < 40 ? 0 : r > 60 ? 2 : 1;
    const macdDir = (macdHist[i] ?? 0) > 0 ? 1 : 0;
    const volBucket = (atrAligned[i] ?? medianATR) > medianATR ? 1 : 0;
    return Math.min(nStates - 1, reg * 12 + rsiBucket * 4 + macdDir * 2 + volBucket);
  });

  // Training with epsilon decay: 500 episodes
  for (let ep = 0; ep < 500; ep++) {
    const epsilon = Math.max(0.01, 0.3 * Math.exp(-ep / 100)); // decay from 0.3 to ~0.01
    let position = 0;
    for (let t = 1; t < len - 1; t++) {
      const st = states[t];
      const action = Math.random() < epsilon
        ? Math.floor(Math.random() * 3)
        : Q[st].indexOf(Math.max(...Q[st]));
      let reward = 0;
      if (action === 1 && position === 0) { position = 1; reward -= txCost; }
      if (action === 2 && position === 1) { position = 0; reward -= txCost; }
      const dailyRet = (aligned[t + 1].close / aligned[t].close) - 1;
      // Momentum-weighted reward: bonus for trend-following
      const trendBonus = regimes[t] === 2 && dailyRet > 0 ? dailyRet * 0.2 : 0;
      reward += dailyRet * position + trendBonus * position;
      const nextSt = states[t + 1];
      Q[st][action] += alpha * (reward + gamma * Math.max(...Q[nextSt]) - Q[st][action]);
    }
  }

  // Forward pass with trailing stop-loss
  const rlEquity = [10000];
  let position = 0;
  const trades = [];
  let entryPrice = 0, entryIdx = 0, trailingHigh = 0;
  for (let t = 1; t < len; t++) {
    const action = Q[states[t - 1]].indexOf(Math.max(...Q[states[t - 1]]));
    const curATR = atrAligned[t] ?? atrAligned[atrAligned.length - 1];

    // Trailing stop-loss: exit if price drops 2× ATR from peak since entry
    let forceExit = false;
    if (position === 1) {
      if (aligned[t].close > trailingHigh) trailingHigh = aligned[t].close;
      if (aligned[t].close < trailingHigh - 2.0 * curATR) forceExit = true;
    }

    if (action === 1 && position === 0) {
      position = 1;
      entryPrice = aligned[t].close;
      entryIdx = t;
      trailingHigh = aligned[t].close;
    }
    if ((action === 2 || forceExit) && position === 1) {
      position = 0;
      trades.push({
        entryDate: aligned[entryIdx].date,
        exitDate: aligned[t].date,
        entryPrice,
        exitPrice: aligned[t].close,
        returnPct: ((aligned[t].close - entryPrice) / entryPrice) * 100,
        holdDays: t - entryIdx
      });
    }
    const dailyRet = (aligned[t].close / aligned[t - 1].close) - 1;
    rlEquity.push(rlEquity[rlEquity.length - 1] * (1 + dailyRet * position));
  }

  return { Q, states, rlEquity, trades };
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

  // Trade stats
  const wins = trades.filter(t => t.returnPct > 0);
  const losses = trades.filter(t => t.returnPct <= 0);
  const avgWin = wins.length > 0 ? wins.reduce((a, t) => a + t.returnPct, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, t) => a + t.returnPct, 0) / losses.length : 0;
  const grossProfit = wins.reduce((a, t) => a + t.returnPct, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.returnPct, 0));
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss;
  const avgHoldDays = trades.length > 0 ? trades.reduce((a, t) => a + t.holdDays, 0) / trades.length : 0;

  return {
    rlReturn: +rlReturn.toFixed(2),
    bhReturn: +bhReturn.toFixed(2),
    rlMaxDD: +maxDrawdown(rlEquity).toFixed(2),
    bhMaxDD: +maxDrawdown(bhEquity).toFixed(2),
    rlSharpe: +sharpe(rlEquity).toFixed(2),
    bhSharpe: +sharpe(bhEquity).toFixed(2),
    totalTrades: trades.length,
    winRate: trades.length > 0 ? +((wins.length / trades.length) * 100).toFixed(1) : 0,
    avgWin: +avgWin.toFixed(2),
    avgLoss: +avgLoss.toFixed(2),
    profitFactor: profitFactor === Infinity ? 999 : +profitFactor.toFixed(2),
    avgHoldDays: +avgHoldDays.toFixed(1),
    trades: trades.slice(-20), // last 20 trades for display
    drawdownSeries: drawdownSeries.map(v => +v.toFixed(2))
  };
}

// --- Main signal + backtest function ---

export async function fetchSignals(tickerCode = 'STX40.JO') {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 2); // 2 years for better backtest depth

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

  // Regimes
  const regimes = sma200Aligned.map((s200, i) => (sma50Aligned[i] > s200 ? 2 : 0));

  // RL Q-Learning (expanded state space with MACD + volatility)
  const { Q, states, rlEquity, trades } = runQLearning(aligned, regimes, rsiAligned, macdAligned.histogram, atrAligned);

  const L = alignedLen - 1;
  const latestClose = aligned[L].close;
  const latestRegime = regimes[L];
  const latestRSI = rsiAligned[L] ?? 50;
  const latestATR = atrAligned[L];

  const rlAction = ['HOLD', 'BUY', 'SELL'][
    Q[states[states.length - 1]].indexOf(Math.max(...Q[states[states.length - 1]]))
  ];

  // --- Confluence factors ---
  const factors = [];

  factors.push({
    name: 'RL Q-Learning',
    description: 'RL agent recommends BUY',
    passed: rlAction === 'BUY',
    value: rlAction
  });

  factors.push({
    name: 'Trend Regime',
    description: 'SMA 50 > SMA 200 (bull market)',
    passed: latestRegime === 2,
    value: latestRegime === 2 ? 'BULL' : 'BEAR/NEUTRAL'
  });

  factors.push({
    name: 'RSI Filter',
    description: 'RSI between 40-70 (momentum room)',
    passed: latestRSI >= 40 && latestRSI <= 70,
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

  const bbUpper = bbAligned.upper[L];
  const bbMiddle = bbAligned.middle[L];
  const bbLower = bbAligned.lower[L];
  factors.push({
    name: 'Bollinger Position',
    description: 'Price between middle and upper band',
    passed: latestClose > bbMiddle && latestClose < bbUpper,
    value: latestClose > bbUpper ? 'ABOVE' : latestClose > bbMiddle ? 'MID-UPPER' : latestClose > bbLower ? 'LOWER-MID' : 'BELOW'
  });

  const latestK = stochKAligned[L] ?? 50;
  const latestD = stochDAligned[L] ?? 50;
  factors.push({
    name: 'Stochastic',
    description: '%K > %D and below 80 (bullish, not overbought)',
    passed: latestK > latestD && latestK < 80,
    value: `K:${latestK.toFixed(0)} D:${latestD.toFixed(0)}`
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

  // Trend strength: price above SMA50 and SMA50 slope positive (10-day)
  const sma50Now = sma50Aligned[L];
  const sma50Prev = sma50Aligned[L - 10] ?? sma50Aligned[0];
  const sma50Slope = ((sma50Now - sma50Prev) / sma50Prev) * 100;
  factors.push({
    name: 'Trend Strength',
    description: 'Price above SMA 50 and SMA 50 rising',
    passed: latestClose > sma50Now && sma50Slope > 0,
    value: sma50Slope > 0 ? `+${sma50Slope.toFixed(2)}%` : `${sma50Slope.toFixed(2)}%`
  });

  // Confluence scoring — need 6 of 9 (67%+)
  const passedCount = factors.filter(f => f.passed).length;
  const totalFactors = factors.length;
  const confluenceScore = Math.round((passedCount / totalFactors) * 100);
  const confluence = confluenceScore >= 67;

  let entry = null, tp = null, sl = null, winProb = 55, totalSetups = 0;

  if (confluence) {
    entry = latestClose;
    tp = entry + 2 * latestATR;
    sl = entry - 1 * latestATR;

    let wins = 0, total = 0;
    for (let i = 0; i < alignedLen - 30; i++) {
      const pastBull = regimes[i] === 2;
      const pastRSI = rsiAligned[i] ?? 50;
      const pastMACDPos = macdAligned.histogram[i] > 0;
      const pastBBOk = aligned[i].close > bbAligned.middle[i] && aligned[i].close < bbAligned.upper[i];
      const pastAboveSMA = aligned[i].close > (sma50Aligned[i] ?? aligned[i].close);
      const pastScore = [pastBull, pastRSI >= 40 && pastRSI <= 70, pastMACDPos, pastBBOk, pastAboveSMA].filter(Boolean).length;
      if (pastScore >= 4) {
        total++;
        const pastEntry = aligned[i].close;
        const pastTP = pastEntry + 2 * atrAligned[i];
        const pastSL = pastEntry - 1 * atrAligned[i];
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

  const dates = aligned.map(h => h.date);
  const prices = aligned.map(h => h.close);

  // Full equity curves for RL training reference
  const bhEquityFull = aligned.map(h => 10000 * (h.close / aligned[0].close));

  // Backtest display: last 6 months (~126 trading days)
  const btWindow = Math.min(126, alignedLen);
  const btStart = alignedLen - btWindow;
  const btAligned = aligned.slice(btStart);
  const btRLEquity = rlEquity.slice(btStart).map(v => 10000 * (v / rlEquity[btStart]));
  const btBHEquity = btAligned.map(h => 10000 * (h.close / btAligned[0].close));
  const btTrades = trades.filter(t => t.entryDate >= btAligned[0].date);

  // Compute backtest statistics on the 6-month window
  const backtest = computeBacktestStats(btRLEquity, btBHEquity, btTrades, btAligned);

  return {
    tickerInfo,
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
      sma50: sma50Aligned.map(v => +v.toFixed(2)),
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
