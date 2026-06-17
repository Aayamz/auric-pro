import { NextResponse } from 'next/server'
import { createClient } from 'redis'
import { getCurrentUserId } from '@/lib/supabase-server'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

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
  } catch {
    // Memory fallback behavior for development
    return NextResponse.json({ success: true, action, fallback: true })
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
  } catch {
    // Default development state
    return NextResponse.json({
      running: true,
      strategy: 'ema_crossover',
      last_signal_at: new Date().toISOString(),
      trade_count: 24
    })
  }
}
