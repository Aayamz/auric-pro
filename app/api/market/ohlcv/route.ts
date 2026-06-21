import { NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/supabase-server'

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://127.0.0.1:8000'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const pair = searchParams.get('pair') || 'XAUUSD'
  const tf = searchParams.get('tf') || 'M15'
  const barsStr = searchParams.get('bars') || '200'
  const bars = parseInt(barsStr, 10) || 200

  const sessionUserId = await getCurrentUserId()
  const user_id = searchParams.get('user_id') || sessionUserId || ''

  try {
    const res = await fetch(`${PYTHON_API_URL}/ohlcv?pair=${pair}&tf=${tf}&bars=${bars}&user_id=${user_id}`, {
      next: { revalidate: 10 } // Cache for 10s
    })
    
    if (!res.ok) {
      throw new Error(`FastAPI backend responded with status ${res.status}`)
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    // Generate mock data fallback when Python API is unreachable (e.g. serverless Vercel deploy)
    console.warn(`[OHLCV API] Backend unreachable at ${PYTHON_API_URL}. Returning mock fallback data.`)
    
    const data = []
    const now = Math.floor(Date.now() / 1000)
    let tfSeconds = 900 // 15m
    if (tf === 'M1') tfSeconds = 60
    else if (tf === 'M5') tfSeconds = 300
    else if (tf === 'H1') tfSeconds = 3600
    else if (tf === 'H4') tfSeconds = 14400
    else if (tf === 'D1') tfSeconds = 86400

    let basePrice = 1950.00
    if (pair.includes('EURUSD')) basePrice = 1.0850
    else if (pair.includes('GBPUSD')) basePrice = 1.2650
    else if (pair.includes('USDJPY')) basePrice = 151.50

    let currentPrice = basePrice
    for (let i = bars - 1; i >= 0; i--) {
      const time = now - i * tfSeconds
      const close = currentPrice
      const change = (Math.random() - 0.5) * (basePrice * 0.003)
      const open = close - change
      const high = Math.max(open, close) + Math.random() * (basePrice * 0.001)
      const low = Math.min(open, close) - Math.random() * (basePrice * 0.001)
      const volume = Math.floor(Math.random() * 5000) + 100

      data.push({
        time,
        open: Number(open.toFixed(pair.includes('JPY') || pair.includes('XAU') ? 2 : 5)),
        high: Number(high.toFixed(pair.includes('JPY') || pair.includes('XAU') ? 2 : 5)),
        low: Number(low.toFixed(pair.includes('JPY') || pair.includes('XAU') ? 2 : 5)),
        close: Number(close.toFixed(pair.includes('JPY') || pair.includes('XAU') ? 2 : 5)),
        volume
      })
      currentPrice = open
    }

    return NextResponse.json(data)
  }
}
