import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient, getCurrentUserId } from '@/lib/supabase-server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { getPythonApiUrl } from '@/lib/api-helper-server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

async function checkAdmin(): Promise<boolean> {
  const userId = await getCurrentUserId()
  if (!userId) return false

  try {
    const cookieStore = await cookies()
    const ssrClient = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {}
        }
      }
    )
    const { data: { user } } = await ssrClient.auth.getUser()
    const email = user?.email || ''
    return email === 'demo@auricpro.com' || 
           email === 'admin@auricpro.com' || 
           email === 'admin@auric.pro' || 
           email === 'aayamsoni@gmail.com' || 
           email === 'aayamsss@gmail.com' ||
           !!(process.env.NEXT_PUBLIC_ADMIN_EMAIL && email === process.env.NEXT_PUBLIC_ADMIN_EMAIL)
  } catch {
    return false
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  const isAdmin = await checkAdmin()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 })
  }

  const { action } = await params
  const { user_id } = await req.json()

  if (!user_id) {
    return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })
  }

  const pythonApiUrl = await getPythonApiUrl(user_id)

  try {
    let res
    if (action === 'start') {
      res = await fetch(`${pythonApiUrl}/bridge/start/${user_id}`, {
        method: 'POST',
        headers: { 'ngrok-skip-browser-warning': 'any-value' }
      })
    } else if (action === 'stop') {
      res = await fetch(`${pythonApiUrl}/bridge/stop/${user_id}`, {
        method: 'POST',
        headers: { 'ngrok-skip-browser-warning': 'any-value' }
      })
    } else if (action === 'sync') {
      res = await fetch(`${pythonApiUrl}/bridge/sync/${user_id}`, {
        method: 'POST',
        headers: { 'ngrok-skip-browser-warning': 'any-value' }
      })
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    if (!res.ok) {
      const errData = await res.json()
      return NextResponse.json({ error: errData.detail || 'Action execution failed' }, { status: res.status })
    }

    return NextResponse.json(await res.json())
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown server proxy error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
