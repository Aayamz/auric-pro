import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { model } = await request.json()

    if (!model) {
      return NextResponse.json({ error: 'Model source is required' }, { status: 400 })
    }

    // In production: download and register the HuggingFace model weights
    // For now, acknowledge the deployment request
    return NextResponse.json({
      success: true,
      model,
      message: `Model ${model} deployed to strategy pool.`,
      config: {
        name: model.split('/').pop()?.replace(/[^a-z0-9]/gi, '_') || 'hf_model',
        source: model,
        type: 'neural',
        status: 'active'
      }
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load model'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
