import { NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebase/admin'

// POST /api/create-user - Create a Firebase Auth user with custom role claims
export async function POST(request: Request) {
  try {
    const { email, password, role } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Missing email or password' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    // Create the Firebase Auth user
    const userRecord = await adminAuth.createUser({ email, password })

    // Set custom claims so Firestore security rules can check the role
    if (role) {
      await adminAuth.setCustomUserClaims(userRecord.uid, { role })
    }

    return NextResponse.json({ uid: userRecord.uid })
  } catch (error: any) {
    console.error('Create user error:', error)
    if (error.code === 'auth/email-already-exists') {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message || 'Failed to create user' }, { status: 500 })
  }
}
