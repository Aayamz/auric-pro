import { NextResponse } from 'next/server'
import { createClient } from 'redis'
import { getCurrentUserId } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://127.0.0.1:8000'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> }
) {
  const { action } = await params
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const client = createClient({ url: REDIS_URL })
    await client.connect()
    
    if (action === 'start') {
      await client.set(`bot_running:${userId}`, 'true')
    } else if (action === 'stop') {
      await client.set(`bot_running:${userId}`, 'false')
    } else if (action === 'halt') {
      await client.set(`bot_running:${userId}`, 'false')
      // Publish command to Redis for the bridge to pick up and close positions
      await client.publish(`cmd:${userId}`, JSON.stringify({ type: 'halt_trading' }))
    }
    
    await client.disconnect()
    return NextResponse.json({ success: true, action })
  } catch (err: any) {
    // Fallback to FastAPI backend when Redis is offline
    try {
      const endpoint = action === 'halt' ? 'stop' : action
      const res = await fetch(`${PYTHON_API_URL}/trading/${endpoint}/${userId}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'any-value'
        },
        signal: AbortSignal.timeout(5000)
      })
      if (res.ok) {
        return NextResponse.json({ success: true, action, fallback: true })
      }
      throw new Error(`FastAPI responded with status ${res.status}`)
    } catch (fallbackErr: any) {
      return NextResponse.json({ error: `Redis offline, FastAPI fallback failed: ${fallbackErr.message}` }, { status: 500 })
    }
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ action: string }> }
) {
  const { action } = await params
  if (action !== 'status') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    const client = createClient({ url: REDIS_URL })
    await client.connect()
    const running = (await client.get(`bot_running:${userId}`)) === 'true'
    await client.disconnect()

    return NextResponse.json({
      running,
      strategy: 'ema_crossover',
      last_signal_at: new Date().toISOString(),
      trade_count: 24
    })
  } catch (err: any) {
    // Fallback to FastAPI backend when Redis is offline
    try {
      const res = await fetch(`${PYTHON_API_URL}/trading/status/${userId}`, {
        cache: 'no-store',
        headers: {
          'ngrok-skip-browser-warning': 'any-value'
        },
        signal: AbortSignal.timeout(5000)
      })
      if (res.ok) {
        const data = await res.json()
        return NextResponse.json({
          running: data.running,
          strategy: 'ema_crossover',
          last_signal_at: new Date().toISOString(),
          trade_count: 24,
          fallback: true
        })
      }
      throw new Error(`FastAPI responded with status ${res.status}`)
    } catch (fallbackErr: any) {
      return NextResponse.json({ error: `Redis offline, FastAPI fallback failed: ${fallbackErr.message}` }, { status: 500 })
    }
  }
}
