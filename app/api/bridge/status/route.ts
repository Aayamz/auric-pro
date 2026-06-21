import { NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379'
const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://127.0.0.1:8000'

export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Try Redis first (if available)
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
      return NextResponse.json({
        connected: true,
        last_seen: data.last_seen || new Date().toISOString(),
        balance: data.balance || 0,
        equity: data.equity || 0,
        login: data.login ?? null,
        server: data.server ?? null,
        mock: data.mock ?? false
      })
    }
  } catch {
    // Redis not available, fall through to FastAPI
  }

  // Fallback: call FastAPI with retries (FastAPI may be starting up)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${PYTHON_API_URL}/bridge/status/${userId}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
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
      // FastAPI not ready yet, wait and retry
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 2000))
      }
    }
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
