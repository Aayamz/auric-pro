import { NextResponse } from 'next/server'
import { getSupabaseServerClient, getCurrentUserId } from '@/lib/supabase-server'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name: strategyName } = await params
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const config = await request.json()
    const supabase = getSupabaseServerClient()

    const { data: existing } = await supabase
      .from('user_strategies')
      .select('*')
      .eq('user_id', userId)
      .eq('strategy_name', strategyName)
      .single()

    if (existing) {
      const { error } = await supabase
        .from('user_strategies')
        .update({ config, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('user_strategies')
        .insert({
          user_id: userId,
          strategy_name: strategyName,
          config,
          is_active: false
        })
      if (error) throw error
    }

    return NextResponse.json({ success: true, strategy_name: strategyName, config })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update config'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
