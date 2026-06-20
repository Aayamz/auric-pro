'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useStore } from '@/store'
import { useLiveData } from '@/hooks/useLiveData'
import { ToastProvider, useToast } from '@/components/Toast'
import { createChart, IChartApi, ISeriesApi, CandlestickSeries } from 'lightweight-charts'
import { useQuery } from '@tanstack/react-query'
import { ArrowUp, ArrowDown, X, AlertTriangle, Loader2, WifiOff } from 'lucide-react'

function ScalperContent() {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)

  const { openTrade, closeTrade } = useLiveData()
  const { prices, positions, bridgeStatus } = useStore()
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
    queryKey: ['ohlcv-m1'],
    queryFn: async () => {
      const res = await fetch('/api/market/ohlcv?pair=XAUUSD&tf=M1&bars=200')
      if (!res.ok) {
        throw new Error('Failed to fetch live market data')
      }
      return res.json()
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

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { color: '#0a0a0a' }, textColor: '#888' },
      grid: { vertLines: { color: '#1a1a1a' }, horzLines: { color: '#1a1a1a' } },
      timeScale: { borderColor: '#222', timeVisible: true },
      rightPriceScale: { borderColor: '#222' },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 400
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#0070f3', downColor: '#ee0000',
      borderUpColor: '#0070f3', borderDownColor: '#ee0000',
      wickUpColor: '#0070f3', wickDownColor: '#ee0000'
    })

    chartRef.current = chart
    candleSeriesRef.current = series

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth })
      }
    }
    window.addEventListener('resize', handleResize)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      if (chartRef.current) {
        try {
          chartRef.current.remove()
        } catch (e) {}
        chartRef.current = null
        candleSeriesRef.current = null
      }
    }
  }, [])

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
    <div className="h-screen flex flex-col bg-[#0a0a0a] text-white overflow-hidden">
      {/* Top bar */}
      <div className="h-[48px] border-b border-[#1f1f1f] flex items-center justify-between px-lg shrink-0">
        <span className="font-sans text-body-sm font-semibold text-white/80">
          AURIC PRO — <span className="text-[#f5a623]">SCALPER MODE</span>
        </span>
        <div className="flex items-center gap-sm">
          <span className={`w-xxs h-xxs rounded-full inline-block ${isBridgeConnected ? 'bg-[#0070f3] animate-pulse' : 'bg-[#ee0000] animate-pulse'}`} />
          <span className="font-mono text-caption-mono text-white/40 uppercase">Bridge: {bridgeStatus}</span>
          <a href="/app/dashboard" className="border border-[#2a2a2a] px-sm py-xxs rounded-sm text-white/50 hover:text-white/80 font-sans text-caption transition-colors">
            Exit Scalper
          </a>
        </div>
      </div>

      {/* Bridge disconnected banner */}
      {!isBridgeConnected && (
        <div className="bg-[#ee0000]/10 border-b border-[#ee0000]/30 px-lg py-xs flex items-center gap-sm shrink-0">
          <WifiOff className="w-xxs h-xxs text-[#ee0000] shrink-0" />
          <span className="font-mono text-caption-mono text-[#ee0000]">
            MT5 bridge offline — trades cannot be executed. Go to{' '}
            <a href="/app/settings" className="underline hover:text-white/80">Settings → Broker / MT5</a>
            {' '}to connect.
          </span>
        </div>
      )}

      {/* 3-column layout */}
      <div className="flex-1 flex min-h-0">

        {/* Left — Live Price Feed */}
        <div className="w-[200px] border-r border-[#1f1f1f] flex flex-col p-md gap-md shrink-0">
          <div>
            <span className="font-mono text-[9px] text-white/30 uppercase tracking-widest block mb-xxs">XAUUSD</span>
            <div className="font-mono text-display-lg font-semibold text-white leading-none">
              {bid.toFixed(2)}
            </div>
            <div className="flex gap-sm mt-xxs">
              <div>
                <span className="block font-mono text-[9px] text-white/30 uppercase">BID</span>
                <span className="font-mono text-body-sm text-white/70">{bid.toFixed(2)}</span>
              </div>
              <div>
                <span className="block font-mono text-[9px] text-white/30 uppercase">ASK</span>
                <span className="font-mono text-body-sm text-white/70">{ask.toFixed(2)}</span>
              </div>
            </div>
            <div className="mt-xxs">
              <span className="font-mono text-[9px] text-white/30 uppercase">SPREAD</span>
              <span className="font-mono text-caption ml-xs text-[#f5a623]">{spread.toFixed(2)} pts</span>
            </div>
          </div>

          <div className="border-t border-[#1f1f1f] pt-md space-y-xs">
            <div>
              <span className="font-mono text-[9px] text-white/30 uppercase block">ATR (14)</span>
              <span className="font-mono text-body-sm text-white/70">{atr}</span>
            </div>
            <div>
              <span className="font-mono text-[9px] text-white/30 uppercase block">SESSION</span>
              <span className="font-mono text-body-sm text-[#50e3c2]">{session}</span>
            </div>
            <div>
              <span className="font-mono text-[9px] text-white/30 uppercase block">AI SIGNAL</span>
              <span className="font-mono text-caption-mono text-[#0070f3] font-bold">BUY 88.5%</span>
            </div>
          </div>
        </div>

        {/* Center — M1 Chart */}
        <div className="flex-1 flex flex-col bg-[#0a0a0a]">
          <div ref={chartContainerRef} className="flex-1 w-full" />
        </div>

        {/* Right — Quick Controls */}
        <div className="w-[220px] border-l border-[#1f1f1f] flex flex-col p-md gap-md shrink-0">
          {/* Lot Size */}
          <div>
            <label className="font-mono text-[9px] text-white/30 uppercase block mb-xxs">LOT SIZE</label>
            <div className="flex items-center border border-[#2a2a2a] rounded-sm overflow-hidden">
              <button onClick={() => setLots(Math.max(0.01, parseFloat((lots - 0.01).toFixed(2))))} className="px-xs py-xxs bg-[#1a1a1a] text-white/60 hover:text-white border-r border-[#2a2a2a]">−</button>
              <input type="number" value={lots} step={0.01} min={0.01} onChange={e => setLots(parseFloat(e.target.value))}
                className="flex-1 bg-transparent text-center font-mono text-body-sm text-white focus:outline-none py-xxs" />
              <button onClick={() => setLots(parseFloat((lots + 0.01).toFixed(2)))} className="px-xs py-xxs bg-[#1a1a1a] text-white/60 hover:text-white border-l border-[#2a2a2a]">+</button>
            </div>
          </div>

          {/* SL / TP */}
          <div className="grid grid-cols-2 gap-xs">
            <div>
              <label className="font-mono text-[9px] text-white/30 uppercase block mb-xxs">SL (pips)</label>
              <input type="number" value={slPips} onChange={e => setSlPips(parseInt(e.target.value))}
                className="w-full bg-[#111] border border-[#2a2a2a] rounded-xs px-xs py-xxs font-mono text-body-sm text-white focus:outline-none" />
            </div>
            <div>
              <label className="font-mono text-[9px] text-white/30 uppercase block mb-xxs">TP (pips)</label>
              <input type="number" value={tpPips} onChange={e => setTpPips(parseInt(e.target.value))}
                className="w-full bg-[#111] border border-[#2a2a2a] rounded-xs px-xs py-xxs font-mono text-body-sm text-white focus:outline-none" />
            </div>
          </div>

          {/* BUY / SELL Buttons */}
          <button
            onClick={handleBuy}
            disabled={buyLoading || sellLoading}
            className={`w-full font-sans text-button-lg font-bold py-md rounded-sm active:scale-[0.98] transition-all flex items-center justify-center gap-xs ${
              !isBridgeConnected
                ? 'bg-[#0070f3]/40 text-white/40 cursor-not-allowed'
                : 'bg-[#0070f3] text-white hover:bg-[#0761d1] disabled:opacity-60 disabled:cursor-not-allowed'
            }`}
            title={!isBridgeConnected ? 'Bridge disconnected — connect MT5 first' : 'Open BUY position'}
          >
            {buyLoading
              ? <><Loader2 className="w-xs h-xs animate-spin" /> Sending...</>
              : <><ArrowUp className="w-sm h-sm" /> BUY MARKET</>
            }
          </button>
          <button
            onClick={handleSell}
            disabled={buyLoading || sellLoading}
            className={`w-full font-sans text-button-lg font-bold py-md rounded-sm active:scale-[0.98] transition-all flex items-center justify-center gap-xs ${
              !isBridgeConnected
                ? 'bg-[#ee0000]/40 text-white/40 cursor-not-allowed'
                : 'bg-[#ee0000] text-white hover:bg-[#c50000] disabled:opacity-60 disabled:cursor-not-allowed'
            }`}
            title={!isBridgeConnected ? 'Bridge disconnected — connect MT5 first' : 'Open SELL position'}
          >
            {sellLoading
              ? <><Loader2 className="w-xs h-xs animate-spin" /> Sending...</>
              : <><ArrowDown className="w-sm h-sm" /> SELL MARKET</>
            }
          </button>

          {/* AI Auto Toggle */}
          <div className="flex items-center justify-between border border-[#2a2a2a] rounded-sm px-sm py-xs">
            <div>
              <span className="font-mono text-[9px] text-white/40 uppercase block">AI AUTO</span>
              <span className="font-sans text-caption text-white/60">{aiAuto ? 'Engine Active' : 'Manual Mode'}</span>
            </div>
            <button onClick={() => setAiAuto(!aiAuto)}
              className={`w-[40px] h-[22px] rounded-full relative transition-colors ${aiAuto ? 'bg-[#0070f3]' : 'bg-[#2a2a2a]'}`}>
              <span className={`absolute top-[3px] w-[16px] h-[16px] rounded-full bg-white transition-all ${aiAuto ? 'left-[21px]' : 'left-[3px]'}`} />
            </button>
          </div>

          {/* Close All */}
          {!confirmCloseAll ? (
            <button onClick={() => setConfirmCloseAll(true)}
              className="w-full border border-[#ee0000]/40 text-[#ee0000] font-sans text-body-sm font-semibold py-xs rounded-sm hover:bg-[#ee0000]/10 transition-colors flex items-center justify-center gap-xs">
              <AlertTriangle className="w-xs h-xs" /> Close All Positions
            </button>
          ) : (
            <div className="border border-[#ee0000] rounded-sm p-xs text-center space-y-xs">
              <p className="font-sans text-caption text-white/70">Confirm close all?</p>
              <div className="flex gap-xs">
                <button onClick={() => setConfirmCloseAll(false)} className="flex-1 border border-[#2a2a2a] text-white/50 text-caption py-xxs rounded-xs">No</button>
                <button onClick={handleCloseAll} className="flex-1 bg-[#ee0000] text-white text-caption py-xxs rounded-xs">Yes, Close</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom — Open Scalp Trades */}
      <div className="h-[60px] border-t border-[#1f1f1f] flex items-center px-lg gap-md overflow-x-auto shrink-0">
        <span className="font-mono text-[9px] text-white/30 uppercase shrink-0">OPEN SCALPS</span>
        {positions.length === 0 ? (
          <span className="font-mono text-caption-mono text-white/20">No active positions</span>
        ) : (
          positions.map(pos => (
            <div key={pos.ticket} className="flex items-center gap-sm border border-[#2a2a2a] rounded-sm px-sm py-xxs shrink-0 bg-[#111]">
              <span className={`font-mono text-[9px] font-bold ${pos.type === 'BUY' ? 'text-[#0070f3]' : 'text-[#ee0000]'}`}>{pos.type}</span>
              <span className="font-mono text-caption-mono text-white/60">{pos.symbol} {pos.volume}L</span>
              <span className={`font-mono text-caption-mono font-bold ${pos.profit >= 0 ? 'text-[#50e3c2]' : 'text-[#ee0000]'}`}>
                {pos.profit >= 0 ? '+' : ''}${pos.profit.toFixed(2)}
              </span>
              <button onClick={() => closeTrade(pos.ticket)} className="text-white/20 hover:text-[#ee0000] transition-colors">
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
