import { NextResponse } from 'next/server'

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const pair = searchParams.get('pair') || 'XAUUSD'
  const tf = searchParams.get('tf') || 'M15'
  const bars = searchParams.get('bars') || '200'

  try {
    const res = await fetch(`${PYTHON_API_URL}/ohlcv?pair=${pair}&tf=${tf}&bars=${bars}`, {
      next: { revalidate: 10 } // Cache for 10s
    })
    
    if (res.ok) {
      const data = await res.json()
      return NextResponse.json(data)
    }
  } catch {
    console.warn("FastAPI market/ohlcv fetch failed, returning generated mock OHLCV.")
  }

  // Fallback Mock Candlesticks Generator if FastAPI is offline
  const barsCount = parseInt(bars, 10)
  const data = []
  let currentPrice = 1950.0
  const now = Math.floor(Date.now() / 1000)
  let timeframeSec = 15 * 60
  if (tf === 'M1') timeframeSec = 60
  if (tf === 'M5') timeframeSec = 5 * 60
  if (tf === 'H1') timeframeSec = 3600
  if (tf === 'H4') timeframeSec = 4 * 3600

  for (let i = barsCount - 1; i >= 0; i--) {
    const time = now - (barsCount - 1 - i) * timeframeSec
    const close = currentPrice
    const open = close - (Math.random() - 0.5) * 4
    const high = Math.max(open, close) + Math.random() * 2
    const low = Math.min(open, close) - Math.random() * 2
    data.push({
      time,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: Math.floor(Math.random() * 1000) + 100
    })
    currentPrice = open
  }

  data.reverse()

  return NextResponse.json(data)
}
