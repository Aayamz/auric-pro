import { NextResponse } from 'next/server'
import { getSupabaseServerClient, getCurrentUserId } from '@/lib/supabase-server'

// Closed statuses as written by both the old bridge and the new MT5 Python bridge
const CLOSED_STATUSES = ['closed', 'CLOSED', 'completed', 'COMPLETED', 'SL_HIT', 'TP1_HIT', 'TP2_HIT', 'TP3_HIT']

export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseServerClient()
    const { data: trades } = await supabase
      .from('trades')
      .select('pnl_usd, pnl_r, opened_at')
      .eq('user_id', userId)
      .in('status', CLOSED_STATUSES)

    if (!trades || trades.length === 0) {
      return NextResponse.json({
        total_pnl: 0, win_rate: 0, avg_rr: 0, total_trades: 0, best_day: 0
      })
    }

    const total_pnl = trades.reduce((s, t) => s + (t.pnl_usd ?? 0), 0)
    const wins = trades.filter(t => (t.pnl_usd ?? 0) > 0)
    const win_rate = (wins.length / trades.length) * 100
    const avg_rr = trades.reduce((s, t) => s + (t.pnl_r ?? 0), 0) / trades.length

    const byDay: Record<string, number> = {}
    trades.forEach(t => {
      const d = t.opened_at?.split('T')[0] ?? 'unknown'
      byDay[d] = (byDay[d] ?? 0) + (t.pnl_usd ?? 0)
    })
    const best_day = Math.max(...Object.values(byDay), 0)

    return NextResponse.json({ total_pnl, win_rate, avg_rr, total_trades: trades.length, best_day })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Database connection error' }, { status: 500 })
  }
}
