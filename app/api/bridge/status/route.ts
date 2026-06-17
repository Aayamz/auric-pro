import { NextResponse } from 'next/server'
import { createClient } from 'redis'
import { getCurrentUserId } from '@/lib/supabase-server'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000'

export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const client = createClient({ url: REDIS_URL })
    await client.connect()
    
    // Check if bridge connection status exists in Redis
    const status = await client.get(`bridge:status:${userId}`)
    await client.disconnect()

    if (status) {
      const data = JSON.parse(status)
      return NextResponse.json({
        connected: true,
        last_seen: data.last_seen || new Date().toISOString(),
        balance: data.balance || 10000.00,
        equity: data.equity || 10005.50
      })
    }
  } catch {
    // Redis is offline, fallback: fetch live status directly from FastAPI backend
    try {
      const res = await fetch(`${PYTHON_API_URL}/bridge/status/${userId}`)
      if (res.ok) {
        const data = await res.json()
        return NextResponse.json({
          connected: data.connected,
          last_seen: data.last_seen || new Date().toISOString(),
          balance: data.balance ?? 10000.00,
          equity: data.equity ?? 10000.00
        })
      }
    } catch {
      // Both Redis and FastAPI offline
    }
  }

  // Fallback response: not connected
  return NextResponse.json({
    connected: false,
    last_seen: new Date().toISOString(),
    balance: 0.00,
    equity: 0.00
  })
}
