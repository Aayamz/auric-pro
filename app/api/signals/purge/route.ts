import { NextResponse } from 'next/server'
import { getSupabaseServerClient, getCurrentUserId } from '@/lib/supabase-server'

/**
 * DELETE /api/signals/purge
 * Removes signals older than 24 hours for the current user.
 */
export async function DELETE() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseServerClient()
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { error, count } = await supabase
      .from('signals')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .lt('created_at', cutoff)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, deleted: count ?? 0 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Purge failed' }, { status: 500 })
  }
}
