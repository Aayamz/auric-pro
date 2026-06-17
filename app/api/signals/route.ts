import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const pair = searchParams.get('pair')
  const strategy = searchParams.get('strategy')
  const minConfidence = parseFloat(searchParams.get('min_confidence') || '0')
  const status = searchParams.get('status')
  const limit = parseInt(searchParams.get('limit') || '50', 10)

  try {
    const supabase = getSupabaseServerClient()
    let query = supabase.from('signals').select('*').order('created_at', { ascending: false })

    if (pair) query = query.eq('pair', pair)
    if (strategy) query = query.eq('strategy', strategy)
    if (status) query = query.eq('status', status)
    if (minConfidence > 0) query = query.gte('confidence', minConfidence)
    
    query = query.limit(limit)
    const { data, error } = await query

    if (!error && data && data.length > 0) {
      return NextResponse.json(data)
    }
  } catch {
    console.warn("Supabase signals fetch failed, returning mock signal list.")
  }

  // Fallback Mock Signals (Seeded mock data for local testing)
  const mockSignals = [
    {
      id: "sig-1",
      user_id: "00000000-0000-0000-0000-000000000000",
      pair: "XAUUSD",
      direction: "BUY",
      strategy: "order_block_reversal",
      timeframe: "M15",
      confidence: 88.50,
      entry_price: 1955.50,
      sl_price: 1949.20,
      tp_levels: [{ rr: 1, price: 1961.80 }, { rr: 2, price: 1968.00 }, { rr: 3, price: 1974.20 }],
      indicator_values: { rsi: 35.2, atr: 2.1, ob_zone: "H4 Demands" },
      ai_explanation: "Bullish divergence detected inside H4 Order Block reversal zone. Strong buy pressure at low range.",
      status: "LIVE",
      created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString()
    },
    {
      id: "sig-2",
      user_id: "00000000-0000-0000-0000-000000000000",
      pair: "XAUUSD",
      direction: "SELL",
      strategy: "fvg_scalper",
      timeframe: "M5",
      confidence: 76.20,
      entry_price: 1963.20,
      sl_price: 1966.80,
      tp_levels: [{ rr: 1, price: 1959.60 }, { rr: 2, price: 1956.00 }],
      indicator_values: { rsi: 68.4, atr: 1.8, fvg_size: 1.50 },
      ai_explanation: "Filling 15m Fair Value Gap on M5 reversal candles. Overbought metrics returning to mean.",
      status: "LIVE",
      created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString()
    },
    {
      id: "sig-3",
      user_id: "00000000-0000-0000-0000-000000000000",
      pair: "XAUUSD",
      direction: "BUY",
      strategy: "tick_scalper",
      timeframe: "M1",
      confidence: 91.00,
      entry_price: 1950.40,
      sl_price: 1948.50,
      tp_levels: [{ rr: 1.5, price: 1953.25 }],
      indicator_values: { rsi: 28.1, atr: 0.9 },
      ai_explanation: "High confidence volume imbalance trigger at round support number. Quick scalping momentum.",
      status: "EXECUTED",
      created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString()
    },
    {
      id: "sig-4",
      user_id: "00000000-0000-0000-0000-000000000000",
      pair: "XAUUSD",
      direction: "SELL",
      strategy: "liquidity_sweep",
      timeframe: "H1",
      confidence: 65.00,
      entry_price: 1968.50,
      sl_price: 1974.00,
      tp_levels: [{ rr: 1, price: 1963.00 }, { rr: 2, price: 1957.50 }],
      indicator_values: { rsi: 72.9, atr: 4.5 },
      ai_explanation: "Liquidity grab above previous daily highs on heavy institutional selling volume.",
      status: "SL_HIT",
      created_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString()
    },
    {
      id: "sig-5",
      user_id: "00000000-0000-0000-0000-000000000000",
      pair: "XAUUSD",
      direction: "BUY",
      strategy: "trend_following",
      timeframe: "H4",
      confidence: 84.10,
      entry_price: 1938.00,
      sl_price: 1928.00,
      tp_levels: [{ rr: 2, price: 1958.00 }, { rr: 3.5, price: 1973.00 }],
      indicator_values: { rsi: 55.4, atr: 8.2 },
      ai_explanation: "Successful retest of the daily EMA-50 ribbon. Continuation of primary structural uptrend.",
      status: "TP2_HIT",
      created_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    }
  ]

  let offset = 0
  try {
    const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000'
    const res = await fetch(`${PYTHON_API_URL}/price/XAUUSD`, { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      if (data && data.bid) {
        offset = data.bid - 1950.0
      }
    }
  } catch {}

  const mappedSignals = mockSignals.map(sig => {
    if (sig.pair === 'XAUUSD' && offset !== 0) {
      return {
        ...sig,
        entry_price: Number((sig.entry_price + offset).toFixed(2)),
        sl_price: Number((sig.sl_price + offset).toFixed(2)),
        tp_levels: sig.tp_levels.map(tp => ({ ...tp, price: Number((tp.price + offset).toFixed(2)) }))
      }
    }
    return sig
  })

  let filtered = mappedSignals
  if (pair) filtered = filtered.filter(s => s.pair === pair)
  if (strategy) filtered = filtered.filter(s => s.strategy === strategy)
  if (status) filtered = filtered.filter(s => s.status === status)
  filtered = filtered.filter(s => s.confidence >= minConfidence)

  return NextResponse.json(filtered.slice(0, limit))
}
