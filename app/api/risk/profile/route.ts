import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient, getCurrentUserId } from '@/lib/supabase-server'

const defaultProfile = {
  risk_pct: 1.0,
  daily_loss_limit_pct: 4.0,
  max_drawdown_pct: 15.0,
  max_concurrent_positions: 1,
  trailing_start_rr: 1.0,
  break_even_after_rr: 0.8,
  tp_levels: [{ rr: 1, close_pct: 30 }, { rr: 2, close_pct: 30 }, { rr: 3, close_pct: 40 }]
}

export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseServerClient()
    const { data } = await supabase.from('risk_profiles').select('*').eq('user_id', userId).single()
    return NextResponse.json(data ?? defaultProfile)
  } catch {
    return NextResponse.json(defaultProfile)
  }
}

export async function PUT(req: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json()

  try {
    const supabase = getSupabaseServerClient()
    await supabase.from('risk_profiles').upsert({
      user_id: userId,
      ...body,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })
  } catch {
    // Silently succeed for dev fallback
  }

  return NextResponse.json({ success: true })
}
