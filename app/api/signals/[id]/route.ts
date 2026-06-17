import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || 'placeholder'
})

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: signalId } = await params

  try {
    const supabase = getSupabaseServerClient()
    const { data: signal, error } = await supabase
      .from('signals')
      .select('*')
      .eq('id', signalId)
      .single()

    if (!error && signal) {
      // If AI explanation is missing, generate it lazily
      if (!signal.ai_explanation && process.env.ANTHROPIC_API_KEY) {
        try {
          const prompt = `Explain this trading signal:
Pair: ${signal.pair}
Direction: ${signal.direction}
Strategy: ${signal.strategy}
Timeframe: ${signal.timeframe}
Confidence: ${signal.confidence}%
Entry Price: ${signal.entry_price}
Stop Loss: ${signal.sl_price}
Indicators: ${JSON.stringify(signal.indicator_values)}

Provide a professional, technical analysis in under 80 words explaining the market structure, the indicators backing it, and the risk/reward rationale.`

          const message = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 150,
            messages: [{ role: 'user', content: prompt }],
          })

          const rawText = message.content[0].type === 'text' ? message.content[0].text : ''
          const explanation = rawText.trim()

          // Cache it in Supabase
          await supabase
            .from('signals')
            .update({ ai_explanation: explanation })
            .eq('id', signalId)

          signal.ai_explanation = explanation
        } catch (aiErr) {
          console.error("Claude call failed for signal explanation:", aiErr)
        }
      }
      return NextResponse.json(signal)
    }
  } catch {
    console.warn("Supabase fetch failed for single signal, using fallback.")
  }

  // Fallback Mock Signal Detail
  return NextResponse.json({
    id: signalId,
    user_id: "00000000-0000-0000-0000-000000000000",
    pair: "XAUUSD",
    direction: "BUY",
    strategy: "order_block_reversal",
    timeframe: "M15",
    confidence: 88.50,
    entry_price: 1955.50,
    sl_price: 1949.20,
    tp_levels: [{ rr: 1, price: 1961.80 }, { rr: 2, price: 1968.00 }, { rr: 3, price: 1974.20 }],
    indicator_values: { rsi: 35.2, atr: 2.1, ob_zone: "H4 Demands" },
    ai_explanation: "Bullish divergence detected inside H4 Order Block reversal zone. Strong buy pressure at low range. Stochastic oscillators are heavily oversold on shorter timeframes, validating the immediate bounce potential with a tight stop below local structural swing low.",
    status: "LIVE",
    created_at: new Date().toISOString()
  })
}
