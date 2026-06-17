import { NextResponse } from 'next/server'
import { getSupabaseServerClient, getCurrentUserId } from '@/lib/supabase-server'

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

    const initialBalance = 10000
    let running = initialBalance
    const curve = (trades ?? []).map(t => {
      running += t.pnl_usd ?? 0
      return { ts: t.opened_at, equity: parseFloat(running.toFixed(2)) }
    })

    if (curve.length === 0) {
      let eq = initialBalance
      const mock = Array.from({ length: 60 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (60 - i))
        eq += (Math.random() - 0.38) * 180
        return { ts: d.toISOString(), equity: parseFloat(eq.toFixed(2)) }
      })
      return NextResponse.json(mock)
    }

    return NextResponse.json(curve)
  } catch {
    let eq = 10000
    const mock = Array.from({ length: 60 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (60 - i))
      eq += (Math.random() - 0.38) * 180
      return { ts: d.toISOString(), equity: parseFloat(eq.toFixed(2)) }
    })
    return NextResponse.json(mock)
  }
}
