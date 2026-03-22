const TOP_40_CODES = [
  'BHG','BTI','ANH','PRX','GLN','CFR','AGL','ANG','NPN','GFI',
  'FSR','SBK','CPI','MTN','VAL','VOD','ABG','S32','IMP','SLM',
  'DSY','SHP','HAR','BID','SOL','SSW','NED','NPH','RNI','OUT',
  'KIO','NRP','REM','INP','PPH','MNP','BVT','EXX','CLS','PAN'
];

// Fetch Yahoo Finance crumb + cookie, then download CSV
async function fetchYahooCSV(ticker, period1, period2) {
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // Step 1: Get crumb + cookies from Yahoo
  const crumbUrl = 'https://query2.finance.yahoo.com/v1/test/getcrumb';
  const initRes = await fetch('https://finance.yahoo.com/quote/AAPL/', {
    headers: { 'User-Agent': userAgent },
    redirect: 'follow'
  });
  const cookies = initRes.headers.getSetCookie?.() || [];
  const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');

  const crumbRes = await fetch(crumbUrl, {
    headers: { 'User-Agent': userAgent, 'Cookie': cookieStr }
  });
  const crumb = await crumbRes.text();

  // Step 2: Download historical CSV
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

  // Parse CSV - headers: Date,Open,High,Low,Close,Adj Close,Volume
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 6 || cols[4] === 'null') continue;
    rows.push({
      date: cols[0],
      open: parseFloat(cols[1]) || parseFloat(cols[4]),
      high: parseFloat(cols[2]) || parseFloat(cols[4]),
      low: parseFloat(cols[3]) || parseFloat(cols[4]),
      close: parseFloat(cols[5]) || parseFloat(cols[4]) // Adj Close
    });
  }
  return rows;
}

// Fallback: use Yahoo v8 chart JSON API (no crumb needed)
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
      close
    });
  }
  return rows;
}

async function fetchHistorical(ticker, period1, period2) {
  // Try v8 chart API first (no auth needed), then CSV fallback
  try {
    const data = await fetchYahooChart(ticker, period1, period2);
    if (data.length > 0) return data;
  } catch (e) {
    console.log(`v8 chart failed for ${ticker}: ${e.message}`);
  }

  return await fetchYahooCSV(ticker, period1, period2);
}

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

// aligned = price data trimmed to start at index 199 (where SMA200 begins)
// regimes, rsiAligned, atrAligned must all have the same length as aligned
function runQLearning(aligned, regimes, rsiAligned) {
  const nStates = 9, nActions = 3;
  const Q = Array.from({ length: nStates }, () => Array(nActions).fill(0));
  const alpha = 0.1, gamma = 0.95, epsilon = 0.1;
  const len = aligned.length;

  const states = regimes.map((reg, i) => {
    const r = rsiAligned[i] ?? 50;
    const bucket = r < 45 ? 0 : r > 65 ? 2 : 1;
    return Math.min(8, reg * 3 + bucket);
  });

  for (let ep = 0; ep < 100; ep++) {
    let position = 0;
    for (let t = 1; t < len - 1; t++) {
      const st = states[t];
      const action = Math.random() < epsilon
        ? Math.floor(Math.random() * 3)
        : Q[st].indexOf(Math.max(...Q[st]));
      let reward = 0;
      if (action === 1 && position === 0) { position = 1; reward -= 0.001; }
      if (action === 2 && position === 1) { position = 0; reward -= 0.001; }
      const dailyRet = (aligned[t + 1].close / aligned[t].close) - 1;
      reward += dailyRet * position;
      const nextSt = states[t + 1];
      Q[st][action] += alpha * (reward + gamma * Math.max(...Q[nextSt]) - Q[st][action]);
    }
  }

  const rlEquity = [10000];
  let position = 0;
  for (let t = 1; t < len; t++) {
    const action = Q[states[t - 1]].indexOf(Math.max(...Q[states[t - 1]]));
    if (action === 1) position = 1;
    if (action === 2) position = 0;
    const dailyRet = (aligned[t].close / aligned[t - 1].close) - 1;
    rlEquity.push(rlEquity[rlEquity.length - 1] * (1 + dailyRet * position));
  }

  return { Q, states, rlEquity };
}

