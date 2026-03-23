import { useState, useEffect } from 'react';
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

const FEATURED_TICKERS = [
  { code: 'GOLD',  ticker: 'GC=F',     name: 'Gold (COMEX Futures)' },
  { code: 'STX40', ticker: 'STX40.JO', name: 'Satrix 40 ETF' },
  { code: 'BTC',   ticker: 'BTC-USD',  name: 'Bitcoin' },
];

const JSE_TICKERS = [
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
  { code: 'SILVER', ticker: 'SI=F',    name: 'Silver (COMEX Futures)' },
];

const ALL_TICKERS = [...FEATURED_TICKERS, ...JSE_TICKERS];

const BACKTEST_PERIODS = [
  { key: '6m', label: '6 Months' },
  { key: '1y', label: '1 Year' },
  { key: '2y', label: '2 Years' },
  { key: '3y', label: '3 Years' },
];

const STRATEGY_CONFIGS = [
  { key: 'config1', label: 'Config 1: Breakout', short: 'Breakout' },
  { key: 'config2', label: 'Config 2: Bounce', short: 'Bounce' },
];

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
  const [tab, setTab] = useState('signals');
  const [selectedTicker, setSelectedTicker] = useState('GC=F');
  const [backtestPeriod, setBacktestPeriod] = useState('6m');
  const [strategy, setStrategy] = useState('config1');

  function loadData(ticker, period, strat) {
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/signals?ticker=${encodeURIComponent(ticker)}&period=${encodeURIComponent(period)}&strategy=${encodeURIComponent(strat)}`)
      .then(async res => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `Server error ${res.status}`);
        return json;
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }

  useEffect(() => { loadData(selectedTicker, backtestPeriod, strategy); }, [selectedTicker, backtestPeriod, strategy]);

  const tickerLabel = ALL_TICKERS.find(t => t.ticker === selectedTicker)?.name || selectedTicker;

  // --- Loading & error states ---
  if (loading) {
    return (
      <div className="container">
        <h1>JSE Confluence Signals</h1>
        <TickerSelector selected={selectedTicker} onChange={setSelectedTicker} />
        <div className="loading">
          <div className="spinner" />
          <p>Fetching {tickerLabel} data & running strategy...</p>
          <p style={{ color: '#64748b', fontSize: '0.85rem' }}>This may take 30-60 seconds on first load</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <h1>JSE Confluence Signals</h1>
        <TickerSelector selected={selectedTicker} onChange={setSelectedTicker} />
        <div className="error">
          <h2>Error loading signals</h2>
          <p>{error}</p>
          <button onClick={() => loadData(selectedTicker, backtestPeriod, strategy)} className="retry-btn">Retry</button>
        </div>
      </div>
    );
  }

  const { signal, charts, backtest } = data;

  return (
    <div className="container">
      <h1>JSE Confluence Signals</h1>
      <p className="subtitle">{data?.strategyLabel || 'Channel Breakout + Trend Following'} + Technical Confluence</p>

      <TickerSelector selected={selectedTicker} onChange={setSelectedTicker} />

      <div className="strategy-selector">
        {STRATEGY_CONFIGS.map(s => (
          <button
            key={s.key}
            className={`strategy-btn ${strategy === s.key ? 'strategy-active' : ''}`}
            onClick={() => setStrategy(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'signals' ? 'tab-active' : ''}`} onClick={() => setTab('signals')}>Signals</button>
        <button className={`tab ${tab === 'backtest' ? 'tab-active' : ''}`} onClick={() => setTab('backtest')}>Backtest</button>
      </div>

      {tab === 'signals' ? (
        <SignalsTab signal={signal} charts={charts} tickerLabel={tickerLabel} ticker={selectedTicker} />
      ) : (
        <BacktestTab
          backtest={backtest}
          charts={charts}
          tickerLabel={tickerLabel}
          backtestPeriod={backtestPeriod}
          onPeriodChange={setBacktestPeriod}
        />
      )}

      <div className="footer">
        <p>JSE Confluence Signals — Data from Yahoo Finance — Not financial advice</p>
      </div>
    </div>
  );
}

// --- Ticker Selector with Featured section ---

