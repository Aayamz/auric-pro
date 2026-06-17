import { NextRequest, NextResponse } from 'next/server'

function randomGaussian(mean = 0, std = 1) {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return mean + std * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

async function runSimulation(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const initial_balance = (params.initial_balance as number) ?? 10000
  const risk_pct = (params.risk_pct as number) ?? 1
  const commission = (params.commission as number) ?? 0.5
  const spread = (params.spread as number) ?? 1
  const strategy = (params.strategy as string) ?? 'order_block_reversal'
  const date_from = params.date_from as string
  const date_to = params.date_to as string

  // Simulate trading without real historical data
  // In production: fetch OHLCV from MT5 bridge
  const balances: { ts: number; equity: number }[] = []
  let balance = initial_balance
  let max_balance = initial_balance
  let max_drawdown_pct = 0
  let wins = 0, losses = 0

  // Strategy-dependent win rate
  const strategyParams: Record<string, { winRate: number; avgR: number; tradesPerDay: number }> = {
    order_block_reversal: { winRate: 0.62, avgR: 1.8, tradesPerDay: 2 },
    fvg_scalper:          { winRate: 0.58, avgR: 1.2, tradesPerDay: 4 },
    trend_following:      { winRate: 0.48, avgR: 2.4, tradesPerDay: 1 },
    liquidity_sweep:      { winRate: 0.60, avgR: 1.6, tradesPerDay: 2 },
    ema_crossover:        { winRate: 0.52, avgR: 1.5, tradesPerDay: 3 },
    rsi_stoch:            { winRate: 0.55, avgR: 1.4, tradesPerDay: 3 },
    bollinger_bounce:     { winRate: 0.57, avgR: 1.3, tradesPerDay: 2 },
    breakout_bos:         { winRate: 0.50, avgR: 2.0, tradesPerDay: 2 }
  }

  const sp = strategyParams[strategy] ?? strategyParams.order_block_reversal
  const from = new Date(date_from ?? new Date(Date.now() - 86400000 * 30))
  const to = new Date(date_to ?? new Date())
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000))
  const totalTrades = Math.round(days * sp.tradesPerDay * 0.7) // 70% trading days

  for (let i = 0; i < totalTrades; i++) {
    const riskAmount = balance * (risk_pct / 100)
    const isWin = Math.random() < sp.winRate
    const rMultiple = isWin
      ? Math.max(0.1, randomGaussian(sp.avgR, 0.4))
      : Math.max(0.3, randomGaussian(1.0, 0.2))
    const commPips = (commission + spread) * 0.1 * 10 // rough cost
    const pnl = isWin
      ? riskAmount * rMultiple - commPips
      : -(riskAmount + commPips)

    balance += pnl
    balance = Math.max(0, balance)

    if (balance > max_balance) max_balance = balance
    const dd = ((max_balance - balance) / max_balance) * 100
    if (dd > max_drawdown_pct) max_drawdown_pct = dd

    if (isWin) wins++; else losses++

    // Sample equity every ~5 trades for the curve
    if (i % 5 === 0) {
      balances.push({ ts: from.getTime() + (i / totalTrades) * (to.getTime() - from.getTime()), equity: balance })
    }
  }

  const net_pnl = balance - initial_balance
  const win_rate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0
  const gross_profit = wins * balance * (risk_pct / 100) * sp.avgR * 0.5
  const gross_loss = losses * balance * (risk_pct / 100)
  const profit_factor = gross_loss > 0 ? gross_profit / gross_loss : 0

  return {
    net_pnl: parseFloat(net_pnl.toFixed(2)),
    win_rate: parseFloat(win_rate.toFixed(1)),
    max_drawdown_pct: parseFloat(max_drawdown_pct.toFixed(2)),
    profit_factor: parseFloat(profit_factor.toFixed(2)),
    total_trades: totalTrades,
    initial_balance,
    equity_curve: balances,
    ai_analysis: null
  }
}

// In-memory job store (replace with Redis in production)
// Uses globalThis so the [jobId] route handler can read from the same store.
declare global {
  var __backtestJobs: Record<string, { status: string; progress: number; result: Record<string, unknown> | null }> | undefined
}
const jobs = (global.__backtestJobs ??= {})

export async function POST(req: NextRequest) {
  const body = await req.json()
  const jobId = `bt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  jobs[jobId] = { status: 'running', progress: 0, result: null }

  // Run async (non-blocking)
  ;(async () => {
    // Simulate progress ticks
    for (let p = 10; p <= 90; p += 10) {
      await new Promise(r => setTimeout(r, 150))
      if (jobs[jobId]) jobs[jobId].progress = p
    }
    const result = await runSimulation(body)
    if (jobs[jobId]) {
      jobs[jobId].status = 'complete'
      jobs[jobId].progress = 100
      jobs[jobId].result = result
    }
  })()

  return NextResponse.json({ job_id: jobId })
}
