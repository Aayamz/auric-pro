import { NextResponse } from 'next/server'

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ pair: string }> }
) {
  const { pair: rawPair } = await params
  const pair = rawPair || 'XAUUSD'

  try {
    const res = await fetch(`${PYTHON_API_URL}/price/${pair}`, { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      if (data && data.bid) {
        const bid = Number(data.bid)
        const ask = Number(data.ask)
        const spread = Number((ask - bid).toFixed(5))
        return NextResponse.json({
          pair,
          bid,
          ask,
          spread,
          time: Date.now()
        })
      }
    }
  } catch {
    // Suppress and fallback
  }

  // Fallback values if bridge/FastAPI is offline
  const basePrice = 1950.0 + (Math.random() - 0.5) * 5
  const bid = Number(basePrice.toFixed(2))
  const ask = Number((basePrice + 0.35).toFixed(2))
  const spread = Number((ask - bid).toFixed(2))

  return NextResponse.json({
    pair,
    bid,
    ask,
    spread,
    time: Date.now()
  })
}
