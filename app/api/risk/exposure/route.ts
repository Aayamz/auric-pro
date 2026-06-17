import { NextResponse } from 'next/server'

export async function GET() {
  const score = Math.floor(Math.random() * 60)
  return NextResponse.json({
    score,
    daily_pnl: -45.50,
    drawdown: 2.45,
    open_positions: 1,
    margin_used_pct: 8.3
  })
}
