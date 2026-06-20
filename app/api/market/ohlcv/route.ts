import { NextResponse } from 'next/server'

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://127.0.0.1:8000'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const pair = searchParams.get('pair') || 'XAUUSD'
  const tf = searchParams.get('tf') || 'M15'
  const bars = searchParams.get('bars') || '200'

  try {
    const res = await fetch(`${PYTHON_API_URL}/ohlcv?pair=${pair}&tf=${tf}&bars=${bars}`, {
      next: { revalidate: 10 } // Cache for 10s
    })
    
    if (!res.ok) {
      throw new Error(`FastAPI backend responded with status ${res.status}`)
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'FastAPI execution engine is offline' }, { status: 502 })
  }
}
