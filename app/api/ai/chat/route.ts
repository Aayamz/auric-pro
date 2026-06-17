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

    // 2. Mock Streaming Fallback for local testing when API key is missing
    const encoder = new TextEncoder()
    const lastUserMessage = messages[messages.length - 1]?.content?.toLowerCase() || ''
    
    let mockResponse = `Hello! I am your AURIC PRO Advisor. Based on the current market context, XAUUSD is showing strong consolidation. Your active strategy (${activeStrategy}) and risk profile are well aligned.`
    
    if (lastUserMessage.includes('should i trade') || lastUserMessage.includes('trade now')) {
      mockResponse = `Looking at XAUUSD M15 timeframe, RSI is holding at 42.5 with a minor bullish bias. Since you have ${openPositionsCount} open positions, I recommend holding off on new execution to avoid compounding risk. Keep an eye on $1960 resistance.`
    } else if (lastUserMessage.includes('risk') || lastUserMessage.includes('reduce risk')) {
      mockResponse = `To protect your daily P&L ($${dailyPnl}), we can tighten the stop loss configurations. I've formulated a config change proposal. {"action":"set_config","key":"risk_pct","value":0.5} I will update your risk per trade to 0.5% immediately.`
    } else if (lastUserMessage.includes('strategy') || lastUserMessage.includes('safest')) {
      mockResponse = `Currently, XAUUSD is in a ${regime} state. I recommend switching to Bollinger Bounce for range containment. {"action":"set_config","key":"active_strategy","value":"bollinger_bounce"}`
    }

    const mockStream = new ReadableStream({
      async start(controller) {
        const words = mockResponse.split(' ')
        for (const word of words) {
          controller.enqueue(encoder.encode(word + ' '))
          await new Promise((resolve) => setTimeout(resolve, 60))
        }
        controller.close()
      }
    })

    return new Response(mockStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked'
      }
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Stream connection error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
