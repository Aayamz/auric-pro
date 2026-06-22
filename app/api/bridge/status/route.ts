import { NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379'
const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://127.0.0.1:8000'

// If the bridge last_seen timestamp is older than this, consider it disconnected
const BRIDGE_STALE_THRESHOLD_MS = 12000 // 12 seconds (bridge updates every 2s when alive)

export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Try Redis first — but validate that the data is fresh, not stale
  try {
    const { createClient } = await import('redis')
    const client = createClient({
      url: REDIS_URL,
      socket: { connectTimeout: 2000, reconnectStrategy: false }
    })
    client.on('error', () => {})
    await client.connect()

    const status = await client.get(`bridge:status:${userId}`)
    await client.disconnect()

    if (status) {
      const data = JSON.parse(status)
      const lastSeen = data.last_seen ? new Date(data.last_seen).getTime() : 0
      const ageMs = Date.now() - lastSeen

      // If the bridge status is stale (older than threshold), treat as disconnected
      // This prevents the UI from showing "connected" after MT5 is closed
      if (ageMs < BRIDGE_STALE_THRESHOLD_MS) {
        return NextResponse.json({
          connected: true,
          last_seen: data.last_seen || new Date().toISOString(),
          balance: data.balance || 0,
          equity: data.equity || 0,
          login: data.login ?? null,
          server: data.server ?? null,
          mock: data.mock ?? false
        })
      } else {
        // Stale data — bridge is likely disconnected
        console.log(`[BridgeStatus] Redis data for ${userId} is ${ageMs}ms old — treating as disconnected`)
      }
    }
  } catch {
    // Redis not available, fall through to FastAPI
  }

  // Fallback: call FastAPI directly
  try {
    const res = await fetch(`${PYTHON_API_URL}/bridge/status/${userId}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
      headers: {
        'ngrok-skip-browser-warning': 'any-value'
      }
    })
    if (res.ok) {
      const data = await res.json()
      return NextResponse.json({
        connected: data.connected,
        last_seen: data.last_seen || new Date().toISOString(),
        balance: data.balance ?? 0,
        equity: data.equity ?? 0,
        login: data.login ?? null,
        server: data.server ?? null,
        mock: data.mock ?? false
      })
    }
  } catch {
    // FastAPI unreachable
  }

  // Nothing available — not connected
  return NextResponse.json({
    connected: false,
    last_seen: new Date().toISOString(),
    balance: 0.00,
    equity: 0.00,
    login: null,
    server: null,
    mock: false
  })
}
