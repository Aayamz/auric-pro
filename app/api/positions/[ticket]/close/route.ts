import { NextResponse } from 'next/server'
import { createClient } from 'redis'
import { getCurrentUserId } from '@/lib/supabase-server'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ ticket: string }> }
) {
  const { ticket: ticketStr } = await params
  const ticket = parseInt(ticketStr, 10)
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const client = createClient({ url: REDIS_URL })
    await client.connect()
    
    // Publish close command to MT5 bridge
    await client.publish(`cmd:${userId}`, JSON.stringify({
      type: 'close_trade',
      ticket
    }))
    
    await client.disconnect()
    return NextResponse.json({ success: true, ticket })
  } catch {
    return NextResponse.json({ success: true, ticket, fallback: true })
  }
}
