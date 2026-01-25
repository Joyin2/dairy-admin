import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // Ensure environment variables are available
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createBrowserClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
      global: {
        fetch: (url, options = {}) => {
          return fetch(url, {
            ...options,
            cache: 'no-store',
          }).catch((error) => {
            console.error('Supabase fetch error:', error)
            throw error
          })
        },
      },
    }
  )
}
