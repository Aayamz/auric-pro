import { NextResponse } from 'next/server'

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://127.0.0.1:8000'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ pair: string }> }
) {
  const { pair: rawPair } = await params
  const pair = rawPair || 'XAUUSD'

  try {
    const res = await fetch(`${PYTHON_API_URL}/price/${pair}`, { cache: 'no-store' })
    if (!res.ok) {
      throw new Error(`FastAPI price endpoint returned status ${res.status}`)
    }
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
    throw new Error('Invalid or incomplete price data received from FastAPI backend')
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'FastAPI execution engine is offline' }, { status: 502 })
  }
}
