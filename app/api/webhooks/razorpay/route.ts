import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { getSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get('x-razorpay-signature') || ''
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || ''

  // Verify signature if a secret is configured
  if (webhookSecret) {
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex')

    if (expectedSignature !== signature) {
      console.error('Razorpay signature verification failed')
      return new Response('Invalid webhook signature', { status: 400 })
    }
  }

  try {
    const event = JSON.parse(body)
    const eventName = event.event
    const payload = event.payload

    const supabase = getSupabaseServerClient()

    switch (eventName) {
      case 'subscription.charged': {
        const subObj = payload.subscription.entity
        const subscriptionId = subObj.id
        const customerId = subObj.customer_id
        const planId = subObj.plan_id
        const userId = subObj.notes?.userId

        // Map plan_id to local plans
        let plan: 'pro' | 'elite' = 'pro'
        if (planId === process.env.RAZORPAY_PLAN_ELITE_ID) {
          plan = 'elite'
        }

        if (userId) {
          await supabase
            .from('subscriptions')
            .upsert({
              user_id: userId,
              stripe_customer_id: customerId || 'rzp_customer_fallback', // compatibility
              stripe_subscription_id: subscriptionId,
              plan: plan,
              status: 'active',
              current_period_end: new Date(subObj.current_end * 1000).toISOString(),
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' })
          
          console.log(`Webhook: Upgraded user ${userId} to ${plan} subscription ${subscriptionId}`)
        } else {
          console.warn('Webhook: subscription.charged event missing userId in notes')
        }
        break
      }

      case 'subscription.cancelled':
      case 'subscription.halted': {
        const subObj = payload.subscription.entity
        const subscriptionId = subObj.id

        const { data: subData } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', subscriptionId)
          .single()

        if (subData) {
          await supabase
            .from('subscriptions')
            .update({
              plan: 'free',
              status: 'canceled',
              updated_at: new Date().toISOString()
            })
            .eq('user_id', subData.user_id)
          console.log(`Webhook: Downgraded user ${subData.user_id} due to subscription status ${eventName}`)
        } else {
          console.warn(`Webhook: No local record found for subscriptionId ${subscriptionId}`)
        }
        break
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown webhook error'
    console.error('Razorpay Webhook handler error:', message)
    return new Response(`Webhook Integration Error: ${message}`, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
