import { NextResponse } from 'next/server'
import { getSupabaseServerClient, getCurrentUserId } from '@/lib/supabase-server'

const BUILTIN_STRATEGIES = [
  {
    name: 'ema_crossover',
    display_name: 'EMA Ribbon Crossover',
    mode: 'SCALP',
    description: 'Executes entries based on short-term 9/21/50 Exponential Moving Average ribbon crossings.',
    win_rate: 62.5,
    avg_rr: 1.5,
    active_timeframes: ['M5', 'M15'],
    is_active: true
  },
  {
    name: 'rsi_stoch',
    display_name: 'RSI Stochastic Rebounds',
    mode: 'SCALP',
    description: 'Enters trades when RSI and Stochastic oscillators align in overbought or oversold territories.',
    win_rate: 58.0,
    avg_rr: 1.2,
    active_timeframes: ['M1', 'M5'],
    is_active: false
  },
  {
    name: 'bollinger_bounce',
    display_name: 'Bollinger Bands Bounce',
    mode: 'SWING',
    description: 'Identifies volatility contraction squeeze channels and trades bounces off outer bands.',
    win_rate: 60.2,
    avg_rr: 1.8,
    active_timeframes: ['M15', 'H1'],
    is_active: false
  },
  {
    name: 'order_block_reversal',
    display_name: 'Order Block Reversals',
    mode: 'SWING',
    description: 'Enters trades on mitigation retests of institutional supply/demand order block zones.',
    win_rate: 68.4,
    avg_rr: 2.5,
    active_timeframes: ['M15', 'H1', 'H4'],
    is_active: false
  },
  {
    name: 'fvg_scalper',
    display_name: 'Fair Value Gap Scalper',
    mode: 'SCALP',
    description: 'Enters trades when price fills single-candle inefficiencies (FVG) in the direction of order flow.',
    win_rate: 64.0,
    avg_rr: 1.4,
    active_timeframes: ['M5', 'M15'],
    is_active: false
  },
  {
    name: 'liquidity_sweep',
    display_name: 'Liquidity Sweep Scalper',
    mode: 'SCALP',
    description: 'Trades rapid sweeps of retail buy/sell stops located above previous high/low ranges.',
    win_rate: 71.0,
    avg_rr: 2.2,
    active_timeframes: ['M5', 'M15'],
    is_active: false
  },
  {
    name: 'breakout_bos',
    display_name: 'BOS/CHoCH Breakout',
    mode: 'SWING',
    description: 'Capitalizes on market structure shifts (CHoCH) and breakouts of key structure levels (BOS).',
    win_rate: 61.5,
    avg_rr: 3.0,
    active_timeframes: ['M15', 'H1'],
    is_active: false
  },
  {
    name: 'trend_following',
    display_name: 'Trend Ribbon Follower',
    mode: 'SWING',
    description: 'Enters trades in long-term directions aligning M30/H1/H4 primary trend filters.',
    win_rate: 66.8,
    avg_rr: 3.5,
    active_timeframes: ['M30', 'H1', 'H4'],
    is_active: false
  }
]

export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const supabase = getSupabaseServerClient()
    const { data: userStrats } = await supabase
      .from('user_strategies')
      .select('*')
      .eq('user_id', userId)

    if (userStrats && userStrats.length > 0) {
      const merged = BUILTIN_STRATEGIES.map(strat => {
        const found = userStrats.find(u => u.strategy_name === strat.name)
        if (found) {
          return {
            ...strat,
            is_active: found.is_active,
            config: found.config
          }
        }
        return strat
      })
      return NextResponse.json(merged)
    }
  } catch {
    console.warn("Supabase strategies fetch failed, using fallback list.")
  }

  return NextResponse.json(BUILTIN_STRATEGIES)
}
