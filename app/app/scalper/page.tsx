'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useStore } from '@/store'
import { useLiveData } from '@/hooks/useLiveData'
import { ToastProvider, useToast } from '@/components/Toast'
import { createChart, IChartApi, ISeriesApi, CandlestickSeries } from 'lightweight-charts'
import { useQuery } from '@tanstack/react-query'
import { ArrowUp, ArrowDown, X, AlertTriangle, Loader2, WifiOff } from 'lucide-react'
import { getBaseApiUrl } from '@/lib/api-helper'

function ScalperContent() {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)

  const { openTrade, closeTrade } = useLiveData()
  const { prices, positions, bridgeStatus, theme, user } = useStore()
  const { addToast } = useToast()

  const [lots, setLots] = useState(0.01)
  const [slPips, setSlPips] = useState(50)
  const [tpPips, setTpPips] = useState(100)
  const [aiAuto, setAiAuto] = useState(false)
  const [confirmCloseAll, setConfirmCloseAll] = useState(false)
  const [buyLoading, setBuyLoading] = useState(false)
  const [sellLoading, setSellLoading] = useState(false)

  const xauPrice = prices['XAUUSD']
  const bid = xauPrice?.bid ?? 1950.00
  const ask = xauPrice?.ask ?? 1950.50
  const spread = xauPrice?.spread ?? 0.50

  const isBridgeConnected = bridgeStatus === 'connected'

  // ATR / session mock
  const atr = 2.4
  const session = (() => {
    const h = new Date().getUTCHours()
    if (h >= 7 && h < 16) return 'London'
    if (h >= 13 && h < 21) return 'New York'
    return 'Asia'
  })()

  const { data: ohlcvData } = useQuery({
    queryKey: ['ohlcv-m1', user?.id],
    queryFn: async () => {
      try {
        const apiBase = getBaseApiUrl()
        const res = await fetch(`${apiBase}/ohlcv?pair=XAUUSD&tf=M1&bars=200&user_id=${user?.id || ''}`)
        if (!res.ok) throw new Error('Failed to fetch from local API')
        return await res.json()
      } catch (err) {
        console.warn('[Scalper] Local API unreachable. Falling back to Vercel API proxy.', err)
        const res = await fetch(`/api/market/ohlcv?pair=XAUUSD&tf=M1&bars=200&user_id=${user?.id || ''}`)
        if (!res.ok) {
          throw new Error('Failed to fetch live market data')
        }
        return await res.json()
      }
    },
    refetchInterval: 15000
  })

  // Init Chart
  useEffect(() => {
    if (!chartContainerRef.current) return
    if (chartRef.current) {
      try {
        chartRef.current.remove()
      } catch (e) {}
      chartRef.current = null
      candleSeriesRef.current = null
    }

    const initialHeight = chartContainerRef.current.clientHeight || 400

    const isDark = theme === 'dark'
    const chartBg = isDark ? '#000000' : '#ffffff'
    const chartText = isDark ? '#a0a0a0' : '#888888'
    const gridColor = isDark ? '#111111' : '#f5f5f5'
    const borderColor = isDark ? '#222222' : '#ebebeb'

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { color: chartBg }, textColor: chartText, fontFamily: 'var(--font-sans)' },
      grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
      timeScale: { borderColor: borderColor, timeVisible: true },
      rightPriceScale: { borderColor: borderColor },
      width: chartContainerRef.current.clientWidth || 600,
      height: initialHeight
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#0070f3', downColor: '#ee0000',
      borderUpColor: '#0070f3', borderDownColor: '#ee0000',
      wickUpColor: '#0070f3', wickDownColor: '#ee0000'
    })

    chartRef.current = chart
    candleSeriesRef.current = series

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
      }
    }
  }, [theme])

  useEffect(() => {
    if (candleSeriesRef.current && Array.isArray(ohlcvData) && ohlcvData.length > 0) {
      candleSeriesRef.current.setData(ohlcvData)
    }
  }, [ohlcvData])

  const executeTrade = useCallback(async (direction: 'BUY' | 'SELL') => {
    if (!isBridgeConnected) {
      addToast({
        type: 'error',
        title: 'Bridge Disconnected',
        message: 'Connect your MT5 broker account in Settings → Broker / MT5 before placing trades.',
        duration: 6000
      })
      return
    }

    const setLoading = direction === 'BUY' ? setBuyLoading : setSellLoading
    setLoading(true)

    const sl = direction === 'BUY' ? bid - slPips * 0.1 : ask + slPips * 0.1
    const tp = direction === 'BUY' ? bid + tpPips * 0.1 : ask - tpPips * 0.1

    try {
      const result = await openTrade({ pair: 'XAUUSD', direction, lots, sl, tp })
      addToast({
        type: 'success',
        title: `${direction} Order Sent`,
        message: result.ticket
          ? `Ticket #${result.ticket} opened at ${result.open_price ?? (direction === 'BUY' ? ask : bid).toFixed(2)}`
          : result.message || `${lots}L XAUUSD ${direction} order submitted to MT5`,
        duration: 5000
      })
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Trade Failed',
        message: err.message || 'MT5 bridge could not execute the trade.',
        duration: 7000
      })
    } finally {
      setLoading(false)
    }
  }, [isBridgeConnected, bid, ask, slPips, tpPips, lots, openTrade, addToast])

  const handleBuy = useCallback(() => executeTrade('BUY'), [executeTrade])
  const handleSell = useCallback(() => executeTrade('SELL'), [executeTrade])

  const handleCloseAll = () => {
    positions.forEach(p => closeTrade(p.ticket))
    setConfirmCloseAll(false)
    addToast({ type: 'info', title: 'Close All Sent', message: 'Close requests submitted for all open positions.', duration: 4000 })
  }

  return (
    <div className="h-screen flex flex-col bg-canvas text-ink overflow-hidden">
      {/* Top bar */}
      <div className="h-[48px] border-b border-hairline flex items-center justify-between px-lg shrink-0">
        <span className="font-sans text-body-sm font-semibold text-ink/80">
          AURIC PRO — <span className="text-[#f5a623]">SCALPER MODE</span>
        </span>
        <div className="flex items-center gap-sm">
          <span className={`w-xxs h-xxs rounded-full inline-block ${isBridgeConnected ? 'bg-success animate-pulse' : 'bg-error animate-pulse'}`} />
          <span className="font-mono text-caption-mono text-mute uppercase">Bridge: {bridgeStatus}</span>
          <a href="/app/dashboard" className="border border-hairline px-sm py-xxs rounded-sm text-body-text hover:bg-canvas-soft-2 font-sans text-caption transition-colors">
            Exit Scalper
          </a>
        </div>
      </div>

      {/* Bridge disconnected banner */}
      {!isBridgeConnected && (
        <div className="bg-error/10 border-b border-error/30 px-lg py-xs flex items-center gap-sm shrink-0">
          <WifiOff className="w-xxs h-xxs text-error shrink-0" />
          <span className="font-mono text-caption-mono text-error">
            MT5 bridge offline — trades cannot be executed. Go to{' '}
            <a href="/app/settings" className="underline hover:opacity-85">Settings → Broker / MT5</a>
            {' '}to connect.
          </span>
        </div>
      )}

      {/* 3-column layout */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-y-auto lg:overflow-hidden bg-canvas">

        {/* Left — Live Price Feed */}
        <div className="w-full lg:w-[200px] border-b lg:border-b-0 lg:border-r border-hairline flex flex-row lg:flex-col p-md gap-md justify-between lg:justify-start shrink-0 items-center lg:items-stretch bg-canvas-soft">
          <div>
            <span className="font-mono text-[9px] text-mute uppercase tracking-widest block mb-xxs">XAUUSD</span>
            <div className="font-mono text-display-lg font-semibold text-ink leading-none">
              {bid.toFixed(2)}
            </div>
            <div className="flex gap-sm mt-xxs">
              <div>
                <span className="block font-mono text-[9px] text-mute uppercase">BID</span>
                <span className="font-mono text-body-sm text-body-text">{bid.toFixed(2)}</span>
              </div>
              <div>
                <span className="block font-mono text-[9px] text-mute uppercase">ASK</span>
                <span className="font-mono text-body-sm text-body-text">{ask.toFixed(2)}</span>
              </div>
            </div>
            <div className="mt-xxs">
              <span className="font-mono text-[9px] text-mute uppercase">SPREAD</span>
              <span className="font-mono text-caption ml-xs text-warning-deep">{spread.toFixed(2)} pts</span>
            </div>
          </div>

          <div className="border-t lg:border-t border-hairline pt-md space-y-xs hidden lg:block">
            <div>
              <span className="font-mono text-[9px] text-mute uppercase block">ATR (14)</span>
              <span className="font-mono text-body-sm text-body-text">{atr}</span>
            </div>
            <div>
              <span className="font-mono text-[9px] text-mute uppercase block">SESSION</span>
              <span className="font-mono text-body-sm text-cyan-deep">{session}</span>
            </div>
            <div>
              <span className="font-mono text-[9px] text-mute uppercase block">AI SIGNAL</span>
              <span className="font-mono text-caption-mono text-link font-bold">BUY 88.5%</span>
            </div>
          </div>
        </div>

        {/* Center — M1 Chart */}
        <div className="flex-1 flex flex-col bg-canvas min-h-[300px] lg:min-h-0">
          <div ref={chartContainerRef} className="flex-1 w-full" />
        </div>

        {/* Right — Quick Controls */}
        <div className="w-full lg:w-[220px] border-t lg:border-t-0 lg:border-l border-hairline flex flex-col p-md gap-md shrink-0 bg-canvas-soft">
          {/* Lot Size */}
          <div>
            <label className="font-mono text-[9px] text-mute uppercase block mb-xxs">LOT SIZE</label>
            <div className="flex items-center border border-hairline rounded-sm overflow-hidden bg-canvas">
              <button onClick={() => setLots(Math.max(0.01, parseFloat((lots - 0.01).toFixed(2))))} className="px-xs py-xxs bg-canvas-soft-2 text-body-text hover:text-ink border-r border-hairline">−</button>
              <input type="number" value={lots} step={0.01} min={0.01} onChange={e => setLots(parseFloat(e.target.value))}
                className="flex-1 bg-transparent text-center font-mono text-body-sm text-ink focus:outline-none py-xxs" />
              <button onClick={() => setLots(parseFloat((lots + 0.01).toFixed(2)))} className="px-xs py-xxs bg-canvas-soft-2 text-body-text hover:text-ink border-l border-hairline">+</button>
            </div>
          </div>

          {/* SL / TP */}
          <div className="grid grid-cols-2 gap-xs">
            <div>
              <label className="font-mono text-[9px] text-mute uppercase block mb-xxs">SL (pips)</label>
              <input type="number" value={slPips} onChange={e => setSlPips(parseInt(e.target.value))}
                className="w-full bg-canvas border border-hairline rounded-xs px-xs py-xxs font-mono text-body-sm text-ink focus:outline-none" />
            </div>
            <div>
              <label className="font-mono text-[9px] text-mute uppercase block mb-xxs">TP (pips)</label>
              <input type="number" value={tpPips} onChange={e => setTpPips(parseInt(e.target.value))}
                className="w-full bg-canvas border border-hairline rounded-xs px-xs py-xxs font-mono text-body-sm text-ink focus:outline-none" />
            </div>
          </div>

          {/* BUY / SELL Buttons */}
          <button
            onClick={handleBuy}
            disabled={buyLoading || sellLoading}
            className={`w-full font-sans text-button-lg font-bold py-md rounded-sm active:scale-[0.98] transition-all flex items-center justify-center gap-xs cursor-pointer ${
              !isBridgeConnected
                ? 'bg-link/40 text-on-primary/40 cursor-not-allowed'
                : 'bg-link text-on-primary hover:bg-link-deep disabled:opacity-60 disabled:cursor-not-allowed'
            }`}
            title={!isBridgeConnected ? 'Bridge disconnected — connect MT5 first' : 'Open BUY position'}
          >
            {buyLoading
              ? <><Loader2 className="w-xs h-xxs animate-spin" /> Sending...</>
              : <><ArrowUp className="w-sm h-sm" /> BUY MARKET</>
            }
          </button>
          <button
            onClick={handleSell}
            disabled={buyLoading || sellLoading}
            className={`w-full font-sans text-button-lg font-bold py-md rounded-sm active:scale-[0.98] transition-all flex items-center justify-center gap-xs cursor-pointer ${
              !isBridgeConnected
                ? 'bg-error/40 text-on-primary/40 cursor-not-allowed'
                : 'bg-error text-on-primary hover:bg-error-deep disabled:opacity-60 disabled:cursor-not-allowed'
            }`}
            title={!isBridgeConnected ? 'Bridge disconnected — connect MT5 first' : 'Open SELL position'}
          >
            {sellLoading
              ? <><Loader2 className="w-xs h-xxs animate-spin" /> Sending...</>
              : <><ArrowDown className="w-sm h-sm" /> SELL MARKET</>
            }
          </button>

          {/* AI Auto Toggle */}
          <div className="flex items-center justify-between border border-hairline rounded-sm px-sm py-xs bg-canvas">
            <div>
              <span className="font-mono text-[9px] text-mute uppercase block">AI AUTO</span>
              <span className="font-sans text-caption text-body-text">{aiAuto ? 'Engine Active' : 'Manual Mode'}</span>
            </div>
            <button onClick={() => setAiAuto(!aiAuto)}
              className={`w-[40px] h-[22px] rounded-full relative transition-colors cursor-pointer ${aiAuto ? 'bg-link' : 'bg-canvas-soft-2 border border-hairline'}`}>
              <span className={`absolute top-[2px] w-[16px] h-[16px] rounded-full bg-ink transition-all ${aiAuto ? 'left-[21px] bg-white' : 'left-[2px]'}`} />
            </button>
          </div>

          {/* Close All */}
          {!confirmCloseAll ? (
            <button onClick={() => setConfirmCloseAll(true)}
              className="w-full border border-error/40 text-error font-sans text-body-sm font-semibold py-xs rounded-sm hover:bg-error-soft/10 transition-colors flex items-center justify-center gap-xs cursor-pointer">
              <AlertTriangle className="w-xs h-xs" /> Close All Positions
            </button>
          ) : (
            <div className="border border-error rounded-sm p-xs text-center space-y-xs bg-canvas">
              <p className="font-sans text-caption text-body-text">Confirm close all?</p>
              <div className="flex gap-xs">
                <button onClick={() => setConfirmCloseAll(false)} className="flex-1 border border-hairline text-body-text text-caption py-xxs rounded-xs">No</button>
                <button onClick={handleCloseAll} className="flex-1 bg-error text-on-primary text-caption py-xxs rounded-xs">Yes, Close</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom — Open Scalp Trades */}
      <div className="h-[60px] border-t border-hairline flex items-center px-lg gap-md overflow-x-auto shrink-0 bg-canvas-soft-2">
        <span className="font-mono text-[9px] text-mute uppercase shrink-0">OPEN SCALPS</span>
        {positions.length === 0 ? (
          <span className="font-mono text-caption-mono text-mute">No active positions</span>
        ) : (
          positions.map(pos => (
            <div key={pos.ticket} className="flex items-center gap-sm border border-hairline rounded-sm px-sm py-xxs shrink-0 bg-canvas text-ink">
              <span className={`font-mono text-[9px] font-bold ${pos.type === 'BUY' ? 'text-link' : 'text-error'}`}>{pos.type}</span>
              <span className="font-mono text-caption-mono text-body-text">{pos.symbol} {pos.volume}L</span>
              <span className={`font-mono text-caption-mono font-bold ${pos.profit >= 0 ? 'text-success' : 'text-error'}`}>
                {pos.profit >= 0 ? '+' : ''}${pos.profit.toFixed(2)}
              </span>
              <button onClick={() => closeTrade(pos.ticket)} className="text-mute hover:text-error transition-colors cursor-pointer">
                <X className="w-xxs h-xxs" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default function ScalperPage() {
  return (
    <ToastProvider>
      <ScalperContent />
    </ToastProvider>
  )
}
