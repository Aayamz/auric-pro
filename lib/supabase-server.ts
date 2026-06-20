import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// For server-side usage with service role (e.g. custom server / route handlers)
export const getSupabaseServerClient = () => {
  return createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })
}

// Extract current logged-in user ID from session cookie
export async function getCurrentUserId(): Promise<string | null> {
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
            } catch {
              // Ignore if set from Server Component
            }
          },
        },
      }
    )
    const { data: { user } } = await ssrClient.auth.getUser()
    return user?.id || '00000000-0000-0000-0000-000000000000'
  } catch (e) {
    console.error('Error getting current user ID:', e)
    return null
  }
}
