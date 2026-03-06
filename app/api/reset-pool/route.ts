import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'

export async function POST(request: Request) {
  try {
    const { pool_id, user_id } = await request.json()

    const poolRef = adminDb.collection('milk_pool').doc(pool_id)
    const poolSnap = await poolRef.get()

    if (!poolSnap.exists || poolSnap.data()?.status !== 'active') {
      return NextResponse.json({ success: false, error: 'Active pool not found' })
    }

    const pool = poolSnap.data()!

    // Count usage logs and collections
    const [usageSnap, collectionsSnap] = await Promise.all([
      adminDb.collection('milk_usage_log').where('milk_pool_id', '==', pool_id).count().get(),
      adminDb.collection('pool_collections').where('milk_pool_id', '==', pool_id).count().get(),
    ])

    const usageCount = usageSnap.data().count
    const collectionsCount = collectionsSnap.data().count
    const totalMilkUsed = (pool.total_milk_liters || 0) - (pool.remaining_milk_liters || 0)

    // Archive old pool
    await poolRef.update({ status: 'archived', updated_at: new Date().toISOString() })

    // Create new empty pool
    await adminDb.collection('milk_pool').add({
      name: 'Main Pool',
      total_milk_liters: 0,
      total_fat_units: 0,
      total_snf_units: 0,
      original_avg_fat: 0,
      original_avg_snf: 0,
      remaining_milk_liters: 0,
      remaining_fat_units: 0,
      remaining_snf_units: 0,
      current_avg_fat: 0,
      current_avg_snf: 0,
      status: 'active',
      created_by: user_id,
      created_at: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      message: 'Pool reset successfully! All values set to zero.',
      summary: {
        milk_used: totalMilkUsed,
        collections_count: collectionsCount,
        usage_count: usageCount,
        inventory_count: 0,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message })
  }
}
