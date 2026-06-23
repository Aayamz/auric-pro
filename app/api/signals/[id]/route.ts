import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { callGemini } from '@/lib/gemini'

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

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!signal) {
      return NextResponse.json({ error: 'Signal not found' }, { status: 404 })
    }

    // If AI explanation is missing, generate it lazily
    if (!signal.ai_explanation && process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'placeholder') {
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

        const explanation = await callGemini(prompt, false, 150)

        // Cache it in Supabase
        await supabase
          .from('signals')
          .update({ ai_explanation: explanation })
          .eq('id', signalId)

        signal.ai_explanation = explanation
      } catch (aiErr) {
        console.error("Gemini call failed for signal explanation:", aiErr)
      }
    }

    return NextResponse.json(signal)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Database connection error' }, { status: 500 })
  }
}
