import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || 'placeholder'
})

export async function GET() {
  try {
    if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'placeholder') {
      const prompt = "Provide a single sentence of technical analyst commentary for gold (XAUUSD) based on current range-bound conditions. Keep it under 20 words."
      const res = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 50,
        messages: [{ role: 'user', content: prompt }]
      })
      const comment = (res.content[0].type === 'text' ? res.content[0].text : '').trim()
      return NextResponse.json({ commentary: [comment] })
    }
  } catch {
    // Fallback on error
  }
  
  return NextResponse.json({
    commentary: [
      "XAUUSD consolidation patterns suggest a short-term liquidity sweep above $1965 remains highly probable.",
      "ATR expansion indicates key breakout volatility building near the M15 order blocks.",
      "Institutions are building high-volume demand block positions at the local $1948 horizontal range."
    ]
  })
}
