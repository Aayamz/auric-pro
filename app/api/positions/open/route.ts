import { NextResponse } from 'next/server'
import { createClient } from 'redis'
import { getCurrentUserId } from '@/lib/supabase-server'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const client = createClient({ url: REDIS_URL })
    await client.connect()
    const positionsData = await client.get(`positions:${userId}`)
    await client.disconnect()

    if (positionsData) {
      return NextResponse.json(JSON.parse(positionsData))
    }
  } catch {
    console.warn("Failed to fetch open positions from Redis, returning mock.")
  }

  // Fallback Mock Open Positions
  return NextResponse.json([
    {
      ticket: 948172,
      symbol: "XAUUSD",
      type: "BUY",
      volume: 0.10,
      open_price: 1955.50,
      current_price: 1957.80,
      profit: 230.00,
      pips: 23.0
    },
    {
      ticket: 948195,
      symbol: "XAUUSD",
      type: "SELL",
      volume: 0.05,
      open_price: 1960.20,
      current_price: 1959.00,
      profit: 60.00,
      pips: 12.0
    }
  ])
}
