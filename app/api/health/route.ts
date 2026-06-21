import { NextResponse } from 'next/server'
import { createClient } from 'redis'
import { getSupabaseServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const status = {
    supabase: { connected: false, message: '' },
    redis: { connected: false, message: '' },
    pythonApi: { connected: false, message: '' },
    razorpay: { configured: false, message: '' },
    ok: true
  }

  // 1. Check Supabase
  try {
    const supabase = getSupabaseServerClient()
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    if (url.includes('placeholder') || !url) {
      status.supabase.message = 'Supabase URL is not configured or is set to a placeholder.'
    } else {
      const { error } = await supabase.from('signals').select('id').limit(1)
      if (error) {
        status.supabase.message = `Database query error: ${error.message}`
      } else {
        status.supabase.connected = true
      }
    }
  } catch (err: any) {
    status.supabase.message = err.message || 'Failed to initialize Supabase client.'
  }

  // 2. Check Redis
  try {
    const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
    const client = createClient({ url: REDIS_URL, socket: { connectTimeout: 2000, reconnectStrategy: false } })
    client.on('error', () => {})
    await client.connect()
    await client.ping()
    await client.disconnect()
    status.redis.connected = true
  } catch (err: any) {
    status.redis.message = err.message || 'Could not establish connection to Redis server.'
  }

  // 3. Check Python Backend API
  try {
    const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://127.0.0.1:8000'
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), 2000)
    const res = await fetch(`${PYTHON_API_URL}/regime`, { signal: controller.signal })
    clearTimeout(id)
    if (res.ok) {
      status.pythonApi.connected = true
    } else {
      status.pythonApi.message = `FastAPI backend returned status code ${res.status}.`
    }
  } catch (err: any) {
    status.pythonApi.message = 'FastAPI server is offline or unreachable on Port 8000.'
  }

  // 4. Check Razorpay configuration keys
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET
  const planPro = process.env.RAZORPAY_PLAN_PRO_ID
  const planElite = process.env.RAZORPAY_PLAN_ELITE_ID

  const missingKeys = []
  if (!keyId || keyId.includes('placeholder')) missingKeys.push('RAZORPAY_KEY_ID')
  if (!keySecret || keySecret.includes('placeholder')) missingKeys.push('RAZORPAY_KEY_SECRET')
  if (!webhookSecret || webhookSecret.includes('placeholder')) missingKeys.push('RAZORPAY_WEBHOOK_SECRET')
  if (!planPro || planPro.includes('placeholder')) missingKeys.push('RAZORPAY_PLAN_PRO_ID')
  if (!planElite || planElite.includes('placeholder')) missingKeys.push('RAZORPAY_PLAN_ELITE_ID')

  if (missingKeys.length === 0) {
    status.razorpay.configured = true
  } else {
    status.razorpay.message = `Missing environment configuration for: ${missingKeys.join(', ')}.`
  }

  // Determine overall status
  // In a Vercel serverless environment, we only require Supabase to be connected to load the dashboard.
  // This prevents blocking the UI when the local PC backend or local cache is unreachable from the cloud.
  const isVercel = process.env.VERCEL === '1'
  if (isVercel) {
    status.ok = status.supabase.connected
  } else {
    status.ok = status.supabase.connected && status.redis.connected && status.pythonApi.connected && status.razorpay.configured
  }

  return NextResponse.json(status, { status: status.ok ? 200 : 503 })
}