export async function fetchSignals() {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);

  // Fetch Satrix 40 historical data
  const satrix = await fetchHistorical('STX40.JO', start, end);

  if (satrix.length < 215) {
    throw new Error(`Not enough historical data (got ${satrix.length} bars, need ~215)`);
  }

  // Compute raw indicators (different lengths due to lookback periods)
  const sma50Raw = sma(satrix, 50);    // length = N - 49, aligned to satrix[49..]
  const sma200Raw = sma(satrix, 200);  // length = N - 199, aligned to satrix[199..]
  const rsiRaw = rsi(satrix);          // length = N - 14, aligned to satrix[14..]
  const atrRaw = atr(satrix);          // length = N - 1, aligned to satrix[1..]

  // Align everything to start at index 199 (where SMA200 first exists)
  // sma200Raw[0]   corresponds to satrix[199]
  // sma50Raw[i]    corresponds to satrix[i + 49], so for satrix[199] => sma50Raw[150]
  // rsiRaw[i]      corresponds to satrix[i + 14], so for satrix[199] => rsiRaw[185]
  // atrRaw[i]      corresponds to satrix[i + 1],  so for satrix[199] => atrRaw[198]
  const offset = 199;
  const alignedLen = satrix.length - offset;
  const aligned = satrix.slice(offset);                    // price data from index 199
  const sma50Aligned = sma50Raw.slice(offset - 49);        // sma50 from index 150
  const sma200Aligned = sma200Raw;                         // already starts at 199
  const rsiAligned = rsiRaw.slice(offset - 14);            // rsi from index 185
  const atrAligned = atrRaw.slice(offset - 1);             // atr from index 198

  // Regimes: bull when SMA50 > SMA200
  const regimes = sma200Aligned.map((s200, i) => (sma50Aligned[i] > s200 ? 2 : 0));

  // RL Q-Learning on aligned data
  const { Q, states, rlEquity } = runQLearning(aligned, regimes, rsiAligned);

  const latestClose = aligned[alignedLen - 1].close;
  const latestRegime = regimes[alignedLen - 1];
  const latestRSI = rsiAligned[alignedLen - 1] ?? 50;
  const latestATR = atrAligned[alignedLen - 1];

  const rlAction = ['HOLD', 'BUY', 'SELL'][
    Q[states[states.length - 1]].indexOf(Math.max(...Q[states[states.length - 1]]))
  ];

  const confluence = (rlAction === 'BUY' && latestRegime === 2 && latestRSI >= 45 && latestRSI <= 65);

  let entry = null, tp = null, sl = null, winProb = 55, totalSetups = 0;

  if (confluence) {
    entry = latestClose;
    tp = entry + 2 * latestATR;
    sl = entry - 1 * latestATR;

    // Historical win probability backtest over aligned data
    let wins = 0, total = 0;
    for (let i = 0; i < alignedLen - 30; i++) {
      const pastBull = regimes[i] === 2;
      const pastRSI = rsiAligned[i] ?? 50;
      if (pastBull && pastRSI >= 45 && pastRSI <= 65) {
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
  const bhEquity = aligned.map(h => 10000 * (h.close / aligned[0].close));

  // Fetch a few top 40 quotes in parallel (best effort, skip on failure)
  const top40Data = [];
  try {
    const quotePromises = TOP_40_CODES.slice(0, 5).map(async (code) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${code}.JO?interval=1d&range=1d`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (!res.ok) return null;
        const json = await res.json();
        const meta = json.chart?.result?.[0]?.meta;
        if (!meta) return null;
        return {
          code,
          name: meta.shortName || meta.symbol || code,
          price: meta.regularMarketPrice,
          change: meta.regularMarketPrice && meta.previousClose
            ? ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100)
            : 0
        };
      } catch { return null; }
    });
    const results = await Promise.allSettled(quotePromises);
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) top40Data.push(r.value);
    }
  } catch {
    // top40 quotes are optional
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
      rlEquity: rlEquity,
      sma50: sma50Aligned.map(v => +v.toFixed(2)),
      sma200: sma200Aligned.map(v => +v.toFixed(2))
    },
    top40: top40Data
  };
}
