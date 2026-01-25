import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { pool_id, user_id } = await request.json()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get current pool
    const { data: pool } = await supabase
      .from('milk_pool')
      .select('*')
      .eq('id', pool_id)
      .eq('status', 'active')
      .single()

    if (!pool) {
      return NextResponse.json({ success: false, error: 'Active pool not found' })
    }

    // Get counts
    const { count: usageCount } = await supabase
      .from('milk_usage_log')
      .select('*', { count: 'exact', head: true })
      .eq('milk_pool_id', pool_id)

    const { count: collectionsCount } = await supabase
      .from('pool_collections')
      .select('*', { count: 'exact', head: true })
      .eq('milk_pool_id', pool_id)

    const totalMilkUsed = pool.total_milk_liters - pool.remaining_milk_liters

    const now = new Date().toISOString()

    // Archive old pool
    const { error: archiveError } = await supabase
      .from('milk_pool')
      .update({ status: 'archived' })
      .eq('id', pool_id)

    if (archiveError) {
      return NextResponse.json({ success: false, error: 'Failed to archive: ' + archiveError.message })
    }

    // Create new empty pool
    const { error: newPoolError } = await supabase
      .from('milk_pool')
      .insert({
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
        created_by: user_id
      })

    if (newPoolError) {
      return NextResponse.json({ success: false, error: 'Failed to create new pool: ' + newPoolError.message })
    }

    return NextResponse.json({
      success: true,
      message: 'Pool reset successfully! All values set to zero.',
      summary: {
        milk_used: totalMilkUsed,
        collections_count: collectionsCount || 0,
        usage_count: usageCount || 0,
        inventory_count: 0
      }
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message })
  }
}