function TickerSelector({ selected, onChange }) {
  return (
    <div className="ticker-selector">
      <div className="featured-row">
        {FEATURED_TICKERS.map(t => (
          <button
            key={t.ticker}
            className={`featured-btn ${selected === t.ticker ? 'featured-active' : ''}`}
            onClick={() => onChange(t.ticker)}
          >
            <span className="featured-icon">
              {t.code === 'GOLD' ? '\u{1F947}' : t.code === 'BTC' ? '\u{20BF}' : '\u{1F4C8}'}
            </span>
            <span className="featured-label">{t.code}</span>
            <span className="featured-name">{t.name}</span>
          </button>
        ))}
      </div>
      <select value={selected} onChange={e => onChange(e.target.value)} className="ticker-select">
        <optgroup label="Featured">
          {FEATURED_TICKERS.map(t => (
            <option key={t.ticker} value={t.ticker}>{t.code} — {t.name}</option>
          ))}
        </optgroup>
        <optgroup label="JSE Stocks & Commodities">
          {JSE_TICKERS.map(t => (
            <option key={t.ticker} value={t.ticker}>{t.code} — {t.name}</option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}

// --- Signals Tab ---

function currencyLabel(ticker) {
  if (ticker === 'GC=F' || ticker === 'SI=F') return 'USD';
  if (ticker === 'BTC-USD') return 'USD';
  return 'ZAc';
}

function SignalsTab({ signal, charts, tickerLabel, ticker }) {
  const priceChartData = {
    labels: charts.dates,
    datasets: [
      { label: tickerLabel, data: charts.prices, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.05)', fill: true },
      { label: 'EMA 50', data: charts.sma50, borderColor: '#f59e0b', borderDash: [5, 5] },
      { label: 'SMA 200', data: charts.sma200, borderColor: '#ef4444', borderDash: [5, 5] }
    ]
  };

  return (
    <>
      <div className={`confluence-banner ${signal.confluence ? 'confluence-active' : 'confluence-inactive'}`}>
        {signal.confluence
          ? `CONFLUENCE TRIGGERED — ${signal.passedCount}/${signal.totalFactors} signals aligned (${signal.confluenceScore}%)`
          : `No confluence — ${signal.passedCount}/${signal.totalFactors} signals aligned (${signal.confluenceScore}%, need 70%+)`}
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
            <span className="signal-value">{signal.currentPrice?.toFixed(2)} {currencyLabel(ticker)}</span>
          </div>
          <div className="signal-row">
            <span className="signal-label">Strategy Signal</span>
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
                <div className="label">Reward:Risk Ratio</div>
                <div className="value neutral">2:1</div>
              </div>
              <div className="trade-item">
                <div className="label">Historical Setups</div>
                <div className="value">{signal.totalSetups}</div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="card">
          <h2>Confluence Factors ({signal.passedCount}/{signal.totalFactors})</h2>
          <div className="confluence-meter">
            <div className="confluence-fill" style={{ width: `${signal.confluenceScore}%`, background: signal.confluenceScore >= 70 ? '#22c55e' : signal.confluenceScore >= 50 ? '#f59e0b' : '#ef4444' }} />
          </div>
          {signal.factors.map((f, i) => (
            <div className="signal-row" key={i}>
              <span className="signal-label">
                {f.name}
                <span style={{ color: '#64748b', fontSize: '0.75rem', marginLeft: 6 }}>{f.description}</span>
              </span>
              <span className={`signal-value ${f.passed ? 'bull' : 'bear'}`}>
                {f.passed ? '\u2713' : '\u2717'} {f.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="chart-container" style={{ height: 350 }}>
        <Line data={priceChartData} options={chartOptions(`${tickerLabel} — Price + Moving Averages`)} />
      </div>
    </>
  );
}

// --- Backtest Tab ---

function BacktestTab({ backtest, charts, tickerLabel, backtestPeriod, onPeriodChange }) {
  const btDates = charts.btDates || charts.dates;
  const periodLabel = backtest.periodLabel || '6 Months';

  const equityChartData = {
    labels: btDates,
    datasets: [
      { label: 'Buy & Hold', data: charts.bhEquity, borderColor: '#64748b' },
      { label: 'Strategy', data: charts.rlEquity, borderColor: '#f97316' }
    ]
  };

  const drawdownChartData = {
    labels: btDates,
    datasets: [
      { label: 'Drawdown %', data: charts.drawdown, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.15)', fill: true }
    ]
  };

  const drawdownOptions = {
    ...chartOptions(`${tickerLabel} — Strategy Drawdown`),
    scales: {
      ...chartOptions('').scales,
      y: {
        ...chartOptions('').scales.y,
        ticks: { ...chartOptions('').scales.y.ticks, callback: v => v + '%' }
      }
    }
  };

  const alpha = backtest.rlReturn - backtest.bhReturn;

  return (
    <>
      {/* Period Selector */}
      <div className="period-selector">
        <span className="period-label">Backtest Period:</span>
        {BACKTEST_PERIODS.map(p => (
          <button
            key={p.key}
            className={`period-btn ${backtestPeriod === p.key ? 'period-active' : ''}`}
            onClick={() => onPeriodChange(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Key Metrics */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2>Backtest Performance ({periodLabel}) — {tickerLabel}</h2>
        <div className="stats-grid">
          <StatBox label="Strategy Return" value={`${backtest.rlReturn > 0 ? '+' : ''}${backtest.rlReturn}%`} color={backtest.rlReturn >= 0 ? '#22c55e' : '#ef4444'} />
          <StatBox label="Buy & Hold Return" value={`${backtest.bhReturn > 0 ? '+' : ''}${backtest.bhReturn}%`} color={backtest.bhReturn >= 0 ? '#22c55e' : '#ef4444'} />
          <StatBox label="Alpha vs B&H" value={`${alpha > 0 ? '+' : ''}${alpha.toFixed(2)}%`} color={alpha >= 0 ? '#22c55e' : '#ef4444'} />
          <StatBox label="Strategy Sharpe" value={backtest.rlSharpe} color={backtest.rlSharpe >= 1 ? '#22c55e' : backtest.rlSharpe >= 0 ? '#f59e0b' : '#ef4444'} />
          <StatBox label="Strategy Max Drawdown" value={`-${backtest.rlMaxDD}%`} color={backtest.rlMaxDD <= 10 ? '#22c55e' : backtest.rlMaxDD <= 20 ? '#f59e0b' : '#ef4444'} />
          <StatBox label="B&H Max Drawdown" value={`-${backtest.bhMaxDD}%`} color={backtest.bhMaxDD <= 10 ? '#22c55e' : backtest.bhMaxDD <= 20 ? '#f59e0b' : '#ef4444'} />
        </div>
      </div>

      {/* Trade Stats */}
      <div className="grid" style={{ marginBottom: 20 }}>
        <div className="card">
          <h2>Trade Statistics</h2>
          <div className="signal-row">
            <span className="signal-label">Total Trades</span>
            <span className="signal-value">{backtest.totalTrades}</span>
          </div>
          <div className="signal-row">
            <span className="signal-label">Win Rate</span>
            <span className={`signal-value ${backtest.winRate >= 50 ? 'bull' : 'bear'}`}>{backtest.winRate}%</span>
          </div>
          <div className="signal-row">
            <span className="signal-label">Average Win</span>
            <span className="signal-value bull">+{backtest.avgWin}%</span>
          </div>
          <div className="signal-row">
            <span className="signal-label">Average Loss</span>
            <span className="signal-value bear">{backtest.avgLoss}%</span>
          </div>
          <div className="signal-row">
            <span className="signal-label">Profit Factor</span>
            <span className={`signal-value ${backtest.profitFactor >= 1.5 ? 'bull' : backtest.profitFactor >= 1 ? 'neutral' : 'bear'}`}>
              {backtest.profitFactor >= 999 ? '\u221E' : backtest.profitFactor}
            </span>
          </div>
          <div className="signal-row">
            <span className="signal-label">Average Holding Period</span>
            <span className="signal-value">{backtest.avgHoldDays} days</span>
          </div>
        </div>

        {/* Recent Trades */}
        <div className="card">
          <h2>All Trades ({backtest.trades.length})</h2>
          <div className="trades-scroll">
            <table className="top40-table">
              <thead>
                <tr><th>Entry Date</th><th>Exit Date</th><th>Return</th><th>Hold Days</th></tr>
              </thead>
              <tbody>
                {backtest.trades.map((t, i) => (
                  <tr key={i}>
                    <td>{t.entryDate}</td>
                    <td>{t.exitDate}</td>
                    <td className={t.returnPct >= 0 ? 'bull' : 'bear'}>
                      {t.returnPct >= 0 ? '+' : ''}{t.returnPct.toFixed(2)}%
                    </td>
                    <td>{t.holdDays}d</td>
                  </tr>
                ))}
                {backtest.trades.length === 0 && (
                  <tr><td colSpan={4} style={{ color: '#64748b', textAlign: 'center' }}>No trades recorded</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="chart-container" style={{ height: 350 }}>
        <Line data={equityChartData} options={chartOptions(`${tickerLabel} — Equity Curves (R10,000 start) — ${periodLabel}`)} />
      </div>

      <div className="chart-container" style={{ height: 250 }}>
        <Line data={drawdownChartData} options={drawdownOptions} />
      </div>
    </>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div className="stat-box">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
    </div>
  );
}
