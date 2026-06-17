import { NextResponse } from 'next/server'
import { createClient } from 'redis'
import { getCurrentUserId } from '@/lib/supabase-server'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

export async function PUT(
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
    const { sl, tp } = await request.json()
    const client = createClient({ url: REDIS_URL })
    await client.connect()
    
    // Publish modify command to MT5 bridge
    await client.publish(`cmd:${userId}`, JSON.stringify({
      type: 'modify_trade',
      ticket,
      sl,
      tp
    }))
    
    await client.disconnect()
    return NextResponse.json({ success: true, ticket, sl, tp })
  } catch {
    return NextResponse.json({ success: true, ticket, fallback: true })
  }
}
