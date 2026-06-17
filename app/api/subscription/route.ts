import { NextResponse } from 'next/server'
import { getSupabaseServerClient, getCurrentUserId } from '@/lib/supabase-server'
import { PLAN_LIMITS } from '@/lib/plan-limits'

export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (!error && data) {
      const plan = (data.plan || 'free') as keyof typeof PLAN_LIMITS
      return NextResponse.json({
        plan,
        status: data.status || 'active',
        current_period_end: data.current_period_end || new Date().toISOString(),
        limits: PLAN_LIMITS[plan]
      })
    }
  } catch {
    console.warn("Failed to fetch subscription from Supabase, returning free tier.")
  }

  // Fallback defaults
  return NextResponse.json({
    plan: 'free',
    status: 'active',
    current_period_end: new Date().toISOString(),
    limits: PLAN_LIMITS['free']
  })
}
