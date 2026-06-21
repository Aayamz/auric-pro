'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useStore, MTPosition, Signal } from '@/store'
import { useLiveData } from '@/hooks/useLiveData'
import { createChart, IChartApi, ISeriesApi, CandlestickSeries, createSeriesMarkers } from 'lightweight-charts'
import { Edit2 } from 'lucide-react'
import { useToast } from '@/components/Toast'
import { getBaseApiUrl } from '@/lib/api-helper'

export default function DashboardPage() {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const markersRef = useRef<any>(null)
  const tpLineRef = useRef<any>(null)
  const slLineRef = useRef<any>(null)
  const aiEntryLineRef = useRef<any>(null)
  
  const { openTrade, closeTrade, modifyTrade } = useLiveData()
  const { addToast } = useToast()
  const { 
    prices, 
    positions, 
    signals, 
    setSignals,
    selectedPair, 
    setSelectedPair, 
    selectedTimeframe, 
    setSelectedTimeframe,
    chartOverlays,
    setChartOverlay,
    theme,
    user
  } = useStore()

  // Modal / Drawer States for Modify Position
  const [modifyModalOpen, setModifyModalOpen] = useState(false)
  const [targetTicket, setTargetTicket] = useState<number | null>(null)
  const [modifySL, setModifySL] = useState('')
  const [modifyTP, setModifyTP] = useState('')

  // Fetch OHLCV data using React Query (attempts local direct query first, falls back to Vercel proxy)
  const { data: ohlcvData, refetch: refetchOhlcv } = useQuery({
    queryKey: ['ohlcv', selectedPair, selectedTimeframe, user?.id],
    queryFn: async () => {
      try {
        const apiBase = getBaseApiUrl()
        const res = await fetch(`${apiBase}/ohlcv?pair=${selectedPair}&tf=${selectedTimeframe}&bars=200&user_id=${user?.id || ''}`)
        if (!res.ok) throw new Error('Failed to fetch from local API')
        return await res.json()
      } catch (err) {
        console.warn('[Dashboard] Local API unreachable. Falling back to Vercel API proxy.', err)
        const res = await fetch(`/api/market/ohlcv?pair=${selectedPair}&tf=${selectedTimeframe}&bars=200&user_id=${user?.id || ''}`)
        if (!res.ok) {
          throw new Error('Failed to fetch live market data')
        }
        return await res.json()
      }
    },
    refetchInterval: 10000 // Poll every 10s as a fallback
  })

  // Fetch initial active signals
  useEffect(() => {
    fetch('/api/signals?status=LIVE')
      .then(res => res.json())
      .then(data => setSignals(data))
      .catch(() => {})
  }, [setSignals])

    // Initialize and update the TradingView Lightweight Chart
  useEffect(() => {
    if (!chartContainerRef.current) return

    // Clean up old chart instance
    if (chartRef.current) {
      try {
        chartRef.current.remove()
      } catch (e) {}
      chartRef.current = null
      candleSeriesRef.current = null
      markersRef.current = null
    }

    const initialHeight = chartContainerRef.current.clientHeight || 400

    const isDark = theme === 'dark'
    const chartBg = isDark ? '#000000' : '#ffffff'
    const chartText = isDark ? '#a0a0a0' : '#888888'
    const gridColor = isDark ? '#111111' : '#f5f5f5'
    const borderColor = isDark ? '#222222' : '#ebebeb'

    // Create Chart Instance
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: chartBg },
        textColor: chartText,
        fontFamily: 'var(--font-sans)'
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor }
      },
      timeScale: {
        borderColor: borderColor,
        timeVisible: true,
        secondsVisible: false
      },
      rightPriceScale: {
        borderColor: borderColor
      },
      width: chartContainerRef.current.clientWidth || 600,
      height: initialHeight
    })

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#0070f3',
      downColor: '#ee0000',
      borderUpColor: '#0070f3',
      borderDownColor: '#ee0000',
      wickUpColor: '#0070f3',
      wickDownColor: '#ee0000'
    })

    chartRef.current = chart
    candleSeriesRef.current = candlestickSeries
    markersRef.current = createSeriesMarkers(candlestickSeries, [])

    // Handle Resize using ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return
      const { width, height } = entries[0].contentRect
      if (chartRef.current) {
        chartRef.current.applyOptions({
          width: width,
          height: height || 400
        })
      }
    })

    resizeObserver.observe(chartContainerRef.current)

    return () => {
      resizeObserver.disconnect()
      if (chartRef.current) {
        try {
          chartRef.current.remove()
        } catch (e) {}
        chartRef.current = null
        candleSeriesRef.current = null
        markersRef.current = null
      }
    }
  }, [selectedPair, theme])

  // Feed Data and Draw Overlays on Chart
  useEffect(() => {
    if (!candleSeriesRef.current || !Array.isArray(ohlcvData) || ohlcvData.length === 0) return

    // Set Candlestick Data
    candleSeriesRef.current.setData(ohlcvData)

    const latestPrice = ohlcvData[ohlcvData.length - 1].close

    // 1. Draw Active TP Line
    if (tpLineRef.current) {
      try {
        candleSeriesRef.current.removePriceLine(tpLineRef.current)
      } catch (e) {}
      tpLineRef.current = null
    }
    if (chartOverlays.tp) {
      tpLineRef.current = candleSeriesRef.current.createPriceLine({
        price: latestPrice + 12.0,
        color: '#0070f3',
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: 'Active TP1 (Take Profit)'
      })
    }

    // 2. Draw Active SL Line
    if (slLineRef.current) {
      try {
        candleSeriesRef.current.removePriceLine(slLineRef.current)
      } catch (e) {}
      slLineRef.current = null
    }
    if (chartOverlays.sl) {
      slLineRef.current = candleSeriesRef.current.createPriceLine({
        price: latestPrice - 8.0,
        color: '#ee0000',
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: 'Active SL (Stop Loss)'
      })
    }

    // 2.5. Draw AI Entry Line
    if (aiEntryLineRef.current) {
      try {
        candleSeriesRef.current.removePriceLine(aiEntryLineRef.current)
      } catch (e) {}
      aiEntryLineRef.current = null
    }
    const aiMarkerIndex = Math.min(195, ohlcvData.length - 2)
    const aiPrice = ohlcvData[aiMarkerIndex]?.close
    if (aiPrice) {
      aiEntryLineRef.current = candleSeriesRef.current.createPriceLine({
        price: aiPrice,
        color: '#7928ca',
        lineWidth: 1,
        lineStyle: 0, // Solid
        axisLabelVisible: true,
        title: 'AI Entry Level'
      })
    }

    // 3. Mark indicators/markers
    const markers: Record<string, unknown>[] = []
    if (chartOverlays.bos) {
      // Draw Breakout arrow indicator on historical candles
      const markerIndex = Math.min(180, ohlcvData.length - 5)
      markers.push({
        time: ohlcvData[markerIndex].time,
        position: 'aboveBar',
        color: '#f5a623',
        shape: 'arrowDown',
        text: 'BOS Break'
      })
    }

    // AI Entry marker symbol (◆)
    markers.push({
      time: ohlcvData[aiMarkerIndex].time,
      position: 'belowBar',
      color: '#7928ca',
      shape: 'diamond',
      text: 'AI Entry'
    })

    if (markersRef.current) {
      markersRef.current.setMarkers(markers)
    }

  }, [ohlcvData, chartOverlays])

  // Force refetch on pair/tf change
  useEffect(() => {
    refetchOhlcv()
  }, [selectedPair, selectedTimeframe, refetchOhlcv])

  const triggerOpenTrade = async (signal: Signal) => {
    try {
      addToast({
        type: 'info',
        title: 'Executing Signal',
        message: `Sending ${signal.direction} order for ${signal.pair}...`,
        duration: 3000
      })
      const result = await openTrade({
        pair: signal.pair,
        direction: signal.direction,
        lots: 0.05, // Standard lots
        sl: signal.sl_price,
        tp: signal.tp_levels?.[0]?.price || (signal.entry_price + 10)
      })
      addToast({
        type: 'success',
        title: 'Signal Executed',
        message: result.ticket
          ? `Ticket #${result.ticket} opened successfully`
          : result.message || 'Order executed successfully on MT5',
        duration: 5000
      })
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Execution Failed',
        message: err.message || 'MT5 bridge could not execute trade.',
        duration: 7000
      })
    }
  }

  const handleOpenModify = (position: MTPosition) => {
    setTargetTicket(position.ticket)
    setModifySL(String(position.open_price - 5))
    setModifyTP(String(position.open_price + 10))
    setModifyModalOpen(true)
  }

  const submitModify = () => {
    if (targetTicket !== null) {
      modifyTrade({
        ticket: targetTicket,
        sl: parseFloat(modifySL),
        tp1: parseFloat(modifyTP)
      })
      setModifyModalOpen(false)
      setTargetTicket(null)
    }
  }

  return (
    <div className="space-y-lg flex flex-col h-full">
      
      {/* Dynamic Controls Header (fully responsive layout on mobile) */}
      <div className="flex flex-col gap-md lg:flex-row lg:justify-between lg:items-center bg-canvas border border-hairline p-md rounded-md">
        <div className="flex flex-col sm:flex-row sm:items-center gap-md">
          {/* Pair Select */}
          <div className="w-full sm:w-auto">
            <label className="block font-mono text-[10px] text-mute uppercase mb-xxs">Trading Pair</label>
            <select
              value={selectedPair}
              onChange={(e) => setSelectedPair(e.target.value)}
              className="form-input bg-canvas font-mono font-medium focus:outline-none w-full sm:w-[160px]"
            >
              {/* Default pairs always shown */}
              {Array.from(
                new Set([
                  'XAUUSD',
                  'EURUSD',
                  'GBPUSD',
                  // Dynamically inject symbols from live MT5 positions
                  ...(positions ?? []).map((p: MTPosition) => p.symbol)
                ])
              ).map((pair) => (
                <option key={pair} value={pair}>{pair}</option>
              ))}
            </select>
          </div>

          {/* Timeframes Select */}
          <div>
            <label className="block font-mono text-[10px] text-mute uppercase mb-xxs">Timeframe</label>
            <div className="flex gap-[2px] bg-canvas-soft-2 p-[2px] rounded-sm border border-hairline w-fit">
              {['M1', 'M5', 'M15', 'H1', 'H4'].map((tf) => (
                <button
                  key={tf}
                  onClick={() => setSelectedTimeframe(tf)}
                  className={`px-sm py-xxs font-mono text-[11px] font-semibold rounded-xs transition-colors ${
                    selectedTimeframe === tf 
                      ? 'bg-canvas text-ink shadow-level-2' 
                      : 'text-body-text hover:text-ink'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chart Overlays toggles (wraps nicely on smaller screens) */}
        <div className="flex flex-wrap items-center gap-xs">
          <button
            onClick={() => setChartOverlay('ob', !chartOverlays.ob)}
            className={`px-sm py-xxs font-sans text-xxs font-medium border rounded-pill transition-colors ${
              chartOverlays.ob ? 'bg-primary text-on-primary border-primary' : 'bg-canvas text-body-text border-hairline'
            }`}
          >
            Order Blocks
          </button>
          <button
            onClick={() => setChartOverlay('fvg', !chartOverlays.fvg)}
            className={`px-sm py-xxs font-sans text-xxs font-medium border rounded-pill transition-colors ${
              chartOverlays.fvg ? 'bg-primary text-on-primary border-primary' : 'bg-canvas text-body-text border-hairline'
            }`}
          >
            FVG Zones
          </button>
          <button
            onClick={() => setChartOverlay('bos', !chartOverlays.bos)}
            className={`px-sm py-xxs font-sans text-xxs font-medium border rounded-pill transition-colors ${
              chartOverlays.bos ? 'bg-primary text-on-primary border-primary' : 'bg-canvas text-body-text border-hairline'
            }`}
          >
            BOS Markers
          </button>
          <button
            onClick={() => {
              setChartOverlay('tp', !chartOverlays.tp)
              setChartOverlay('sl', !chartOverlays.sl)
            }}
            className={`px-sm py-xxs font-sans text-xxs font-medium border rounded-pill transition-colors ${
              chartOverlays.tp ? 'bg-primary text-on-primary border-primary' : 'bg-canvas text-body-text border-hairline'
            }`}
          >
            SL/TP Limits
          </button>
        </div>
      </div>

      {/* Cockpit 3-Panel Grid layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-lg flex-1 min-h-0">
        
        {/* Panel 1: Main Chart Terminal */}
        <div className="lg:col-span-2 bg-canvas border border-hairline rounded-md flex flex-col p-md shadow-level-2 lg:h-full">
          <div className="flex justify-between items-center mb-sm border-b border-hairline pb-xs shrink-0">
            <h4 className="font-sans text-body-md font-semibold text-ink">
              Chart Console — {selectedPair} ({selectedTimeframe})
            </h4>
            <span className="font-mono text-caption-mono text-mute">
              Real-time update: {prices[selectedPair]?.bid ? 'Connected' : 'Syncing'}
            </span>
          </div>
          <div ref={chartContainerRef} className="w-full bg-canvas relative overflow-hidden h-[350px] lg:h-full lg:flex-1" />
        </div>

        {/* Panel 2 & 3 Right Container */}
        <div className="space-y-lg flex flex-col">
          
          {/* Panel 2: Live Signal Feed */}
          <div className="flex-1 bg-canvas border border-hairline rounded-md p-md flex flex-col shadow-level-2 overflow-hidden max-h-[300px]">
            <div className="flex justify-between items-center mb-sm border-b border-hairline pb-xs shrink-0">
              <h4 className="font-sans text-body-md font-semibold text-ink">Signals Feed</h4>
              <span className="font-mono text-caption-mono text-success">Live</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-xs pr-xxs">
              {signals && signals.length > 0 ? (
                signals.map((sig) => (
                  <div key={sig.id} className="p-sm border border-hairline rounded-sm bg-canvas-soft flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-xs">
                        <span className={`font-mono text-[10px] font-bold px-xxs py-[2px] rounded-xs ${
                          sig.direction === 'BUY' ? 'bg-link/15 text-link' : 'bg-error/15 text-error'
                        }`}>
                          {sig.direction}
                        </span>
                        <span className="font-sans text-body-sm font-semibold text-ink">{sig.pair}</span>
                      </div>
                      <p className="font-sans text-caption text-body-text mt-xxs">
                        {sig.strategy.replaceAll('_', ' ')} • Conf: {sig.confidence}%
                      </p>
                    </div>
                    <button
                      onClick={() => triggerOpenTrade(sig)}
                      className="bg-primary text-on-primary font-sans text-caption font-semibold px-sm py-xxs rounded-pill hover:opacity-90 transition-opacity"
                    >
                      Execute
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-center py-xl font-sans text-body-sm text-mute">
                  No signals detected at this moment.
                </div>
              )}
            </div>
          </div>

          {/* Panel 3: Open Positions Monitor */}
          <div className="flex-1 bg-canvas border border-hairline rounded-md p-md flex flex-col shadow-level-2 overflow-hidden max-h-[300px]">
            <div className="flex justify-between items-center mb-sm border-b border-hairline pb-xs shrink-0">
              <h4 className="font-sans text-body-md font-semibold text-ink">Open Positions ({positions.length})</h4>
              <span className="font-mono text-caption-mono text-mute">MT5 Bridge</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-xs pr-xxs">
              {positions && positions.length > 0 ? (
                positions.map((pos) => {
                  const isProfit = pos.profit >= 0
                  return (
                    <div key={pos.ticket} className="p-sm border border-hairline rounded-sm bg-canvas-soft space-y-xs">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-xs">
                          <span className={`font-mono text-[9px] font-bold px-xxs py-[2px] rounded-xs ${
                            pos.type === 'BUY' ? 'bg-link/15 text-link' : 'bg-error/15 text-error'
                          }`}>
                            {pos.type}
                          </span>
                          <span className="font-sans text-body-sm font-semibold text-ink">{pos.symbol}</span>
                          <span className="font-mono text-caption-mono text-mute">{pos.volume} Lots</span>
                        </div>
                        <span className={`font-mono text-caption-mono font-semibold ${isProfit ? 'text-success' : 'text-error'}`}>
                          ${pos.profit.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pt-xxs border-t border-hairline">
                        <span className="font-mono text-[9px] text-mute">
                          Open: {pos.open_price} • Cur: {pos.current_price}
                        </span>
                        <div className="flex gap-xs">
                          <button
                            onClick={() => handleOpenModify(pos)}
                            className="p-[3px] border border-hairline rounded-xs bg-canvas text-body-text hover:text-ink transition-colors"
                            title="Modify SL/TP"
                          >
                            <Edit2 className="w-xs h-xs" />
                          </button>
                          <button
                            onClick={() => closeTrade(pos.ticket)}
                            className="px-xs py-[2px] bg-error-soft text-error font-sans text-caption font-semibold rounded-sm hover:bg-error hover:text-on-primary transition-colors"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-center py-xl font-sans text-body-sm text-mute">
                  No active open positions.
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Modify Position SL/TP Modal Drawer */}
      {modifyModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-canvas border border-hairline p-xl rounded-md shadow-level-5 max-w-[400px] w-full mx-md">
            <h3 className="font-sans text-body-md font-semibold text-ink mb-xxs">
              Modify SL/TP Limits
            </h3>
            <p className="font-sans text-caption text-body-text mb-md">
              Update targets for position ticket #{targetTicket}:
            </p>
            <div className="space-y-sm mb-lg">
              <div>
                <label className="block font-mono text-caption-mono text-body-text mb-xxs">STOP LOSS (SL)</label>
                <input
                  type="number"
                  step="0.01"
                  value={modifySL}
                  onChange={(e) => setModifySL(e.target.value)}
                  className="w-full form-input focus:outline-none"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block font-mono text-caption-mono text-body-text mb-xxs">TAKE PROFIT (TP)</label>
                <input
                  type="number"
                  step="0.01"
                  value={modifyTP}
                  onChange={(e) => setModifyTP(e.target.value)}
                  className="w-full form-input focus:outline-none"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="flex gap-md">
              <button
                onClick={() => setModifyModalOpen(false)}
                className="flex-grow border border-hairline bg-canvas hover:bg-canvas-soft text-ink font-sans text-button-md font-medium h-[36px] rounded-sm"
              >
                Cancel
              </button>
              <button
                onClick={submitModify}
                className="flex-grow bg-primary text-on-primary font-sans text-button-md font-medium h-[36px] rounded-sm hover:opacity-90"
              >
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
