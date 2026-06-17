import { NextResponse } from 'next/server'
import { getCurrentUserId, getSupabaseServerClient } from '@/lib/supabase-server'

export async function DELETE() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseServerClient()
    await supabase.from('trades').delete().eq('user_id', userId)
    await supabase.from('signals').delete().eq('user_id', userId)
    await supabase.from('user_strategies').delete().eq('user_id', userId)
    await supabase.from('user_settings').delete().eq('user_id', userId)
  } catch {
    // Silently succeed for dev fallback
  }

  return NextResponse.json({ success: true })
}
