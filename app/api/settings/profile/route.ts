import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient, getCurrentUserId } from '@/lib/supabase-server'

export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseServerClient()
    const { data } = await supabase.from('user_settings').select('*').eq('user_id', userId).single()
    return NextResponse.json({
      display_name: data?.display_name ?? '',
      timezone: data?.timezone ?? 'UTC'
    })
  } catch {
    return NextResponse.json({ display_name: '', timezone: 'UTC' })
  }
}

export async function PUT(req: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { display_name, timezone } = await req.json()

  try {
    const supabase = getSupabaseServerClient()
    await supabase.from('user_settings').upsert({
      user_id: userId, display_name, timezone, updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })
  } catch {
    // Silently succeed for dev fallback
  }

  return NextResponse.json({ success: true })
}
