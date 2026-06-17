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

    // If Razorpay keys or plan IDs are not set, fall back to mock sandbox upgrade mode
    if (!keyId || !keySecret || !planId) {
      console.warn("Razorpay environment keys or plan IDs are missing. Falling back to mock subscription.")
      return NextResponse.json({ mock: true })
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

    return NextResponse.json({ subscriptionId: data.id, keyId })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown checkout error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
