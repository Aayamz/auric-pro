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
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Redis cache server is offline' }, { status: 500 })
  }
}
