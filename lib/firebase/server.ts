import { cookies } from 'next/headers'
import { adminAuth, adminDb } from './admin'

export async function getCurrentUser() {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get('__session')?.value
    if (!sessionCookie) return null

    const decoded = await adminAuth.verifySessionCookie(sessionCookie, false)
    return decoded
  } catch {
    return null
  }
}

export async function getAppUser(uid: string) {
  const snap = await adminDb.collection('app_users').where('auth_uid', '==', uid).limit(1).get()
  if (snap.empty) return null
  const doc = snap.docs[0]
  return { id: doc.id, ...doc.data() } as any
}

export { adminDb, adminAuth }
