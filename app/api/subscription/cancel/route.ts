import { NextResponse } from 'next/server'
import { getSupabaseServerClient, getCurrentUserId } from '@/lib/supabase-server'

export async function POST() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseServerClient()
    const { data: subData } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('user_id', userId)
      .single()

    const subId = subData?.stripe_subscription_id

    if (!subId) {
      return NextResponse.json({ error: 'No active subscription found' }, { status: 404 })
    }

    const keyId = process.env.RAZORPAY_KEY_ID || ''
    const keySecret = process.env.RAZORPAY_KEY_SECRET || ''

    // If it's a mock subscription or credentials are not defined
    if (subId.startsWith('sub_mock_') || !keyId || !keySecret) {
      console.log("Cancelling mock subscription:", subId)
      await supabase
        .from('subscriptions')
        .update({
          plan: 'free',
          status: 'canceled',
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)

      return NextResponse.json({ success: true })
    }

    // Call Razorpay API to cancel subscription immediately
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64')
    const response = await fetch(`https://api.razorpay.com/v1/subscriptions/${subId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify({
        cancel_at_cycle_end: 0 // Immediate cancel
      })
    })

    const data = await response.json()
    if (!response.ok) {
      // If subscription was already cancelled on Razorpay, clean up locally anyway
      if (response.status === 400 && data.error?.description?.includes('cancelled')) {
        await supabase
          .from('subscriptions')
          .update({
            plan: 'free',
            status: 'canceled',
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
        return NextResponse.json({ success: true, warning: 'Already cancelled on Razorpay' })
      }
      return NextResponse.json({ error: data.error?.description || 'Razorpay subscription cancellation failed' }, { status: response.status })
    }

    // Update locally
    await supabase
      .from('subscriptions')
      .update({
        plan: 'free',
        status: 'canceled',
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown cancellation error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
