import { NextResponse } from 'next/server'
import { callGemini } from '@/lib/gemini'

export async function GET() {
  try {
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'placeholder') {
      const prompt = "Provide a single sentence of technical analyst commentary for gold (XAUUSD) based on current range-bound conditions. Keep it under 20 words."
      const comment = await callGemini(prompt, false, 50)
      return NextResponse.json({ commentary: [comment] })
    }
  } catch (err) {
    console.error("Gemini commentary failed:", err)
  }
  
  return NextResponse.json({
    commentary: [
      "XAUUSD consolidation patterns suggest a short-term liquidity sweep above $1965 remains highly probable.",
      "ATR expansion indicates key breakout volatility building near the M15 order blocks.",
      "Institutions are building high-volume demand block positions at the local $1948 horizontal range."
    ]
  })
}
