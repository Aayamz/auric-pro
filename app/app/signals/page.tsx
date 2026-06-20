'use client'

import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { ChevronRight, X, Radio, RefreshCw } from 'lucide-react'
import { useStore } from '@/store'

interface SignalItem {
  id: string
  created_at: string
  pair: string
  direction: 'BUY' | 'SELL'
  strategy: string
  timeframe: string
  confidence: number
  entry_price: number
  sl_price: number
  tp_levels: { rr: number; price: number }[]
  status: string
  ai_explanation?: string
}

export default function SignalsPage() {
  const [filterPair, setFilterPair] = useState('')
  const [filterStrategy, setFilterStrategy] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [selectedSignal, setSelectedSignal] = useState<SignalItem | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [aiExplanation, setAiExplanation] = useState('')
  const [loadingAi, setLoadingAi] = useState(false)

  // Live signals from WebSocket (Zustand store)
  const storeSignals = useStore(s => s.signals) as SignalItem[]

  // Query Signals list from DB
  const { data: dbSignals = [], refetch, isFetching } = useQuery<SignalItem[]>({
    queryKey: ['signals', filterPair, filterStrategy, filterStatus],
    queryFn: async () => {
      const query = new URLSearchParams()
      if (filterPair) query.append('pair', filterPair)
      if (filterStrategy) query.append('strategy', filterStrategy)
      if (filterStatus) query.append('status', filterStatus)
      const res = await fetch(`/api/signals?${query.toString()}`)
      if (!res.ok) return []
      return res.json()
    }
  })

  // Merge store (live) signals with DB signals — deduplicate by id, live signals take priority
  const signalsList = useMemo(() => {
    const dbMap = new Map(dbSignals.map(s => [s.id, s]))

    // Apply client-side filters to store signals
    const filteredStore = storeSignals.filter(s => {
      if (filterPair && s.pair !== filterPair) return false
      if (filterStrategy && s.strategy !== filterStrategy) return false
      if (filterStatus && s.status !== filterStatus) return false
      return true
    })

    // Live signals come first, then DB signals not already in the live list
    const liveIds = new Set(filteredStore.map(s => s.id))
    const dbOnly = dbSignals.filter(s => !liveIds.has(s.id))
    return [...filteredStore, ...dbOnly]
  }, [storeSignals, dbSignals, filterPair, filterStrategy, filterStatus])

  // Open Drawer and trigger AI Explanation lazily
  const handleRowClick = async (signal: SignalItem) => {
    setSelectedSignal(signal)
    setDrawerOpen(true)
    setAiExplanation(signal.ai_explanation || '')
    
    if (!signal.ai_explanation) {
      setLoadingAi(true)
      try {
        const res = await fetch(`/api/ai/explain/${signal.id}`, { method: 'POST' })
        const data = await res.json()
        setAiExplanation(data.explanation || 'Failed to retrieve AI review.')
      } catch {
        setAiExplanation('Error calling AI Advisor.')
      } finally {
        setLoadingAi(false)
      }
    }
  }

  // Analytics datasets
  const strategyPerformanceData = [
    { name: 'Order Block Reversal', winRate: 68.4, signals: 24 },
    { name: 'Liquidity Sweep', winRate: 71.0, signals: 18 },
    { name: 'EMA Crossover', winRate: 62.5, signals: 42 },
    { name: 'FVG Scalper', winRate: 64.0, signals: 35 },
    { name: 'Trend Follower', winRate: 66.8, signals: 15 }
  ]

  const liveCount = storeSignals.length

  return (
    <div className="space-y-lg flex flex-col h-full relative">
      
      {/* Title / Info Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col">
          <h2 className="font-sans text-display-lg font-semibold text-ink tracking-tight">
            Signal Intelligence
          </h2>
          <p className="font-sans text-body-sm text-body-text mt-xxs">
            Review live strategy triggers, analytical confidence indices, and AI justifications.
          </p>
        </div>
        {liveCount > 0 && (
          <div className="flex items-center gap-xs px-sm py-xxs bg-success/10 border border-success/30 rounded-pill">
            <span className="w-xxs h-xxs rounded-full bg-success animate-pulse inline-block" />
            <span className="font-mono text-[10px] text-success uppercase font-semibold">
              {liveCount} live signal{liveCount !== 1 ? 's' : ''}
            </span>
            <Radio className="w-xxs h-xxs text-success" />
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="bg-canvas border border-hairline p-md rounded-md flex flex-wrap gap-md items-center justify-between shadow-level-2">
        <div className="flex flex-wrap gap-sm items-center">
          <div>
            <label className="block font-mono text-[10px] text-mute uppercase mb-xxs">Pair</label>
            <select
              value={filterPair}
              onChange={(e) => setFilterPair(e.target.value)}
              className="form-input bg-canvas focus:outline-none"
            >
              <option value="">All Pairs</option>
              <option value="XAUUSD">XAUUSD</option>
              <option value="EURUSD">EURUSD</option>
            </select>
          </div>
          <div>
            <label className="block font-mono text-[10px] text-mute uppercase mb-xxs">Strategy</label>
            <select
              value={filterStrategy}
              onChange={(e) => setFilterStrategy(e.target.value)}
              className="form-input bg-canvas focus:outline-none"
            >
              <option value="">All Strategies</option>
              <option value="order_block_reversal">Order Block Reversal</option>
              <option value="fvg_scalper">FVG Scalper</option>
              <option value="tick_scalper">Tick Scalper</option>
              <option value="liquidity_sweep">Liquidity Sweep</option>
            </select>
          </div>
          <div>
            <label className="block font-mono text-[10px] text-mute uppercase mb-xxs">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="form-input bg-canvas focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="LIVE">LIVE</option>
              <option value="EXECUTED">EXECUTED</option>
              <option value="TP2_HIT">TP HIT</option>
              <option value="SL_HIT">SL HIT</option>
            </select>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="bg-primary text-on-primary font-sans text-button-md font-medium px-md h-[36px] rounded-sm hover:opacity-90 transition-opacity mt-sm md:mt-0 flex items-center gap-xs disabled:opacity-60"
        >
          <RefreshCw className={`w-xxs h-xxs ${isFetching ? 'animate-spin' : ''}`} />
          {isFetching ? 'Querying…' : 'Query Database'}
        </button>
      </div>

      {/* Signals Table */}
      <div className="bg-canvas border border-hairline rounded-md shadow-level-3 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-canvas-soft-2 border-b border-hairline font-mono text-caption-mono text-mute">
                <th className="p-sm">TIME</th>
                <th className="p-sm">PAIR</th>
                <th className="p-sm">DIRECTION</th>
                <th className="p-sm">STRATEGY</th>
                <th className="p-sm">TIMEFRAME</th>
                <th className="p-sm">CONFIDENCE</th>
                <th className="p-sm">ENTRY</th>
                <th className="p-sm">STOP LOSS</th>
                <th className="p-sm">STATUS</th>
                <th className="p-sm text-center">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {signalsList.length > 0 ? (
                signalsList.map((sig) => {
                  const isLive = sig.status === 'LIVE'
                  const isFromStore = storeSignals.some(s => s.id === sig.id)
                  return (
                    <tr
                      key={sig.id}
                      onClick={() => handleRowClick(sig)}
                      className="hover:bg-canvas-soft transition-colors cursor-pointer text-body-sm text-body-text"
                    >
                      <td className="p-sm font-mono text-caption-mono text-mute whitespace-nowrap">
                        <span className="flex items-center gap-xs">
                          {isFromStore && (
                            <span className="w-[5px] h-[5px] rounded-full bg-success animate-pulse inline-block shrink-0" title="Live signal" />
                          )}
                          {new Date(sig.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="p-sm font-semibold text-ink">{sig.pair}</td>
                      <td className="p-sm">
                        <span className={`font-mono text-[10px] font-bold px-xxs py-[2px] rounded-xs ${
                          sig.direction === 'BUY' ? 'bg-link/15 text-link' : 'bg-error/15 text-error'
                        }`}>
                          {sig.direction}
                        </span>
                      </td>
                      <td className="p-sm capitalize">{sig.strategy.replaceAll('_', ' ')}</td>
                      <td className="p-sm font-mono text-caption-mono">{sig.timeframe}</td>
                      <td className="p-sm font-mono text-caption-mono font-semibold text-ink">{sig.confidence}%</td>
                      <td className="p-sm font-mono text-caption-mono">${sig.entry_price.toFixed(2)}</td>
                      <td className="p-sm font-mono text-caption-mono text-error">${sig.sl_price.toFixed(2)}</td>
                      <td className="p-sm">
                        <span className="flex items-center gap-xs">
                          {isLive && <span className="w-xxs h-xxs rounded-full bg-success animate-pulse inline-block" />}
                          <span className={`font-mono text-[9px] uppercase font-bold ${
                            isLive 
                              ? 'text-success' 
                              : sig.status.includes('HIT') 
                                ? 'text-link' 
                                : 'text-mute'
                          }`}>
                            {sig.status}
                          </span>
                        </span>
                      </td>
                      <td className="p-sm text-center">
                        <ChevronRight className="w-xs h-xs text-mute inline-block" />
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={10} className="text-center py-xl">
                    <div className="flex flex-col items-center gap-xs text-mute">
                      <Radio className="w-sm h-sm opacity-30" />
                      <span className="font-sans text-body-sm">No signals matched your criteria.</span>
                      <span className="font-mono text-caption-mono text-[10px]">
                        Signals will appear here when the trading engine generates them, or click &quot;Query Database&quot; to fetch historical ones.
                      </span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg mt-md">
        <div className="bg-canvas border border-hairline rounded-md p-md shadow-level-2">
          <h4 className="font-sans text-body-md font-semibold text-ink mb-sm">Strategy Win Rate % Performance</h4>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={strategyPerformanceData}>
                <XAxis dataKey="name" stroke="#888888" fontSize={9} tickLine={false} />
                <YAxis stroke="#888888" fontSize={9} tickLine={false} />
                <Tooltip />
                <Bar dataKey="winRate" fill="#171717" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-canvas border border-hairline rounded-md p-md shadow-level-2 flex flex-col justify-between">
          <div>
            <h4 className="font-sans text-body-md font-semibold text-ink mb-xxs font-medium">Signal Volumes Overview</h4>
            <p className="font-sans text-caption text-body-text">
              Track the concentration of algorithm signals triggering per active market configuration.
            </p>
          </div>
          <div className="space-y-sm mt-md">
            {strategyPerformanceData.map(strat => (
              <div key={strat.name} className="flex justify-between items-center text-body-sm">
                <span className="text-body-text">{strat.name}</span>
                <span className="font-mono text-caption-mono font-semibold text-ink">{strat.signals} Signals</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Drawer Overlay for Signal Details */}
      {drawerOpen && selectedSignal && (
        <div className="absolute right-0 top-0 bottom-0 w-[360px] bg-canvas border-l border-hairline shadow-level-5 p-xl flex flex-col justify-between z-40 transition-transform duration-300">
          <div className="space-y-lg">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-hairline pb-xs">
              <h3 className="font-sans text-body-md font-semibold text-ink">Signal Blueprint</h3>
              <button onClick={() => setDrawerOpen(false)} className="text-mute hover:text-ink transition-colors">
                <X className="w-sm h-sm" />
              </button>
            </div>

            {/* Signal Profile */}
            <div className="space-y-sm text-body-sm text-body-text">
              <div className="flex justify-between">
                <span>Signal Reference ID</span>
                <span className="font-mono text-[10px] text-mute">{selectedSignal.id}</span>
              </div>
              <div className="flex justify-between">
                <span>Asset Class / Pair</span>
                <span className="font-semibold text-ink">{selectedSignal.pair}</span>
              </div>
              <div className="flex justify-between">
                <span>Direction</span>
                <span className={`font-bold font-mono text-[9px] px-xxs rounded-xs ${
                  selectedSignal.direction === 'BUY' ? 'bg-link/15 text-link' : 'bg-error/15 text-error'
                }`}>{selectedSignal.direction}</span>
              </div>
              <div className="flex justify-between">
                <span>Trigger Time</span>
                <span className="font-mono text-caption-mono">{new Date(selectedSignal.created_at).toLocaleTimeString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Trigger Price</span>
                <span className="font-mono text-caption-mono font-semibold text-ink">${selectedSignal.entry_price}</span>
              </div>
              <div className="flex justify-between">
                <span>Confidence Index</span>
                <span className="font-mono text-caption-mono text-success font-semibold">{selectedSignal.confidence}%</span>
              </div>
              {selectedSignal.tp_levels && selectedSignal.tp_levels.length > 0 && (
                <div className="border-t border-hairline pt-xs">
                  <span className="block font-mono text-[10px] text-mute mb-xs">TAKE PROFIT LEVELS</span>
                  <div className="space-y-xxs">
                    {selectedSignal.tp_levels.map((tp, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="font-mono text-[10px] text-mute">TP{i+1} ({tp.rr}R)</span>
                        <span className="font-mono text-caption-mono text-success font-semibold">${tp.price?.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* AI Explanation Section */}
            <div className="border-t border-hairline pt-md space-y-xxs">
              <label className="block font-mono text-caption-mono text-mute">AI ADVISOR RATIONALE</label>
              <div className="bg-canvas-soft border border-hairline p-sm rounded-sm text-caption text-body-text leading-relaxed">
                {loadingAi ? (
                  <div className="flex items-center gap-xs">
                    <span className="w-xxs h-xxs rounded-full bg-primary animate-ping" />
                    <span>Claude formulating explanation...</span>
                  </div>
                ) : (
                  aiExplanation || "No analysis generated."
                )}
              </div>
            </div>
          </div>

          <button
            onClick={() => setDrawerOpen(false)}
            className="w-full bg-primary text-on-primary font-sans text-button-md font-medium h-[36px] rounded-sm hover:opacity-90 transition-opacity"
          >
            Close Blueprint
          </button>
        </div>
      )}

    </div>
  )
}
