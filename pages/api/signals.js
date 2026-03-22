import { fetchSignals, TICKERS } from '../../lib/signals';

export const maxDuration = 60;

// Per-ticker cache
const cache = new Map();
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

export default async function handler(req, res) {
  try {
    const tickerParam = req.query.ticker || 'STX40.JO';
    // Validate ticker
    const valid = TICKERS.find(t => t.ticker === tickerParam);
    if (!valid) {
      return res.status(400).json({ error: `Unknown ticker: ${tickerParam}` });
    }

    const now = Date.now();
    const cached = cache.get(tickerParam);
    if (cached && (now - cached.time) < CACHE_DURATION) {
      return res.status(200).json(cached.data);
    }

    const data = await fetchSignals(tickerParam);
    cache.set(tickerParam, { data, time: now });

    res.status(200).json(data);
  } catch (error) {
    console.error('Signal fetch error:', error);
    res.status(500).json({
      error: error.message || 'Unknown server error'
    });
  }
}
