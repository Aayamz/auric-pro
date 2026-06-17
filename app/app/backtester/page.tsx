'use client'

import React, { useState, useRef } from 'react'
import { ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Play, Loader2, Brain } from 'lucide-react'

function MetricCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-canvas border border-hairline rounded-md p-md shadow-level-2">
      <span className="font-mono text-caption-mono text-mute uppercase block">{label}</span>
      <span className="font-sans text-display-sm font-semibold text-ink mt-xxs block">{value}</span>
      {sub && <span className="font-mono text-[9px] text-body-text mt-xxs block">{sub}</span>}
    </div>
  )
}

interface BacktestResult {
  net_pnl?: number; win_rate?: number; max_drawdown_pct?: number;
  profit_factor?: number; total_trades?: number; initial_balance?: number;
  equity_curve?: { ts: number; equity: number }[]; ai_analysis?: string;
  [key: string]: unknown;
}

export default function BacktesterPage() {
  const [pair, setPair] = useState('XAUUSD')
  const [tf, setTf] = useState('M15')
  const [dateFrom, setDateFrom] = useState('2026-05-01')
  const [dateTo, setDateTo] = useState('2026-06-01')
  const [strategy, setStrategy] = useState('order_block_reversal')
  const [commission, setCommission] = useState(0.5)
  const [spread, setSpread] = useState(1.0)
  const [balance, setBalance] = useState(10000)
  const [riskPct, setRiskPct] = useState(1.0)

  const [, setJobId] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<'idle' | 'running' | 'complete'>('idle')
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [aiAnalysis, setAiAnalysis] = useState('')
  const [streamingAi, setStreamingAi] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const runBacktest = async () => {
    setStatus('running')
    setProgress(0)
    setResult(null)
    setAiAnalysis('')

    const res = await fetch('/api/backtest/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pair, tf, date_from: dateFrom, date_to: dateTo, strategy, commission, spread, initial_balance: balance, risk_pct: riskPct })
    })
    const data = await res.json()
    setJobId(data.job_id)

    pollRef.current = setInterval(async () => {
      const poll = await fetch(`/api/backtest/${data.job_id}`)
      const pollData = await poll.json()
      setProgress(pollData.progress ?? 0)
      if (pollData.status === 'complete') {
        clearInterval(pollRef.current!)
        setStatus('complete')
        setResult(pollData.result)
      }
    }, 1000)
  }

  const analyzeWithAi = async () => {
    if (!result) return
    setStreamingAi(true)
    setAiAnalysis('')
    try {
      const res = await fetch('/api/ai/analyze-backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results: result })
      })
      const data = await res.json()
      // Simulate streaming effect
      const words = (data.analysis || '').split(' ')
      for (const word of words) {
        await new Promise(r => setTimeout(r, 50))
        setAiAnalysis(prev => prev + word + ' ')
      }
    } finally {
      setStreamingAi(false)
    }
  }

  return (
    <div className="space-y-lg">
      <div>
        <h2 className="font-sans text-display-lg font-semibold text-ink tracking-tight">Strategy Backtester</h2>
        <p className="font-sans text-body-sm text-body-text mt-xxs">Simulate strategy performance on historical XAUUSD tick data.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-lg">
        {/* Config Panel */}
        <div className="bg-canvas border border-hairline rounded-md p-md shadow-level-2 space-y-md">
          <h4 className="font-sans text-body-md font-semibold text-ink border-b border-hairline pb-xs">Parameters</h4>

          {[
            { label: 'TRADING PAIR', node: <input value={pair} onChange={e => setPair(e.target.value)} className="w-full form-input focus:outline-none" /> },
            { label: 'TIMEFRAME', node: (
              <select value={tf} onChange={e => setTf(e.target.value)} className="w-full form-input focus:outline-none">
                {['M1','M5','M15','H1','H4'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )},
            { label: 'DATE FROM', node: <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full form-input focus:outline-none" /> },
            { label: 'DATE TO', node: <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full form-input focus:outline-none" /> },
            { label: 'STRATEGY', node: (
              <select value={strategy} onChange={e => setStrategy(e.target.value)} className="w-full form-input focus:outline-none">
                {['ema_crossover','rsi_stoch','bollinger_bounce','order_block_reversal','fvg_scalper','liquidity_sweep','breakout_bos','trend_following'].map(s => (
                  <option key={s} value={s}>{s.replace(/_/g,' ')}</option>
                ))}
              </select>
            )},
            { label: 'COMMISSION (pips)', node: <input type="number" step={0.1} value={commission} onChange={e => setCommission(parseFloat(e.target.value))} className="w-full form-input focus:outline-none" /> },
            { label: 'SPREAD (pips)', node: <input type="number" step={0.1} value={spread} onChange={e => setSpread(parseFloat(e.target.value))} className="w-full form-input focus:outline-none" /> },
            { label: 'INITIAL BALANCE ($)', node: <input type="number" value={balance} onChange={e => setBalance(parseInt(e.target.value))} className="w-full form-input focus:outline-none" /> },
            { label: 'RISK % PER TRADE', node: <input type="number" step={0.1} value={riskPct} onChange={e => setRiskPct(parseFloat(e.target.value))} className="w-full form-input focus:outline-none" /> },
          ].map(({ label, node }) => (
            <div key={label}>
              <label className="block font-mono text-caption-mono text-mute mb-xxs">{label}</label>
              {node}
            </div>
          ))}

          <button onClick={runBacktest} disabled={status === 'running'}
            className="w-full bg-primary text-on-primary font-sans text-button-md font-medium h-[40px] rounded-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-xs mt-sm">
            {status === 'running' ? <><Loader2 className="w-xs h-xs animate-spin" /> Running…</> : <><Play className="w-xs h-xs" /> Run Backtest</>}
          </button>

          {/* Progress Bar */}
          {status === 'running' && (
            <div className="space-y-xxs">
              <div className="flex justify-between font-mono text-caption-mono text-mute">
                <span>Progress</span><span>{progress}%</span>
              </div>
              <div className="w-full bg-canvas-soft-2 rounded-full h-[6px] overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-md">
          {!result && status !== 'running' && (
            <div className="bg-canvas border border-hairline border-dashed rounded-md p-3xl flex flex-col items-center justify-center text-center shadow-level-2">
              <BarChart2Icon className="w-lg h-lg text-mute mb-sm" />
              <h4 className="font-sans text-body-md font-semibold text-ink">No Results Yet</h4>
              <p className="font-sans text-caption text-body-text max-w-[280px] mt-xxs">
                Configure parameters and click Run Backtest to simulate strategy performance.
              </p>
            </div>
          )}

          {status === 'running' && (
            <div className="bg-canvas border border-hairline rounded-md p-3xl flex flex-col items-center justify-center text-center shadow-level-2">
              <Loader2 className="w-lg h-lg text-mute mb-sm animate-spin" />
              <h4 className="font-sans text-body-md font-semibold text-ink">Simulating…</h4>
              <p className="font-sans text-caption text-body-text mt-xxs">{progress}% complete</p>
            </div>
          )}

          {result && (
            <>
              {/* Metric Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-sm">
                <MetricCard label="Net P&L" value={`$${(result.net_pnl as number)?.toFixed(2)}`} />
                <MetricCard label="Win Rate" value={`${(result.win_rate as number)?.toFixed(1)}%`} />
                <MetricCard label="Max DD" value={`${(result.max_drawdown_pct as number)?.toFixed(1)}%`} />
                <MetricCard label="Prof. Factor" value={(result.profit_factor as number)?.toFixed(2)} />
                <MetricCard label="Trades" value={result.total_trades as number} />
              </div>

              {/* Equity Curve */}
              <div className="bg-canvas border border-hairline rounded-md p-md shadow-level-2">
                <h4 className="font-sans text-body-md font-semibold text-ink mb-sm">Equity Curve + Drawdown</h4>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={result.equity_curve?.map((d) => ({
                      ts: new Date(d.ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                      equity: d.equity,
                      dd: (d.equity as number) < ((result.initial_balance as number) ?? 10000) ? (d.equity as number) - ((result.initial_balance as number) ?? 10000) : 0
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ebebeb" />
                      <XAxis dataKey="ts" stroke="#888" fontSize={9} tickLine={false} />
                      <YAxis stroke="#888" fontSize={9} tickLine={false} />
                      <Tooltip />
                      <Area type="monotone" dataKey="dd" fill="#f7d4d6" stroke="none" />
                      <Line type="monotone" dataKey="equity" stroke="#171717" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* AI Analysis */}
              <div className="bg-canvas border border-hairline rounded-md p-md shadow-level-2">
                <div className="flex justify-between items-center mb-sm">
                  <h4 className="font-sans text-body-md font-semibold text-ink">AI Performance Analysis</h4>
                  <button onClick={analyzeWithAi} disabled={streamingAi}
                    className="flex items-center gap-xxs px-sm h-[28px] bg-primary text-on-primary font-sans text-caption font-semibold rounded-sm hover:opacity-90 disabled:opacity-50">
                    <Brain className="w-xxs h-xxs" />
                    {streamingAi ? 'Analyzing…' : 'Analyze with AI'}
                  </button>
                </div>
                <div className="bg-canvas-soft border border-hairline rounded-sm p-sm font-sans text-body-sm text-body-text leading-relaxed min-h-[60px]">
                  {aiAnalysis || result.ai_analysis || <span className="text-mute italic">Click &quot;Analyze with AI&quot; to generate Claude&apos;s assessment.</span>}
                  {streamingAi && <span className="inline-block w-xxs h-[14px] bg-primary/50 ml-xxs animate-pulse" />}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Inline icon to avoid import issues
function BarChart2Icon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  )
}
