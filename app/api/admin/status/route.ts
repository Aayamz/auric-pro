import { NextResponse } from 'next/server'
import { getSupabaseServerClient, getCurrentUserId } from '@/lib/supabase-server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify Admin Role
  let email = ''
  try {
    const cookieStore = await cookies()
    const ssrClient = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
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
    const { data: { user } } = await ssrClient.auth.getUser()
    email = user?.email || ''
  } catch {}

  const isAdmin = email === 'demo@auricpro.com' || 
                  email === 'admin@auricpro.com' || 
                  email === 'admin@auric.pro' || 
                  email === 'aayamsoni@gmail.com' || 
                  email === 'aayamsss@gmail.com' ||
                  !!(process.env.NEXT_PUBLIC_ADMIN_EMAIL && email === process.env.NEXT_PUBLIC_ADMIN_EMAIL)
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
  }

  try {
    const supabase = getSupabaseServerClient()
    const { data: subs } = await supabase.from('subscriptions').select('user_id, plan, status')
    const { data: profiles } = await supabase.from('user_settings').select('user_id, display_name')
    const { data: brokers } = await supabase.from('broker_accounts').select('user_id, login, server, credentials_enc')

    const usersList: any[] = []
    const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://127.0.0.1:8000'

    for (const b of (brokers || [])) {
      const sub = (subs || []).find(s => s.user_id === b.user_id)
      const prof = (profiles || []).find(p => p.user_id === b.user_id)
      
      let bridgeStatus = { connected: false, balance: 10000.0, equity: 10000.0 }
      try {
        const res = await fetch(`${PYTHON_API_URL}/bridge/status/${b.user_id}`, {
          cache: 'no-store',
          headers: { 'ngrok-skip-browser-warning': 'any-value' }
        })
        if (res.ok) {
          bridgeStatus = await res.json()
        }
      } catch {}

      usersList.push({
        userId: b.user_id,
        displayName: prof?.display_name || 'Demo Client',
        plan: sub?.plan || 'free',
        status: sub?.status || 'active',
        login: b.login,
        server: b.server,
        credentialsStored: !!b.credentials_enc,
        connected: bridgeStatus.connected,
        balance: bridgeStatus.balance,
        equity: bridgeStatus.equity
      })
    }

    return NextResponse.json({
      users: usersList,
      totalUsers: usersList.length,
      activeBridges: usersList.filter(u => u.connected).length
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
