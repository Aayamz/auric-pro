import { NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/supabase-server'
import { getPythonApiUrl } from '@/lib/api-helper-server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ pair: string }> }
) {
  const { pair: rawPair } = await params
  const pair = rawPair || 'XAUUSD'

  try {
    const userId = await getCurrentUserId()
    const pythonApiUrl = await getPythonApiUrl(userId || undefined)
    const res = await fetch(`${pythonApiUrl}/price/${pair}`, {
      cache: 'no-store',
      headers: {
        'ngrok-skip-browser-warning': 'any-value'
      }
    })
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
    // Generate mock price fallback when Python backend is offline/unreachable (e.g. serverless Vercel deploy)
    let bid = 1950.00
    let ask = 1950.50
    if (pair.includes('EURUSD')) { bid = 1.0850; ask = 1.0855 }
    else if (pair.includes('GBPUSD')) { bid = 1.2650; ask = 1.2655 }
    else if (pair.includes('USDJPY')) { bid = 151.50; ask = 151.55 }

    return NextResponse.json({
      pair,
      bid,
      ask,
      spread: Number((ask - bid).toFixed(5)),
      time: Date.now()
    })
  }
}
