import yahooFinance from 'yahoo-finance2';

const TOP_40_CODES = [
  'BHG','BTI','ANH','PRX','GLN','CFR','AGL','ANG','NPN','GFI',
  'FSR','SBK','CPI','MTN','VAL','VOD','ABG','S32','IMP','SLM',
  'DSY','SHP','HAR','BID','SOL','SSW','NED','NPH','RNI','OUT',
  'KIO','NRP','REM','INP','PPH','MNP','BVT','EXX','CLS','PAN'
];

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

function runQLearning(satrix, regimes, rsiVals) {
  const nStates = 9, nActions = 3;
  const Q = Array.from({ length: nStates }, () => Array(nActions).fill(0));
  const alpha = 0.1, gamma = 0.95, epsilon = 0.1;

  const states = regimes.map((reg, i) => {
    const rsiBucket = rsiVals[i - 14] || 50;
    const bucket = rsiBucket < 45 ? 0 : rsiBucket > 65 ? 2 : 1;
    return Math.min(8, reg * 3 + bucket);
  });

  for (let ep = 0; ep < 100; ep++) {
    let position = 0;
    for (let t = 1; t < satrix.length - 1; t++) {
      const st = states[t];
      const action = Math.random() < epsilon
        ? Math.floor(Math.random() * 3)
        : Q[st].indexOf(Math.max(...Q[st]));
      let reward = 0;
      if (action === 1 && position === 0) { position = 1; reward -= 0.001; }
      if (action === 2 && position === 1) { position = 0; reward -= 0.001; }
      const dailyRet = (satrix[t + 1].close / satrix[t].close) - 1;
      reward += dailyRet * position;
      const nextSt = states[t + 1];
      Q[st][action] += alpha * (reward + gamma * Math.max(...Q[nextSt]) - Q[st][action]);
    }
  }

  const rlEquity = [10000];
  let position = 0;
  for (let t = 1; t < satrix.length; t++) {
    const action = Q[states[t - 1]].indexOf(Math.max(...Q[states[t - 1]]));
    if (action === 1) position = 1;
    if (action === 2) position = 0;
    const dailyRet = (satrix[t].close / satrix[t - 1].close) - 1;
    rlEquity.push(rlEquity[rlEquity.length - 1] * (1 + dailyRet * position));
  }

  return { Q, states, rlEquity };
}

function toDateStr(d) {
  if (d instanceof Date) return d.toISOString().split('T')[0];
  if (typeof d === 'string') return d.split('T')[0];
  return String(d);
}

export async function fetchSignals() {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);

  const satrixRaw = await yahooFinance.chart('STX40.JO', {
    period1: start,
    period2: end,
    interval: '1d'
  });

  const quotes = satrixRaw.quotes;
  if (!quotes || quotes.length < 200) {
    throw new Error(`Not enough historical data (got ${quotes ? quotes.length : 0} bars)`);
  }

  const satrix = quotes
    .filter(h => h.close != null)
    .map(h => ({
      date: toDateStr(h.date),
      open: h.open || h.close,
      high: h.high || h.close,
      low: h.low || h.close,
      close: h.adjclose || h.close
    }));

  if (satrix.length < 200) {
    throw new Error(`Not enough valid data after filtering (got ${satrix.length} bars)`);
  }

  const sma50 = sma(satrix, 50);
  const sma200 = sma(satrix, 200);
  const rsiVals = rsi(satrix);
  const atrVals = atr(satrix);

  const regimes = sma50.map((s, i) => (s > sma200[i] ? 2 : 0));
  const { Q, states, rlEquity } = runQLearning(satrix, regimes, rsiVals);

  const latestClose = satrix[satrix.length - 1].close;
  const latestRegime = regimes[regimes.length - 1];
  const latestRSI = rsiVals[rsiVals.length - 1] || 50;
  const latestATR = atrVals[atrVals.length - 1];

  const rlAction = ['HOLD', 'BUY', 'SELL'][
    Q[states[states.length - 1]].indexOf(Math.max(...Q[states[states.length - 1]]))
  ];

  const confluence = (rlAction === 'BUY' && latestRegime === 2 && latestRSI >= 45 && latestRSI <= 65);

  let entry = null, tp = null, sl = null, winProb = 55, totalSetups = 0;

  if (confluence) {
    entry = latestClose;
    tp = entry + 2 * latestATR;
    sl = entry - 1 * latestATR;

    let wins = 0, total = 0;
    for (let i = 200; i < satrix.length - 30; i++) {
      const pastSMA50 = sma50[i - 200 + 50];
      const pastSMA200 = sma200[i - 200];
      const pastBull = pastSMA50 > pastSMA200;
      const pastRSI = rsiVals[i - 14] || 50;
      if (pastBull && pastRSI >= 45 && pastRSI <= 65) {
        total++;
        const pastEntry = satrix[i].close;
        const pastTP = pastEntry + 2 * atrVals[i];
        const pastSL = pastEntry - 1 * atrVals[i];
        let hitTP = false;
        for (let k = i + 1; k < Math.min(i + 30, satrix.length); k++) {
          if (satrix[k].close >= pastTP) { hitTP = true; break; }
          if (satrix[k].close <= pastSL) break;
        }
        if (hitTP) wins++;
      }
    }
    winProb = total > 0 ? Math.round((wins / total) * 100) : 55;
    totalSetups = total;
  }

  const dates = satrix.map(h => h.date).slice(-252);
  const prices = satrix.map(h => h.close).slice(-252);
  const bhEquity = satrix.map(h => 10000 * (h.close / satrix[0].close)).slice(-252);

  // Fetch top 40 quotes in parallel, with timeout
  const top40Data = [];
  const quotePromises = TOP_40_CODES.slice(0, 10).map(async (code) => {
    try {
      const q = await yahooFinance.quote(`${code}.JO`);
      return {
        code,
        name: q.shortName || code,
        price: q.regularMarketPrice,
        change: q.regularMarketChangePercent
      };
    } catch {
      return null;
    }
  });

  const quoteResults = await Promise.allSettled(quotePromises);
  for (const r of quoteResults) {
    if (r.status === 'fulfilled' && r.value) top40Data.push(r.value);
  }

  return {
    signal: {
      currentPrice: latestClose,
      rlAction,
      regime: latestRegime === 2 ? 'BULL' : 'BEAR/NEUTRAL',
      rsi: latestRSI,
      atr: latestATR,
      confluence,
      entry,
      tp,
      sl,
      winProb,
      totalSetups,
      date: satrix[satrix.length - 1].date
    },
    charts: {
      dates,
      prices,
      bhEquity,
      rlEquity: rlEquity.slice(-252),
      sma50: sma50.slice(-252),
      sma200: sma200.slice(-252)
    },
    top40: top40Data
  };
}
