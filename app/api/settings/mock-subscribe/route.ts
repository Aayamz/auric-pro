import { NextResponse } from 'next/server'
import { getSupabaseServerClient, getCurrentUserId } from '@/lib/supabase-server'

export async function POST(request: Request) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { plan } = await request.json()
    if (plan !== 'free' && plan !== 'pro' && plan !== 'elite') {
      return NextResponse.json({ error: 'Invalid plan selected' }, { status: 400 })
    }

    const supabase = getSupabaseServerClient()
    const mockSubId = `sub_mock_${Math.random().toString(36).substring(2, 15)}`
    
    await supabase
      .from('subscriptions')
      .upsert({
        user_id: userId,
        stripe_customer_id: 'cus_mock_client',
        stripe_subscription_id: mockSubId,
        plan: plan,
        status: 'active',
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })

    return NextResponse.json({ success: true, plan, subscriptionId: mockSubId })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown mock-subscribe error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
