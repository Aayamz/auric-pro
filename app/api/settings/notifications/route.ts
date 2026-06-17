import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient, getCurrentUserId } from '@/lib/supabase-server'

const defaultNotifs = {
  signal_generated: true,
  trade_executed: true,
  daily_pnl: true,
  halt_triggered: true,
  ai_insights: false
}

export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseServerClient()
    const { data } = await supabase.from('notification_preferences').select('events').eq('user_id', userId).single()
    return NextResponse.json(data?.events ?? defaultNotifs)
  } catch {
    return NextResponse.json(defaultNotifs)
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
    await supabase.from('notification_preferences').upsert({
      user_id: userId, events: body, updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })
  } catch {
    // Silently succeed for dev fallback
  }

  return NextResponse.json({ success: true })
}
