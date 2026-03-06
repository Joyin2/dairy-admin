import { NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebase/admin'

// POST /api/set-user-claims - Update custom claims when a user's role or status changes
export async function POST(request: Request) {
  try {
    const { authUid, role, status } = await request.json()

    if (!authUid) {
      return NextResponse.json({ error: 'Missing authUid' }, { status: 400 })
    }

    const claims: Record<string, string> = {}
    if (role) claims.role = role
    if (status) claims.status = status

    await adminAuth.setCustomUserClaims(authUid, claims)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Set claims error:', error)
    return NextResponse.json({ error: error.message || 'Failed to set claims' }, { status: 500 })
  }
}
