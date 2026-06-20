import { NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/supabase-server'

export async function POST(request: Request) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { plan } = await request.json()
    if (plan !== 'pro' && plan !== 'elite') {
      return NextResponse.json({ error: 'Invalid plan selected' }, { status: 400 })
    }

    const keyId = process.env.RAZORPAY_KEY_ID || ''
    const keySecret = process.env.RAZORPAY_KEY_SECRET || ''
    const planId = plan === 'pro' 
      ? process.env.RAZORPAY_PLAN_PRO_ID 
      : process.env.RAZORPAY_PLAN_ELITE_ID

    console.log(`[Checkout API] Selecting plan: '${plan}' -> resolved planId: '${planId}' (PRO ID: '${process.env.RAZORPAY_PLAN_PRO_ID}', ELITE ID: '${process.env.RAZORPAY_PLAN_ELITE_ID}')`)

    // Ensure Razorpay keys and plan IDs are set and not placeholders
    if (!keyId || !keySecret || !planId || keyId.includes('placeholder') || keySecret.includes('placeholder')) {
      return NextResponse.json({ error: 'Razorpay payment gateway credentials are not configured or are set as placeholder templates.' }, { status: 400 })
    }

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64')
    const response = await fetch('https://api.razorpay.com/v1/subscriptions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify({
        plan_id: planId,
        total_count: 120, // 10 years recurring
        quantity: 1,
        customer_notify: 1,
        notes: {
          userId: userId
        }
      })
    })

    const data = await response.json()
    if (!response.ok) {
      return NextResponse.json({ error: data.error?.description || 'Razorpay subscription creation failed' }, { status: response.status })
    }

    return NextResponse.json({ subscriptionId: data.id, keyId, plan, planId })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown checkout error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
