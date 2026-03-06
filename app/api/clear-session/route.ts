import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  try {
    const cookieStore = await cookies()
    cookieStore.delete('__session')

    return NextResponse.json({
      success: true,
      message: 'Session cleared successfully. Please visit /login to sign in again.',
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
