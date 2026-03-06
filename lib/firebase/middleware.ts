import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  const sessionCookie = request.cookies.get('__session')?.value

  const isPublicPath =
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/signup') ||
    request.nextUrl.pathname.startsWith('/api') ||
    request.nextUrl.pathname === '/'

  if (!sessionCookie && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}