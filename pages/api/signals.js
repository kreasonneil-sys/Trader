import { fetchSignals } from '../../lib/signals';

export const maxDuration = 60;

let cachedData = null;
let cacheTime = 0;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

export default async function handler(req, res) {
  try {
    const now = Date.now();
    if (cachedData && (now - cacheTime) < CACHE_DURATION) {
      return res.status(200).json(cachedData);
    }

    const data = await fetchSignals();
    cachedData = data;
    cacheTime = now;

    res.status(200).json(data);
  } catch (error) {
    console.error('Signal fetch error:', error);
    res.status(500).json({
      error: error.message || 'Unknown server error'
    });
  }
}
