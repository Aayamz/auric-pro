import { NextResponse } from 'next/server'
import { getSupabaseServerClient, getCurrentUserId } from '@/lib/supabase-server'

export async function GET(request: Request) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const pair = searchParams.get('pair')
  const strategy = searchParams.get('strategy')
  const minConfidence = parseFloat(searchParams.get('min_confidence') || '0')
  const status = searchParams.get('status')
  const limit = parseInt(searchParams.get('limit') || '50', 10)

  try {
    const supabase = getSupabaseServerClient()
    let query = supabase
      .from('signals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (pair) query = query.eq('pair', pair)
    if (strategy) query = query.eq('strategy', strategy)
    if (status) query = query.eq('status', status)
    if (minConfidence > 0) query = query.gte('confidence', minConfidence)
    
    query = query.limit(limit)
    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Database connection error' }, { status: 500 })
  }
}

/**
 * POST /api/signals
 * Proxies signal generation request to the Python backend to generate a new signal.
 */
export async function POST(request: Request) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const pair = body.pair || 'XAUUSD'
    const tf = body.tf || 'M15'
    const strategyName = body.strategy_name || 'ema_crossover'

    const pythonApiUrl = process.env.PYTHON_API_URL || 'http://127.0.0.1:8000'
    const response = await fetch(
      `${pythonApiUrl}/signal/generate?pair=${pair}&tf=${tf}&strategy_name=${strategyName}&user_id=${userId}`,
      { method: 'POST' }
    )

    if (!response.ok) {
      const errText = await response.text()
      return NextResponse.json({ error: `Backend returned error: ${errText}` }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Signal generation failed' }, { status: 500 })
  }
}

