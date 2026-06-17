import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { telegram_bot_token, telegram_chat_id } = await request.json()

    if (!telegram_bot_token || !telegram_chat_id) {
      return NextResponse.json({ error: 'Missing Telegram token or Chat ID' }, { status: 400 })
    }

    // Attempt dispatcher request to Telegram Bot API
    const url = `https://api.telegram.org/bot${telegram_bot_token}/sendMessage`
    const payload = {
      chat_id: telegram_chat_id,
      text: "🔔 AURIC PRO: Telegram Alert System connection successful!",
      parse_mode: "HTML"
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (res.ok) {
      return NextResponse.json({ success: true })
    } else {
      const errData = await res.json()
      return NextResponse.json({ error: errData.description || 'Telegram validation failed' }, { status: 400 })
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Telegram connection exception'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
