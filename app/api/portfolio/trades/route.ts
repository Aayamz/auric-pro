import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient, getCurrentUserId } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const pair = searchParams.get('pair')
  const strategy = searchParams.get('strategy')

  try {
    const supabase = getSupabaseServerClient()
    let query = supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .order('opened_at', { ascending: false })
      .limit(200)

    if (pair) query = query.eq('pair', pair)
    if (strategy) query = query.eq('strategy', strategy)

    const { data: trades, count } = await query

    if (!trades || trades.length === 0) {
      return NextResponse.json({ trades: [], total: 0 })
    }

    return NextResponse.json({ trades, total: count ?? trades.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Database connection error' }, { status: 500 })
  }
}
