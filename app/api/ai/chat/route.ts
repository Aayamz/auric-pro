import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || 'placeholder'
})

export async function POST(request: Request) {
  try {
    const { messages, context } = await request.json()
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

    // 1. If Anthropic API key is provided, stream using Anthropic SDK
    if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'placeholder') {
      const anthropicStream = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 400,
        system: systemPrompt,
        messages: messages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
        stream: true,
      })

      const encoder = new TextEncoder()
      const customReadableStream = new ReadableStream({
        async start(controller) {
          for await (const chunk of anthropicStream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(chunk.delta.text))
            }
          }
          controller.close()
        }
      })

      return new Response(customReadableStream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked'
        }
      })
    }

    // Reject mock fallback stream if Anthropic API key is not configured
    return NextResponse.json({ error: 'Anthropic AI API key is not configured. Live AI advisor mode is required.' }, { status: 400 })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Stream connection error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
