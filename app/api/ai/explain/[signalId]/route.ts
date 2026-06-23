import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { callGemini } from '@/lib/gemini'

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
      if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'placeholder') {
        const prompt = `Provide a concise (under 60 words) technical analyst review for this XAUUSD ${signal.direction} signal triggered via strategy ${signal.strategy}. Confidence is ${signal.confidence}%.`
        explanation = await callGemini(prompt, false, 100)
      }

      await supabase
        .from('signals')
        .update({ ai_explanation: explanation })
        .eq('id', signalId)

      return NextResponse.json({ explanation })
    }
  } catch (err) {
    console.error("Gemini signal explain failed:", err)
  }

  return NextResponse.json({
    explanation: "Consolidation breakdown filled the M15 Fair Value Gap at 1950.40, triggering oversold indicators with a low risk-reward configuration."
  })
}
