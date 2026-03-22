import { useState, useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const chartOptions = (title) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    title: { display: true, text: title, color: '#e2e8f0', font: { size: 14 } },
    legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
    tooltip: { mode: 'index', intersect: false }
  },
  scales: {
    x: { ticks: { color: '#64748b', maxTicksLimit: 12, font: { size: 10 } }, grid: { color: '#1e293b' } },
    y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#1e293b' } }
  },
  elements: { point: { radius: 0 }, line: { tension: 0.1, borderWidth: 2 } }
});

export default function Home() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/signals')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch signals');
        return res.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="container">
        <div className="loading">
          <div className="spinner" />
          <p>Fetching JSE data & running RL model...</p>
          <p style={{ color: '#64748b', fontSize: '0.85rem' }}>This may take 30-60 seconds on first load</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="error">
          <h2>Error loading signals</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: '8px 24px', background: '#22c55e', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { signal, charts, top40 } = data;

  const priceChartData = {
    labels: charts.dates,
    datasets: [
      { label: 'Satrix 40', data: charts.prices, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.05)', fill: true },
      { label: 'SMA 50', data: charts.sma50, borderColor: '#f59e0b', borderDash: [5, 5] },
      { label: 'SMA 200', data: charts.sma200, borderColor: '#ef4444', borderDash: [5, 5] }
    ]
  };

  const equityChartData = {
    labels: charts.dates,
    datasets: [
      { label: 'Buy & Hold', data: charts.bhEquity, borderColor: '#64748b' },
      { label: 'RL Strategy', data: charts.rlEquity, borderColor: '#f97316' }
    ]
  };

  return (
    <div className="container">
      <h1>JSE Top 40 Confluence Signals</h1>
      <p className="subtitle">HMM Regime Detection + RL Q-Learning + Technical Confluence — Satrix 40 ETF</p>

      <div className={`confluence-banner ${signal.confluence ? 'confluence-active' : 'confluence-inactive'}`}>
        {signal.confluence
          ? '✅ CONFLUENCE TRIGGERED — All signals aligned for entry'
          : '❌ No confluence — Waiting for RL + Bull Regime + RSI alignment'}
      </div>

      <div className="grid">
        <div className="card">
          <h2>Signal Dashboard</h2>
          <div className="signal-row">
            <span className="signal-label">Date</span>
            <span className="signal-value">{signal.date}</span>
          </div>
          <div className="signal-row">
            <span className="signal-label">Current Price</span>
            <span className="signal-value">{signal.currentPrice?.toFixed(2)} ZAc</span>
          </div>
          <div className="signal-row">
            <span className="signal-label">RL Signal</span>
            <span className={`signal-value ${signal.rlAction === 'BUY' ? 'bull' : signal.rlAction === 'SELL' ? 'bear' : 'neutral'}`}>
              {signal.rlAction}
            </span>
          </div>
          <div className="signal-row">
            <span className="signal-label">Market Regime</span>
            <span className={`signal-value ${signal.regime === 'BULL' ? 'bull' : 'bear'}`}>
              {signal.regime}
            </span>
          </div>
          <div className="signal-row">
            <span className="signal-label">RSI (14)</span>
            <span className={`signal-value ${signal.rsi > 70 ? 'bear' : signal.rsi < 30 ? 'bull' : 'neutral'}`}>
              {signal.rsi?.toFixed(1)}
            </span>
          </div>
          <div className="signal-row">
            <span className="signal-label">ATR (14)</span>
            <span className="signal-value">{signal.atr?.toFixed(2)}</span>
          </div>
        </div>

        {signal.confluence ? (
          <div className="card">
            <h2>Trade Setup</h2>
            <div className="trade-setup">
              <div className="trade-item">
                <div className="label">Entry</div>
                <div className="value bull">{signal.entry?.toFixed(2)}</div>
              </div>
              <div className="trade-item">
                <div className="label">Take Profit</div>
                <div className="value bull">{signal.tp?.toFixed(2)}</div>
              </div>
              <div className="trade-item">
                <div className="label">Stop Loss</div>
                <div className="value bear">{signal.sl?.toFixed(2)}</div>
              </div>
            </div>
            <div className="trade-setup" style={{ marginTop: 8 }}>
              <div className="trade-item">
                <div className="label">Win Probability</div>
                <div className="value neutral">{signal.winProb}%</div>
              </div>
              <div className="trade-item">
                <div className="label">R:R Ratio</div>
                <div className="value neutral">2:1</div>
              </div>
              <div className="trade-item">
                <div className="label">Historical Setups</div>
                <div className="value">{signal.totalSetups}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="card">
            <h2>Confluence Conditions</h2>
            <div className="signal-row">
              <span className="signal-label">RL says BUY</span>
              <span className={`signal-value ${signal.rlAction === 'BUY' ? 'bull' : 'bear'}`}>
                {signal.rlAction === 'BUY' ? '✓' : '✗'}
              </span>
            </div>
            <div className="signal-row">
              <span className="signal-label">Bull Regime (SMA50 {'>'} SMA200)</span>
              <span className={`signal-value ${signal.regime === 'BULL' ? 'bull' : 'bear'}`}>
                {signal.regime === 'BULL' ? '✓' : '✗'}
              </span>
            </div>
            <div className="signal-row">
              <span className="signal-label">RSI in range (45-65)</span>
              <span className={`signal-value ${signal.rsi >= 45 && signal.rsi <= 65 ? 'bull' : 'bear'}`}>
                {signal.rsi >= 45 && signal.rsi <= 65 ? '✓' : '✗'}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="chart-container" style={{ height: 350 }}>
        <Line data={priceChartData} options={chartOptions('Satrix 40 Price + Moving Averages')} />
      </div>

      <div className="chart-container" style={{ height: 350 }}>
        <Line data={equityChartData} options={chartOptions('Equity Curves — Buy & Hold vs RL Strategy (R10,000 start)')} />
      </div>

      {top40.length > 0 && (
        <div className="card">
          <h2>JSE Top 40 Snapshot</h2>
          <table className="top40-table">
            <thead>
              <tr><th>Code</th><th>Name</th><th>Price (ZAc)</th><th>Change</th></tr>
            </thead>
            <tbody>
              {top40.map(s => (
                <tr key={s.code}>
                  <td style={{ fontWeight: 600 }}>{s.code}</td>
                  <td>{s.name}</td>
                  <td>{s.price?.toFixed(2)}</td>
                  <td className={s.change >= 0 ? 'bull' : 'bear'}>
                    {s.change >= 0 ? '+' : ''}{s.change?.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="footer">
        <p>JSE Top 40 Confluence Signals — Data from Yahoo Finance — Not financial advice</p>
        <p>Refresh for latest signals. Model retrains on each request.</p>
      </div>
    </div>
  );
}
