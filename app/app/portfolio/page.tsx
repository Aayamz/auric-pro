'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Download, FileText, TrendingUp, Target, BarChart2, RefreshCw } from 'lucide-react'
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
  const [currentPage, setCurrentPage] = useState(1)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const itemsPerPage = 10

  const { positions, bridgeStatus } = useStore()
  const queryClient = useQueryClient()

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['portfolio-stats'],
    queryFn: async () => {
      const res = await fetch('/api/portfolio/stats', { cache: 'no-store' })
      if (!res.ok) return null
      return res.json()
    },
    staleTime: 0, // Always consider stale so refetch works immediately
    refetchOnMount: true
  })

  const { data: equityCurve = [], refetch: refetchEquity } = useQuery({
    queryKey: ['equity-curve'],
    queryFn: async () => {
      const res = await fetch('/api/portfolio/equity-curve', { cache: 'no-store' })
      const raw = await res.json()
      return raw.map((d: Record<string, unknown>) => ({
        date: new Date(d.ts as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        equity: d.equity
      }))
    },
    staleTime: 0,
    refetchOnMount: true
  })

  const { data: tradeData = { trades: [], total: 0 }, refetch: refetchTrades } = useQuery({
    queryKey: ['trades', filterPair, filterStrategy],
    queryFn: async () => {
      const q = new URLSearchParams()
      if (filterPair) q.set('pair', filterPair)
      if (filterStrategy) q.set('strategy', filterStrategy)
      const res = await fetch(`/api/portfolio/trades?${q.toString()}`, { cache: 'no-store' })
      return res.json()
    },
    staleTime: 0,
    refetchOnMount: true
  })

  /**
   * Hard refresh — invalidates all React Query caches and re-fetches everything from Supabase.
   * Does NOT trigger a new MT5 sync (use Force Sync for that).
   */
  const handleRefresh = useCallback(async () => {
    setSyncMsg('Refreshing data...')
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['portfolio-stats'] }),
      queryClient.invalidateQueries({ queryKey: ['equity-curve'] }),
      queryClient.invalidateQueries({ queryKey: ['trades'] }),
      queryClient.invalidateQueries({ queryKey: ['ohlcv'] })
    ])
    await Promise.all([refetchStats(), refetchEquity(), refetchTrades()])
    setSyncMsg('Data refreshed ✓')
    setTimeout(() => setSyncMsg(''), 3000)
  }, [queryClient, refetchStats, refetchEquity, refetchTrades])

  /**
   * Force Sync — triggers full MT5 history re-import from the Python bridge.
   * Deletes old/mock trades from Supabase and writes real MT5 deals.
   */
  const handleForceSync = useCallback(async () => {
    setSyncing(true)
    setSyncMsg('Syncing MT5 history...')
    try {
      const res = await fetch('/api/bridge/sync', { method: 'POST' })
      if (!res.ok) {
        const err = await res.json()
        setSyncMsg(`Sync failed: ${err.error || 'Unknown error'}`)
        return
      }
      setSyncMsg('MT5 sync complete! Refreshing...')
      // Wait a moment for Supabase writes to propagate, then re-fetch
      await new Promise(r => setTimeout(r, 1500))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['portfolio-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['equity-curve'] }),
        queryClient.invalidateQueries({ queryKey: ['trades'] })
      ])
      await Promise.all([refetchStats(), refetchEquity(), refetchTrades()])
      setSyncMsg('Sync complete ✓ — showing real MT5 data')
    } catch (e: any) {
      setSyncMsg(`Error: ${e.message}`)
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(''), 5000)
    }
  }, [queryClient, refetchStats, refetchEquity, refetchTrades])

  // Reset page index on tab or filter shifts
  React.useEffect(() => {
    setCurrentPage(1)
  }, [activeTab, filterPair, filterStrategy])

  const dbTrades: Trade[] = tradeData.trades || []

  const uniquePairs = useMemo(() => {
    const pairs = new Set<string>(['XAUUSD'])
    dbTrades.forEach((t) => {
      if (t.pair) pairs.add(t.pair)
    })
    return Array.from(pairs)
  }, [dbTrades])

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
      if (activeTab === 'Today') return openedTime >= startOfToday
      if (activeTab === 'This Week') return openedTime >= startOfWeek
      if (activeTab === 'This Month') return openedTime >= startOfMonth
      return true // 'All Time'
    })
  }, [activeTab, dbTrades, positions])

  const paginatedTrades = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return trades.slice(start, start + itemsPerPage)
  }, [trades, currentPage])

  // Build equity curve from real trade data when available
  const chartEquityCurve = useMemo(() => {
    if (equityCurve.length > 0) return equityCurve
    // Fallback: build from closed dbTrades sorted by date
    if (dbTrades.length === 0) return []
    const sorted = [...dbTrades].sort((a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime())
    let running = 0
    return sorted.map(t => {
      running += t.pnl_usd ?? 0
      return {
        date: new Date(t.opened_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        equity: Number(running.toFixed(2))
      }
    })
  }, [equityCurve, dbTrades])

  // Build real daily P&L calendar from actual trades (not mock data)
  const calendarData = useMemo(() => {
    const days: { date: string; pnl: number }[] = []
    const now = new Date()
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      const dayTrades = dbTrades.filter(t => t.opened_at?.startsWith(dateStr))
      const pnl = dayTrades.reduce((sum, t) => sum + (t.pnl_usd ?? 0), 0)
      days.push({
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        pnl
      })
    }
    return days
  }, [dbTrades])

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
      {/* Page Header with Sync Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-sm">
        <div>
          <h2 className="font-sans text-display-lg font-semibold text-ink tracking-tight">Portfolio Analytics</h2>
          <p className="font-sans text-body-sm text-body-text mt-xxs">Track performance, equity progression, and historical trade outcomes.</p>
        </div>

        {/* Sync Controls Row */}
        <div className="flex items-center gap-xs flex-wrap">
          {/* Bridge / connection status badge */}
          <span className={`flex items-center gap-xs px-sm py-xxs rounded-pill border font-mono text-[10px] font-semibold uppercase ${
            bridgeStatus === 'connected'
              ? 'border-success/40 text-success bg-success/5'
              : 'border-error/40 text-error bg-error/5'
          }`}>
            <span className={`w-xs h-xs rounded-full inline-block ${bridgeStatus === 'connected' ? 'bg-success animate-pulse' : 'bg-error'}`} />
            MT5: {bridgeStatus === 'connected' ? 'LIVE' : bridgeStatus === 'connecting' ? 'CONNECTING' : 'OFFLINE'}
          </span>

          {/* Refresh button — re-fetches from Supabase (fast) */}
          <button
            id="portfolio-refresh-btn"
            onClick={handleRefresh}
            disabled={syncing}
            title="Refresh data from database"
            className="flex items-center gap-xxs px-sm py-xxs border border-hairline rounded-sm bg-canvas hover:bg-canvas-soft text-body-text font-sans text-caption transition-colors disabled:opacity-50"
          >
            <RefreshCw className="w-xxs h-xxs" />
            Refresh
          </button>

          {/* Force Sync button — triggers full MT5 re-import */}
          <button
            id="portfolio-force-sync-btn"
            onClick={handleForceSync}
            disabled={syncing || bridgeStatus !== 'connected'}
            title={bridgeStatus !== 'connected' ? 'Connect MT5 bridge to sync' : 'Force full MT5 history re-import'}
            className={`flex items-center gap-xxs px-sm py-xxs border rounded-sm font-sans text-caption font-semibold transition-colors disabled:opacity-40 ${
              bridgeStatus === 'connected'
                ? 'border-primary bg-primary text-on-primary hover:opacity-90'
                : 'border-hairline bg-canvas text-mute'
            }`}
          >
            <RefreshCw className={`w-xxs h-xxs ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing MT5...' : 'Force Sync MT5'}
          </button>
        </div>
      </div>

      {/* Sync status message */}
      {syncMsg && (
        <div className={`px-md py-xs rounded-sm border font-mono text-caption-mono ${
          syncMsg.includes('Error') || syncMsg.includes('failed')
            ? 'border-error/30 bg-error/5 text-error'
            : 'border-success/30 bg-success/5 text-success'
        }`}>
          {syncMsg}
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-sm md:gap-md">
        <StatCard label="Total P&L" value={statsLoading ? '…' : `$${(stats?.total_pnl ?? 0).toFixed(2)}`}
          icon={TrendingUp} color={(stats?.total_pnl ?? 0) >= 0 ? 'text-success' : 'text-error'} />
        <StatCard label="Win Rate" value={statsLoading ? '…' : `${(stats?.win_rate ?? 0).toFixed(1)}%`} icon={Target} />
        <StatCard label="Avg R:R" value={statsLoading ? '…' : `${(stats?.avg_rr ?? 0).toFixed(2)}R`} icon={BarChart2} />
        <StatCard label="Total Trades" value={statsLoading ? '…' : (stats?.total_trades ?? 0)} icon={FileText} />
        <StatCard label="Best Day" value={statsLoading ? '…' : `$${(stats?.best_day ?? 0).toFixed(2)}`} icon={TrendingUp} color="text-success" />
      </div>

      {/* Equity Curve Chart — built from real MT5 trade data */}
      <div className="bg-canvas border border-hairline rounded-md p-md shadow-level-3">
        <div className="flex items-center justify-between mb-sm">
          <h4 className="font-sans text-body-md font-semibold text-ink">Equity Progression Curve</h4>
          <span className="font-mono text-caption-mono text-mute">
            {chartEquityCurve.length > 0 ? `${chartEquityCurve.length} data points` : 'No data — sync MT5 to populate'}
          </span>
        </div>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartEquityCurve}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ebebeb" />
              <XAxis dataKey="date" stroke="#888" fontSize={10} tickLine={false} />
              <YAxis stroke="#888" fontSize={10} tickLine={false} tickFormatter={v => `$${v.toLocaleString()}`} />
              <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Equity']} />
              <Line type="monotone" dataKey="equity" stroke="#171717" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Daily P&L Calendar — built from real MT5 trades */}
      <div className="bg-canvas border border-hairline rounded-md p-md shadow-level-2">
        <h4 className="font-sans text-body-md font-semibold text-ink mb-sm">Daily P&L Calendar</h4>
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-xxs">
          {calendarData.map((d, i) => (
            <div key={i} title={`${d.date}: $${d.pnl.toFixed(2)}`}
              className={`h-[28px] rounded-xs border border-hairline/50 flex items-center justify-center cursor-default transition-transform hover:scale-110 ${
                d.pnl > 100 ? 'bg-success/30' : d.pnl > 0 ? 'bg-success/15' : d.pnl < -100 ? 'bg-error/30' : d.pnl < 0 ? 'bg-error/15' : 'bg-canvas-soft'
              }`}>
              <span className="font-mono text-[8px] text-body-text">{d.date.split(' ')[1]}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-sm mt-xs">
          <span className="w-xs h-xs rounded-xxs bg-error/30 inline-block" />
          <span className="font-mono text-[9px] text-mute">Loss</span>
          <span className="w-xs h-xs rounded-xxs bg-canvas-soft inline-block ml-sm" />
          <span className="font-mono text-[9px] text-mute">Flat</span>
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
              {uniquePairs.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select value={filterStrategy} onChange={e => setFilterStrategy(e.target.value)} className="form-input-sm bg-canvas focus:outline-none">
              <option value="">All Strategies</option>
              <option value="order_block_reversal">Order Block</option>
              <option value="fvg_scalper">FVG Scalper</option>
              <option value="trend_following">Trend Following</option>
              <option value="MT5 Automated Trade">MT5 Automated</option>
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
              {paginatedTrades.map(t => {
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
                    <td className="p-sm font-mono text-caption-mono">{t.close_price?.toFixed(2) || '—'}</td>
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
                <tr>
                  <td colSpan={10} className="text-center py-xl font-sans text-body-sm text-mute">
                    {bridgeStatus === 'connected'
                      ? 'No trades found. Click "Force Sync MT5" to import your trade history.'
                      : 'No trades found. Connect your MT5 bridge and click "Force Sync MT5".'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {trades.length > itemsPerPage && (
          <div className="flex items-center justify-between p-md border-t border-hairline bg-canvas-soft font-sans text-caption text-body-text">
            <span>
              Showing <b>{Math.min(trades.length, (currentPage - 1) * itemsPerPage + 1)}</b> to <b>{Math.min(trades.length, currentPage * itemsPerPage)}</b> of <b>{trades.length}</b> entries
            </span>
            <div className="flex gap-xs">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="px-sm py-xxs border border-hairline rounded-sm bg-canvas hover:bg-canvas-soft disabled:opacity-40 transition-opacity"
              >
                Previous
              </button>
              <button
                disabled={currentPage >= Math.ceil(trades.length / itemsPerPage)}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(trades.length / itemsPerPage)))}
                className="px-sm py-xxs border border-hairline rounded-sm bg-canvas hover:bg-canvas-soft disabled:opacity-40 transition-opacity"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
