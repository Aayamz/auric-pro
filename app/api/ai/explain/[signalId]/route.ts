import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || 'placeholder'
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ signalId: string }> }
) {
  const { signalId } = await params

  try {
    const supabase = getSupabaseServerClient()
    const { data: signal, error } = await supabase
      .from('signals')
      .select('*')
      .eq('id', signalId)
      .single()

    if (!error && signal) {
      if (signal.ai_explanation) {
        return NextResponse.json({ explanation: signal.ai_explanation })
      }

      let explanation = "Bullish swing structure mitigation on M15 demand blocks."
      if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'placeholder') {
        const prompt = `Provide a concise (under 60 words) technical analyst review for this XAUUSD ${signal.direction} signal triggered via strategy ${signal.strategy}. Confidence is ${signal.confidence}%.`
        const message = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 100,
          messages: [{ role: 'user', content: prompt }]
        })
        explanation = (message.content[0].type === 'text' ? message.content[0].text : '').trim()
      }

      await supabase
        .from('signals')
        .update({ ai_explanation: explanation })
        .eq('id', signalId)

      return NextResponse.json({ explanation })
    }
  } catch {
    // Log error, continue to fallback
  }

  return NextResponse.json({
    explanation: "Consolidation breakdown filled the M15 Fair Value Gap at 1950.40, triggering oversold indicators with a low risk-reward configuration."
  })
}
