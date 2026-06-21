'use client'

import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Download, FileText, TrendingUp, Target, BarChart2 } from 'lucide-react'
import { useStore } from '@/store'

interface Trade {
  id: string
  pair: string
  direction: string
  lots: number
  open_price: number
  close_price: number
  pnl_usd: number
  pnl_r: number
  strategy: string
  session: string
  status: string
  opened_at: string
  closed_at: string
}

const TABS = ['Open', 'Today', 'This Week', 'This Month', 'All Time']

function StatCard({ label, value, icon: Icon, color = 'text-ink' }: { label: string; value: React.ReactNode; icon: React.ComponentType<{ className?: string }>; color?: string }) {
  return (
    <div className="bg-canvas border border-hairline rounded-md p-md shadow-level-2 flex items-start justify-between">
      <div>
        <span className="font-mono text-caption-mono text-mute uppercase block">{label}</span>
        <span className={`font-sans text-display-sm font-semibold ${color} mt-xxs block`}>{value}</span>
      </div>
      <div className="p-xs bg-canvas-soft-2 rounded-sm border border-hairline">
        <Icon className="w-sm h-sm text-body-text" />
      </div>
    </div>
  )
}

export default function PortfolioPage() {
  const [activeTab, setActiveTab] = useState('All Time')
  const [filterPair, setFilterPair] = useState('')
  const [filterStrategy, setFilterStrategy] = useState('')

  const { positions } = useStore()

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['portfolio-stats'],
    queryFn: async () => {
      const res = await fetch('/api/portfolio/stats')
      if (!res.ok) return null
      return res.json()
    }
  })

  const { data: equityCurve = [] } = useQuery({
    queryKey: ['equity-curve'],
    queryFn: async () => {
      const res = await fetch('/api/portfolio/equity-curve')
      const raw = await res.json()
      return raw.map((d: Record<string, unknown>) => ({
        date: new Date(d.ts as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        equity: d.equity
      }))
    }
  })

  const { data: tradeData = { trades: [], total: 0 } } = useQuery({
    queryKey: ['trades', filterPair, filterStrategy],
    queryFn: async () => {
      const q = new URLSearchParams()
      if (filterPair) q.set('pair', filterPair)
      if (filterStrategy) q.set('strategy', filterStrategy)
      const res = await fetch(`/api/portfolio/trades?${q.toString()}`)
      return res.json()
    }
  })

  const dbTrades: Trade[] = tradeData.trades || []

  const trades = useMemo(() => {
    if (activeTab === 'Open') {
      return positions.map((pos) => ({
        id: `pos-${pos.ticket}`,
        pair: pos.symbol,
        direction: pos.type,
        lots: pos.volume,
        open_price: pos.open_price,
        close_price: pos.current_price,
        pnl_usd: pos.profit,
        pnl_r: Number((pos.profit / 10).toFixed(2)),
        strategy: 'MT5 Direct',
        session: 'N/A',
        status: 'OPEN',
        opened_at: new Date().toISOString(),
        closed_at: ''
      }))
    }

    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const startOfWeek = startOfToday - 7 * 24 * 60 * 60 * 1000
    const startOfMonth = startOfToday - 30 * 24 * 60 * 60 * 1000

    return dbTrades.filter((t) => {
      const openedTime = new Date(t.opened_at).getTime()
      if (activeTab === 'Today') {
        return openedTime >= startOfToday
      }
      if (activeTab === 'This Week') {
        return openedTime >= startOfWeek
      }
      if (activeTab === 'This Month') {
        return openedTime >= startOfMonth
      }
      return true // 'All Time'
    })
  }, [activeTab, dbTrades, positions])

  // Calendar heatmap mock data (last 30 days)
  const calendarData = useMemo(() => Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (29 - i))
    const pnl = (((i * 7 + 3) % 10) / 10 - 0.4) * 300
    return { date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), pnl }
  }), [])

  const handleExportCSV = () => {
    const headers = ['ID', 'Pair', 'Direction', 'Lots', 'Open', 'Close', 'P&L USD', 'P&L R', 'Strategy', 'Status', 'Opened']
    const rows = trades.map(t => [
      t.id, t.pair, t.direction, t.lots, t.open_price, t.close_price,
      t.pnl_usd, t.pnl_r, t.strategy, t.status, t.opened_at
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'auric_trades.csv'; a.click()
  }

  return (
    <div className="space-y-lg">
      <div>
        <h2 className="font-sans text-display-lg font-semibold text-ink tracking-tight">Portfolio Analytics</h2>
        <p className="font-sans text-body-sm text-body-text mt-xxs">Track performance, equity progression, and historical trade outcomes.</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-sm md:gap-md">
        <StatCard label="Total P&L" value={statsLoading ? '…' : `$${(stats?.total_pnl ?? 0).toFixed(2)}`}
          icon={TrendingUp} color={(stats?.total_pnl ?? 0) >= 0 ? 'text-success' : 'text-error'} />
        <StatCard label="Win Rate" value={statsLoading ? '…' : `${(stats?.win_rate ?? 0).toFixed(1)}%`} icon={Target} />
        <StatCard label="Avg R:R" value={statsLoading ? '…' : `${(stats?.avg_rr ?? 0).toFixed(2)}R`} icon={BarChart2} />
        <StatCard label="Total Trades" value={statsLoading ? '…' : (stats?.total_trades ?? 0)} icon={FileText} />
        <StatCard label="Best Day" value={statsLoading ? '…' : `$${(stats?.best_day ?? 0).toFixed(2)}`} icon={TrendingUp} color="text-success" />
      </div>

      {/* Equity Curve Chart */}
      <div className="bg-canvas border border-hairline rounded-md p-md shadow-level-3">
        <h4 className="font-sans text-body-md font-semibold text-ink mb-sm">Equity Progression Curve</h4>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={equityCurve}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ebebeb" />
              <XAxis dataKey="date" stroke="#888" fontSize={10} tickLine={false} />
              <YAxis stroke="#888" fontSize={10} tickLine={false} tickFormatter={v => `$${v.toLocaleString()}`} />
              <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Equity']} />
              <Line type="monotone" dataKey="equity" stroke="#171717" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Calendar Heatmap */}
      <div className="bg-canvas border border-hairline rounded-md p-md shadow-level-2">
        <h4 className="font-sans text-body-md font-semibold text-ink mb-sm">Daily P&L Calendar</h4>
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-xxs">
          {calendarData.map((d, i) => (
            <div key={i} title={`${d.date}: $${d.pnl.toFixed(2)}`}
              className={`h-[28px] rounded-xs border border-hairline/50 flex items-center justify-center cursor-default transition-transform hover:scale-110 ${
                d.pnl > 100 ? 'bg-success/30' : d.pnl > 0 ? 'bg-success/15' : d.pnl < -100 ? 'bg-error/30' : 'bg-error/15'
              }`}>
              <span className="font-mono text-[8px] text-body-text">{new Date().getDate() - (29 - i)}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-sm mt-xs">
          <span className="w-xs h-xs rounded-xxs bg-error/30 inline-block" />
          <span className="font-mono text-[9px] text-mute">Loss</span>
          <span className="w-xs h-xs rounded-xxs bg-success/30 inline-block ml-sm" />
          <span className="font-mono text-[9px] text-mute">Profit</span>
        </div>
      </div>

      {/* Trade Table Section */}
      <div className="bg-canvas border border-hairline rounded-md shadow-level-3">
        {/* Tab bar + Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-hairline p-md gap-md">
          <div className="flex gap-xxs overflow-x-auto no-scrollbar max-w-full pb-xxs sm:pb-0">
            {TABS.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-sm py-xxs font-sans text-caption rounded-pill border transition-colors whitespace-nowrap ${
                  activeTab === tab ? 'bg-primary border-primary text-on-primary' : 'bg-canvas border-hairline text-body-text hover:bg-canvas-soft'
                }`}>
                {tab}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-xs items-center max-w-full">
            <select value={filterPair} onChange={e => setFilterPair(e.target.value)} className="form-input-sm bg-canvas focus:outline-none">
              <option value="">All Pairs</option>
              <option value="XAUUSD">XAUUSD</option>
            </select>
            <select value={filterStrategy} onChange={e => setFilterStrategy(e.target.value)} className="form-input-sm bg-canvas focus:outline-none">
              <option value="">All Strategies</option>
              <option value="order_block_reversal">Order Block</option>
              <option value="fvg_scalper">FVG Scalper</option>
              <option value="trend_following">Trend Following</option>
            </select>
            <button onClick={handleExportCSV}
              className="flex items-center gap-xxs px-sm h-[32px] border border-hairline rounded-sm bg-canvas hover:bg-canvas-soft text-body-text font-sans text-caption transition-colors whitespace-nowrap">
              <Download className="w-xxs h-xxs" /> CSV
            </button>
            <a href="/api/portfolio/export/pdf"
              className="flex items-center gap-xxs px-sm h-[32px] border border-hairline rounded-sm bg-canvas hover:bg-canvas-soft text-body-text font-sans text-caption transition-colors whitespace-nowrap">
              <FileText className="w-xxs h-xxs" /> PDF
            </a>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-canvas-soft-2 font-mono text-caption-mono text-mute border-b border-hairline">
                {['OPENED', 'PAIR', 'DIR', 'LOTS', 'ENTRY', 'EXIT', 'P&L $', 'P&L R', 'STRATEGY', 'STATUS'].map(h => (
                  <th key={h} className="p-sm whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {trades.map(t => {
                const isWin = (t.pnl_usd ?? 0) >= 0
                return (
                  <tr key={t.id} className="hover:bg-canvas-soft text-body-sm text-body-text transition-colors">
                    <td className="p-sm font-mono text-caption-mono text-mute whitespace-nowrap">
                      {new Date(t.opened_at).toLocaleDateString()}
                    </td>
                    <td className="p-sm font-semibold text-ink">{t.pair}</td>
                    <td className="p-sm">
                      <span className={`font-mono text-[9px] font-bold px-xxs py-[2px] rounded-xs ${
                        t.direction === 'BUY' ? 'bg-link/15 text-link' : 'bg-error/15 text-error'
                      }`}>{t.direction}</span>
                    </td>
                    <td className="p-sm font-mono text-caption-mono">{t.lots}</td>
                    <td className="p-sm font-mono text-caption-mono">{t.open_price?.toFixed(2)}</td>
                    <td className="p-sm font-mono text-caption-mono">{t.close_price?.toFixed(2)}</td>
                    <td className={`p-sm font-mono text-caption-mono font-semibold ${isWin ? 'text-success' : 'text-error'}`}>
                      {isWin ? '+' : ''}${t.pnl_usd?.toFixed(2)}
                    </td>
                    <td className={`p-sm font-mono text-caption-mono font-semibold ${isWin ? 'text-success' : 'text-error'}`}>
                      {isWin ? '+' : ''}{t.pnl_r?.toFixed(2)}R
                    </td>
                    <td className="p-sm capitalize text-body-text">{t.strategy?.replace(/_/g, ' ')}</td>
                    <td className="p-sm">
                      <span className="font-mono text-[9px] uppercase text-mute">{t.status}</span>
                    </td>
                  </tr>
                )
              })}
              {trades.length === 0 && (
                <tr><td colSpan={10} className="text-center py-xl font-sans text-body-sm text-mute">No trades found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
