import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  try {
    const supabase = await createClient()
    
    // Sign out to clear session
    await supabase.auth.signOut()
    
    // Get all cookies and clear Supabase-related ones
    const cookieStore = await cookies()
    const allCookies = cookieStore.getAll()
    
    // Clear all Supabase cookies
    allCookies.forEach(cookie => {
      if (cookie.name.includes('sb-') || cookie.name.includes('supabase')) {
        cookieStore.delete(cookie.name)
      }
    })
    
    return NextResponse.json({ 
      success: true, 
      message: 'Session cleared successfully. Please visit /login to sign in again.' 
    })
  } catch (error: any) {
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 })
  }
}
