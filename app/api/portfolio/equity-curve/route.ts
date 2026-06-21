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

    const closedTrades = trades ?? []
    const currentBalance = await getLiveBalance(userId)

    // The current balance already reflects all closed trade P&L.
    // Reconstruct history: starting balance = current balance - total closed P&L
    const totalClosedPnl = closedTrades.reduce((s, t) => s + (t.pnl_usd ?? 0), 0)
    const startingBalance = parseFloat((currentBalance - totalClosedPnl).toFixed(2))

    if (closedTrades.length === 0) {
      return NextResponse.json([{ ts: new Date().toISOString(), equity: currentBalance }])
    }

    // Walk forward through closed trades from the true starting balance
    let running = startingBalance
    const curve = closedTrades.map(t => {
      running = parseFloat((running + (t.pnl_usd ?? 0)).toFixed(2))
      return { ts: t.opened_at, equity: running }
    })

    // Prepend starting point and append current live balance as the final point
    curve.unshift({ ts: closedTrades[0].opened_at, equity: startingBalance })
    curve.push({ ts: new Date().toISOString(), equity: currentBalance })

    return NextResponse.json(curve)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Database connection error' }, { status: 500 })
  }
}
