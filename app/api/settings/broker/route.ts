import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient, getCurrentUserId } from '@/lib/supabase-server'

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://127.0.0.1:8000'

export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseServerClient()
    const { data } = await supabase.from('broker_accounts').select('login, server, credentials_enc').eq('user_id', userId).single()
    
    const cloudMode = !!data?.credentials_enc
    
    return NextResponse.json({ 
      login: data?.login ?? '', 
      server: data?.server ?? '',
      cloud_mode: cloudMode
    })
  } catch {
    return NextResponse.json({ login: '', server: '', cloud_mode: true })
  }
}

export async function PUT(req: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { login, password, server, cloud_mode } = await req.json()

  const numericLogin = parseInt(login)
  if (!login || isNaN(numericLogin) || numericLogin <= 0) {
    return NextResponse.json({ error: 'MT5 Login must be a valid numeric account number' }, { status: 400 })
  }
  if (!password || !server) {
    return NextResponse.json({ error: 'Password and server are required' }, { status: 400 })
  }

  // Step 1: Always save credentials to Supabase directly from Next.js
  // This ensures credentials are persisted even if FastAPI is down
  const supabase = getSupabaseServerClient()
  const { error: dbError } = await supabase.from('broker_accounts').upsert({
    user_id: userId,
    platform: 'mt5',
    server,
    login: numericLogin,
    credentials_enc: password,  // stored as plaintext initially; FastAPI will encrypt and update
    is_connected: false,
  }, { onConflict: 'user_id' })

  if (dbError) {
    console.error("Failed to save broker credentials to database:", dbError.message)
    return NextResponse.json({ error: `Failed to save credentials: ${dbError.message}` }, { status: 500 })
  }

  // Step 2: Call FastAPI to encrypt credentials and start the cloud bridge
  if (cloud_mode) {
    try {
      const setupRes = await fetch(`${PYTHON_API_URL}/bridge/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          user_id: userId, 
          login: numericLogin, 
          password, 
          server 
        }),
        signal: AbortSignal.timeout(5000)
      })
      if (!setupRes.ok) {
        const errBody = await setupRes.text()
        console.error("FastAPI bridge setup failed:", setupRes.status, errBody)
      }
    } catch (err: any) {
      console.error("FastAPI bridge setup call failed:", err.message)
    }
  } else {
    // Local mode: stop any cloud bridge, optionally notify local bridge
    try {
      await fetch(`${PYTHON_API_URL}/bridge/stop/${userId}`, {
        method: 'POST',
        signal: AbortSignal.timeout(2000)
      })
    } catch {}

    if (password) {
      try {
        await fetch('http://localhost:8001/credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ login: numericLogin, password, server }),
          signal: AbortSignal.timeout(2000)
        })
      } catch {}
    }
  }

  return NextResponse.json({ success: true })
}
