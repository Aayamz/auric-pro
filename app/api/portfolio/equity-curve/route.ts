import { NextResponse } from 'next/server'
import { getSupabaseServerClient, getCurrentUserId } from '@/lib/supabase-server'
import { createClient } from 'redis'

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379'

async function getLiveBalance(userId: string): Promise<number> {
  try {
    const client = createClient({
      url: REDIS_URL,
      socket: { connectTimeout: 2000, reconnectStrategy: false }
    })
    client.on('error', () => {})
    await client.connect()
    const status = await client.get(`bridge:status:${userId}`)
    await client.disconnect()
    if (status) {
      const data = JSON.parse(status)
      if (data.balance && data.balance > 0) return data.balance
    }
  } catch {}
  return 10000
}

export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseServerClient()
    const { data: trades } = await supabase
      .from('trades')
      .select('opened_at, pnl_usd')
      .eq('user_id', userId)
      .eq('status', 'closed')
      .order('opened_at', { ascending: true })

    const initialBalance = await getLiveBalance(userId)
    let running = initialBalance
    const curve = (trades ?? []).map(t => {
      running += t.pnl_usd ?? 0
      return { ts: t.opened_at, equity: parseFloat(running.toFixed(2)) }
    })

    // Always include starting point with the real balance
    if (curve.length === 0) {
      return NextResponse.json([{ ts: new Date().toISOString(), equity: initialBalance }])
    }

    // Prepend the initial balance as the first point
    curve.unshift({ ts: curve[0].ts, equity: initialBalance })

    return NextResponse.json(curve)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Database connection error' }, { status: 500 })
  }
}
