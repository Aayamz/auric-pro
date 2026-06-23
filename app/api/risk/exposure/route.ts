import { NextResponse } from 'next/server'
import { createClient } from 'redis'
import { getSupabaseServerClient, getCurrentUserId } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const CLOSED_STATUSES = ['closed', 'CLOSED', 'completed', 'COMPLETED', 'SL_HIT', 'TP1_HIT', 'TP2_HIT', 'TP3_HIT']

export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseServerClient()

    // 1. Fetch risk profile from Supabase
    const { data: riskProfile } = await supabase
      .from('risk_profiles')
      .select('*')
      .eq('user_id', userId)
      .single()

    const max_concurrent_positions = riskProfile?.max_concurrent_positions ?? 1
    const daily_loss_limit_pct = Number(riskProfile?.daily_loss_limit_pct ?? 4.0)

    // 2. Fetch live data from Redis (bridge status and positions)
    let balance = 10000.0
    let equity = 10000.0
    let margin_used_pct = 0.0
    let openPositions: any[] = []

    try {
      const client = createClient({ url: REDIS_URL })
      client.on('error', () => {})
      await client.connect()

      const status = await client.get(`bridge:status:${userId}`)
      if (status) {
        const parsedStatus = JSON.parse(status)
        balance = Number(parsedStatus.balance ?? 10000.0)
        equity = Number(parsedStatus.equity ?? 10000.0)
        margin_used_pct = Number(parsedStatus.margin_used_pct ?? 0.0)
      }

      const positionsData = await client.get(`positions:${userId}`)
      if (positionsData) {
        openPositions = JSON.parse(positionsData)
      }

      await client.disconnect()
    } catch (redisErr) {
      console.warn('[ExposureAPI] Redis connection failed, falling back to database values:', redisErr)
      // Fallback: fetch last known balance & equity from DB
      const { data: brokerAccount } = await supabase
        .from('broker_accounts')
        .select('balance, equity')
        .eq('user_id', userId)
        .single()

      if (brokerAccount) {
        balance = Number(brokerAccount.balance ?? 10000.0)
        equity = Number(brokerAccount.equity ?? 10000.0)
      }
    }

    // If margin_used_pct is still 0 and we have open positions, compute volume-based estimation
    if (margin_used_pct === 0 && openPositions.length > 0) {
      const totalVolume = openPositions.reduce((sum, p) => sum + Number(p.volume ?? 0), 0)
      margin_used_pct = Number((totalVolume * 10.0).toFixed(2)) // e.g. 0.1 lots = 1.0% margin used
    }

    // 3. Fetch realized P&L of trades closed today (since local midnight / UTC start of day)
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const { data: closedToday } = await supabase
      .from('trades')
      .select('pnl_usd')
      .eq('user_id', userId)
      .in('status', CLOSED_STATUSES)
      .gte('closed_at', startOfDay.toISOString())

    const closedPnl = (closedToday || []).reduce((sum, t) => sum + Number(t.pnl_usd || 0), 0)

    // 4. Calculate floating P&L of open positions
    const floatingPnl = openPositions.reduce((sum, p) => sum + Number(p.profit || 0), 0)

    // 5. Total Daily P&L = Realized closed P&L + Unrealized floating P&L
    const daily_pnl = Number((closedPnl + floatingPnl).toFixed(2))

    // 6. Drawdown = relative drop from balance to equity (percentage of balance)
    const drawdown = balance > 0 ? Math.max(0, Number((((balance - equity) / balance) * 100).toFixed(2))) : 0.0

    // 7. Calculate dynamic Risk Score (0-100) based on actual metrics
    // Heuristic formula:
    // - Base: 10
    // - Drawdown factor: up to 40 points (weighting drawdown vs max allowed)
    // - Margin used factor: up to 30 points
    // - Positions limit factor: up to 20 points
    // - Daily Loss proximity factor: up to 30 points (relative to daily loss limit)
    let scorePoints = 10

    // Drawdown component
    if (drawdown > 0) {
      const maxAllowedDrawdown = Number(riskProfile?.max_drawdown_pct ?? 15.0)
      const ddRatio = maxAllowedDrawdown > 0 ? drawdown / maxAllowedDrawdown : 0
      scorePoints += Math.min(40, ddRatio * 40)
    }

    // Margin used component
    if (margin_used_pct > 0) {
      scorePoints += Math.min(30, margin_used_pct * 1.5)
    }

    // Active positions limit ratio component
    if (openPositions.length > 0 && max_concurrent_positions > 0) {
      const posRatio = openPositions.length / max_concurrent_positions
      scorePoints += Math.min(20, posRatio * 20)
    }

    // Daily loss limit component
    if (daily_pnl < 0) {
      const dailyLossPct = (Math.abs(daily_pnl) / balance) * 100
      const lossRatio = daily_loss_limit_pct > 0 ? dailyLossPct / daily_loss_limit_pct : 0
      scorePoints += Math.min(30, lossRatio * 30)
    }

    const score = Math.max(0, Math.min(100, Math.round(scorePoints)))

    return NextResponse.json({
      score,
      daily_pnl,
      drawdown,
      open_positions: openPositions.length,
      margin_used_pct
    })
  } catch (err: any) {
    console.error('[ExposureAPI] Failed to calculate exposure:', err)
    return NextResponse.json({
      score: 10,
      daily_pnl: 0.00,
      drawdown: 0.00,
      open_positions: 0,
      margin_used_pct: 0.0
    })
  }
}
