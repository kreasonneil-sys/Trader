import { fetchSignals, TICKERS, BACKTEST_PERIODS } from '../../lib/signals';

export const maxDuration = 60;

// Per-ticker+period cache
const cache = new Map();
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

export default async function handler(req, res) {
  try {
    const tickerParam = req.query.ticker || 'STX40.JO';
    const periodParam = req.query.period || '6m';

    // Validate ticker
    const valid = TICKERS.find(t => t.ticker === tickerParam);
    if (!valid) {
      return res.status(400).json({ error: `Unknown ticker: ${tickerParam}` });
    }

    // Validate period
    const validPeriod = BACKTEST_PERIODS.find(p => p.key === periodParam);
    if (!validPeriod) {
      return res.status(400).json({ error: `Invalid period: ${periodParam}. Use: ${BACKTEST_PERIODS.map(p => p.key).join(', ')}` });
    }

    const cacheKey = `${tickerParam}:${periodParam}`;
    const now = Date.now();
    const cached = cache.get(cacheKey);
    if (cached && (now - cached.time) < CACHE_DURATION) {
      return res.status(200).json(cached.data);
    }

    const data = await fetchSignals(tickerParam, periodParam);
    cache.set(cacheKey, { data, time: now });

    res.status(200).json(data);
  } catch (error) {
    console.error('Signal fetch error:', error);
    res.status(500).json({
      error: error.message || 'Unknown server error'
    });
  }
}
