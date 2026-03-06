import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { cookies } from 'next/headers'

// POST /api/session - Create session cookie after Firebase login
// Also syncs the user's role as a custom claim for Firestore security rules
export async function POST(request: Request) {
  try {
    const { idToken } = await request.json()
    if (!idToken) {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 })
    }

    // Verify the ID token to get uid
    const decoded = await adminAuth.verifyIdToken(idToken)
    const uid = decoded.uid

    // Look up the user's role from Firestore
    const userSnap = await adminDb.collection('app_users').where('auth_uid', '==', uid).limit(1).get()
    if (!userSnap.empty) {
      const userData = userSnap.docs[0].data()
      const role = userData.role
      const status = userData.status

      // Set custom claims so Firestore rules can check role without a Firestore read
      const currentClaims = decoded.role
      if (currentClaims !== role) {
        await adminAuth.setCustomUserClaims(uid, { role, status })
      }
    }

    // Create session cookie valid for 5 days
    const expiresIn = 60 * 60 * 24 * 5 * 1000
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn })

    const cookieStore = await cookies()
    cookieStore.set('__session', sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: expiresIn / 1000,
      path: '/',
    })

    // Signal client to refresh its ID token so claims take effect for Firestore rules
    return NextResponse.json({ success: true, claimsUpdated: true })
  } catch (error: any) {
    console.error('Session creation error:', error)
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
}

// DELETE /api/session - Clear session cookie on logout
export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete('__session')
  return NextResponse.json({ success: true })
}
