import { NextResponse } from 'next/server'
import { getCurrentUserId, getSupabaseServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId || userId === '00000000-0000-0000-0000-000000000000') {
    return NextResponse.json({ id: '00000000-0000-0000-0000-000000000000', email: 'demo@auricpro.com' })
  }
  
  try {
    const supabase = getSupabaseServerClient()
    const { data } = await supabase
      .from('broker_accounts')
      .select('login')
      .eq('user_id', userId)
      .limit(1)
      
    const email = data && data.length > 0 ? `mt5_${data[0].login}@auricpro.com` : 'demo@auricpro.com'
    return NextResponse.json({ id: userId, email })
  } catch {
    return NextResponse.json({ id: userId, email: 'demo@auricpro.com' })
  }
}
