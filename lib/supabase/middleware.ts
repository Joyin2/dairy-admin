import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
      auth: {
        // Disable automatic token refresh in middleware
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    }
  )

  // Handle authentication with error handling
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    // If there's an error or no user, redirect to login (except for public pages)
    if (
      (error || !user) &&
      !request.nextUrl.pathname.startsWith('/login') &&
      !request.nextUrl.pathname.startsWith('/signup') &&
      !request.nextUrl.pathname.startsWith('/api') &&
      request.nextUrl.pathname !== '/'
    ) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    // Check if user is trying to access dashboard and verify role
    if (user && request.nextUrl.pathname.startsWith('/dashboard')) {
      const { data: appUser } = await supabase
        .from('app_users')
        .select('role, status')
        .eq('auth_uid', user.id)
        .single()

      // Block delivery agents from admin panel
      if (appUser?.role === 'delivery_agent' || appUser?.status !== 'active') {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
      }
    }
  } catch (error) {
    // If there's an error getting the user, allow through to public pages
    // and let the page handle authentication
    console.error('Middleware auth error:', error)
    
    // Only redirect if NOT on a public page
    if (
      !request.nextUrl.pathname.startsWith('/login') &&
      !request.nextUrl.pathname.startsWith('/signup') &&
      !request.nextUrl.pathname.startsWith('/api') &&
      request.nextUrl.pathname !== '/'
    ) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
