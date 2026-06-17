import { NextResponse } from 'next/server'
import { getSupabaseServerClient, getCurrentUserId } from '@/lib/supabase-server'

export async function PUT(request: Request) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { strategy_name } = await request.json()

    const supabase = getSupabaseServerClient()
    
    // Deactivate all strategies for this user
    await supabase
      .from('user_strategies')
      .update({ is_active: false })
      .eq('user_id', userId)

    // Check if the strategy record already exists
    const { data: existing } = await supabase
      .from('user_strategies')
      .select('*')
      .eq('user_id', userId)
      .eq('strategy_name', strategy_name)
      .single()

    if (existing) {
      await supabase
        .from('user_strategies')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      // Create a default config block
      const defaultConfig = {
        htf: "H4",
        ltf: "M15",
        swing_length: 20,
        ob_enabled: true,
        fvg_enabled: true,
        liquidity_enabled: true,
        sessions: ["London", "New York"],
        min_rr: 1.5,
        trailing_start_rr: 1.0,
        break_even_after_rr: 0.8,
        tp_levels: [{ rr: 1, close_pct: 30 }, { rr: 2, close_pct: 30 }, { rr: 3, close_pct: 40 }]
      }
      await supabase
        .from('user_strategies')
        .insert({
          user_id: userId,
          strategy_name,
          config: defaultConfig,
          is_active: true
        })
    }

    return NextResponse.json({ success: true, active_strategy: strategy_name })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
