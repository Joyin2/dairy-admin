import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'

export async function GET() {
  try {
    await adminDb.collection('_health').limit(1).get()

    return NextResponse.json({
      status: 'ok',
      firebase: {
        projectId: process.env.FIREBASE_PROJECT_ID,
        reachable: true,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
