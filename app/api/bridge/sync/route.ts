import { NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/supabase-server'

import { getPythonApiUrl } from '@/lib/api-helper-server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/bridge/sync
 * Forces a full MT5 history sync for the current user.
 * Deletes old/mock trades in Supabase and re-imports all real MT5 deals.
 * Called by the "Force Sync" button in the UI.
 */
export async function POST() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const pythonApiUrl = await getPythonApiUrl(userId)
    const res = await fetch(`${pythonApiUrl}/bridge/sync/${userId}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'ngrok-skip-browser-warning': 'any-value',
        'Content-Type': 'application/json'
      }
    })

    if (!res.ok) {
      const error = await res.text()
      return NextResponse.json(
        { error: `Sync failed: ${error}` },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json({ success: true, ...data })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Could not reach FastAPI backend' },
      { status: 503 }
    )
  }
}
