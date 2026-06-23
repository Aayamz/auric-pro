import { NextResponse } from 'next/server'
import { callGeminiChat } from '@/lib/gemini'

export async function POST(request: Request) {
  try {
    let { messages, message, context } = await request.json()

    // Normalize messages to handle both single message and full messages array
    if (!messages) {
      if (message) {
        messages = [{ role: 'user', content: message }]
      } else {
        return NextResponse.json({ error: 'No messages or message provided' }, { status: 400 })
      }
    }

    const activeStrategy = context?.activeStrategy || 'EMA Ribbon Crossover'
    const openPositionsCount = context?.openPositionsCount || 2
    const dailyPnl = context?.dailyPnl || -45.50
    const regime = context?.regime || 'trending_bull'

    const marketContextJson = JSON.stringify({
      selectedPair: context?.selectedPair || 'XAUUSD',
      rsi: 42.5,
      atr: 2.4,
      trend: 'BULLISH'
    })

    const systemPrompt = `You are AURIC PRO's AI trading advisor. The user's current market context:
${marketContextJson}

You have access to their trading data:
- Active strategy: ${activeStrategy}
- Open positions: ${openPositionsCount} positions active
- Today's P&L: $${dailyPnl}
- Current regime: ${regime}

You are a professional trading analyst. Be direct, precise, and concise (under 120 words unless asked for detail). Always give a clear directional view. Use $ for prices, R:R notation for risk:reward. If the user asks you to change a setting, respond with a JSON action block: {"action":"set_config","key":"risk_pct","value":0.5}`

    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'placeholder') {
      const reply = await callGeminiChat(messages, systemPrompt, 400)
      return NextResponse.json({ reply })
    }

    return NextResponse.json({ error: 'Google Gemini API key is not configured. Live AI advisor mode is required.' }, { status: 400 })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Chat connection error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
