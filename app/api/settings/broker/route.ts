import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient, getCurrentUserId } from '@/lib/supabase-server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

async function getSessionToken(): Promise<string> {
  try {
    const cookieStore = await cookies()
    const ssrClient = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {}
          },
        },
      }
    )
    const { data: { session } } = await ssrClient.auth.getSession()
    return session?.access_token || ''
  } catch {
    return ''
  }
}

export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseServerClient()
    const { data } = await supabase.from('broker_accounts').select('login, server, credentials_enc').eq('user_id', userId).single()
    
    // Cloud mode is active if credentials_enc is not empty
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

  try {
    const supabase = getSupabaseServerClient()

    if (cloud_mode) {
      const token = await getSessionToken()
      // Call FastAPI backend to encrypt credentials and start the cloud bridge
      try {
        await fetch('http://localhost:8000/bridge/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            user_id: userId, 
            login: parseInt(login), 
            password, 
            server, 
            token 
          }),
          signal: AbortSignal.timeout(3000)
        })
      } catch (err: any) {
        console.error("FastAPI bridge setup call failed:", err.message)
      }
    } else {
      // Local Mode: save basic broker info to DB (empty credentials_enc)
      await supabase.from('broker_accounts').upsert({
        user_id: userId,
        platform: 'mt5',
        server,
        login: parseInt(login),
        credentials_enc: '',
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })

      // Tell FastAPI to stop any active cloud bridge subprocess for this user
      try {
        await fetch(`http://localhost:8000/bridge/stop/${userId}`, {
          method: 'POST',
          signal: AbortSignal.timeout(2000)
        })
      } catch {}

      // Backward compatibility for local bridge if running locally on port 8001
      if (password) {
        try {
          await fetch('http://localhost:8001/credentials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login: parseInt(login), password, server }),
            signal: AbortSignal.timeout(2000)
          })
        } catch {
          // Local bridge listener offline
        }
      }
    }
  } catch (err: any) {
    console.error("Failed to save broker configuration:", err.message)
  }

  return NextResponse.json({ success: true })
}

