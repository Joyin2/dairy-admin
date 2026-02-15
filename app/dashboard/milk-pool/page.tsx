'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface MilkPool {
  id: string
  name: string
  total_milk_liters: number
  total_fat_units: number
  total_snf_units: number
  original_avg_fat: number
  original_avg_snf: number
  remaining_milk_liters: number
  remaining_fat_units: number
  remaining_snf_units: number
  current_avg_fat: number
  current_avg_snf: number
  status: string
  created_at: string
  reset_at?: string
}

interface Collection {
  id: string
  qty_liters: number
  fat: number
  snf: number
  suppliers: { name: string }
  created_at: string
}

interface UsageLog {
  id: string
  used_liters: number
  manual_fat_percent: number
  manual_snf_percent: number
  used_fat_units: number
  used_snf_units: number
  remaining_avg_fat_after: number
  remaining_avg_snf_after: number
  purpose: string
  product_id?: string
  products?: { name: string }
  used_at: string
  app_users: { name: string }
}

interface InventoryItem {
  product_id: string
  quantity: string
  unit: string
}

interface ArchivedPool {
  id: string
  original_pool_id: string
  pool_name: string
  total_milk_liters: number
  original_avg_fat: number
  remaining_milk_liters: number
  current_avg_fat: number
  pool_created_at: string
  archived_at: string
  usage_count: number
  collections_count: number
  snapshot_data: {
    usage_history: any[]
    collections: any[]
    inventory_items: any[]
  }
}

export default function MilkPoolPage() {
  const router = useRouter()
  const supabase = createClient()
  const [pool, setPool] = useState<MilkPool | null>(null)
  const [collections, setCollections] = useState<Collection[]>([])
  const [selectedCollections, setSelectedCollections] = useState<string[]>([])
  const [usageLog, setUsageLog] = useState<UsageLog[]>([])
  const [usageStartDate, setUsageStartDate] = useState('')
  const [usageEndDate, setUsageEndDate] = useState('')
  const [archivedPools, setArchivedPools] = useState<ArchivedPool[]>([])
  const [expandedArchive, setExpandedArchive] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  
  // Usage form
  const [showUseModal, setShowUseModal] = useState(false)
  const [products, setProducts] = useState<any[]>([])
  const [useForm, setUseForm] = useState({
    liters: '',
    fat_percent: '',
    snf_percent: '',
    purpose: ''
  })
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    
    // Load or create pool
    let { data: pools } = await supabase
      .from('milk_pool')
      .select('*')
      .eq('status', 'active')
      .limit(1)

    let currentPool = pools?.[0]
    
    if (!currentPool) {
      // Create default pool
      const { data: newPool } = await supabase
        .from('milk_pool')
        .insert({ name: 'Main Pool', status: 'active' })
        .select()
        .single()
      currentPool = newPool
    }
    
    setPool(currentPool)

    // Load available collections (approved, not yet in pool)
    const { data: availableCollections } = await supabase
      .from('milk_collections')
      .select('*, suppliers(name)')
      .eq('qc_status', 'approved')
      .eq('status', 'new')
      .order('created_at', { ascending: false })

    setCollections(availableCollections || [])

    // Load usage log
    if (currentPool) {
      const { data: logs } = await supabase
        .from('milk_usage_log')
        .select('*')
        .eq('milk_pool_id', currentPool.id)
        .order('used_at', { ascending: false })
        .limit(20)
          
      setUsageLog(logs || [])
      
      // Load products for the usage form
      const { data: prodData } = await supabase
        .from('products')
        .select('id, name, sku')
        .order('name')
          
      setProducts(prodData || [])
    }

    // Load archived pools
    const { data: archivedData } = await supabase.rpc('get_archived_pools')
    if (archivedData) {
      setArchivedPools(typeof archivedData === 'string' ? JSON.parse(archivedData) : archivedData)
    }

    setLoading(false)
  }

  const handleAddToPool = async () => {
    if (selectedCollections.length === 0 || !pool) return
    
    setProcessing(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: appUser } = await supabase
        .from('app_users')
        .select('id')
        .eq('auth_uid', user?.id)
        .single()

      const { data, error } = await supabase.rpc('add_collections_to_pool', {
        p_pool_id: pool.id,
        p_collection_ids: selectedCollections,
        p_user_id: appUser?.id
      })

      if (error) throw error
      
      const result = typeof data === 'string' ? JSON.parse(data) : data
      if (!result.success) throw new Error(result.error)

      alert(`Added ${result.added_liters}L to pool. New avg fat: ${result.new_avg_fat?.toFixed(2)}%`)
      setSelectedCollections([])
      loadData()
    } catch (err: any) {
      alert('Failed: ' + err.message)
    } finally {
      setProcessing(false)
    }
  }

  const handleUseMilk = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pool) return

    setProcessing(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: appUser } = await supabase
        .from('app_users')
        .select('id')
        .eq('auth_uid', user?.id)
        .single()

      const useLiters = parseFloat(useForm.liters)
      const manualFatPercent = parseFloat(useForm.fat_percent)
      const manualSnfPercent = parseFloat(useForm.snf_percent)
      
      // Validate inputs
      if (useLiters <= 0 || useLiters > pool.remaining_milk_liters) {
        throw new Error('Invalid quantity')
      }
      
      const maxFat = pool.remaining_fat_units / useLiters
      if (manualFatPercent > maxFat) {
        throw new Error(`Fat % cannot exceed ${maxFat.toFixed(2)}%`)
      }

      const maxSnf = pool.remaining_snf_units / useLiters
      if (manualSnfPercent > maxSnf) {
        throw new Error(`SNF % cannot exceed ${maxSnf.toFixed(2)}%`)
      }

      // Calculate fat usage
      const usedFatUnits = useLiters * manualFatPercent
      const newRemainingLiters = pool.remaining_milk_liters - useLiters
      const newRemainingFatUnits = pool.remaining_fat_units - usedFatUnits
      const newAvgFat = newRemainingLiters > 0 ? (newRemainingFatUnits / newRemainingLiters) : 0

      // Calculate SNF usage
      const usedSnfUnits = useLiters * manualSnfPercent
      const newRemainingSnfUnits = pool.remaining_snf_units - usedSnfUnits
      const newAvgSnf = newRemainingLiters > 0 ? (newRemainingSnfUnits / newRemainingLiters) : 0

      // Insert usage log
      const { data: usageData, error: usageError } = await supabase
        .from('milk_usage_log')
        .insert({
          milk_pool_id: pool.id,
          used_liters: useLiters,
          manual_fat_percent: manualFatPercent,
          manual_snf_percent: manualSnfPercent,
          used_fat_units: usedFatUnits,
          used_snf_units: usedSnfUnits,
          remaining_liters_after: newRemainingLiters,
          remaining_fat_units_after: newRemainingFatUnits,
          remaining_avg_fat_after: newAvgFat,
          remaining_avg_snf_after: newAvgSnf,
          purpose: useForm.purpose || null
        })
        .select()
        .single()

      if (usageError) throw usageError

      // Update pool
      const { error: poolError } = await supabase
        .from('milk_pool')
        .update({
          remaining_milk_liters: newRemainingLiters,
          remaining_fat_units: newRemainingFatUnits,
          remaining_snf_units: newRemainingSnfUnits,
          current_avg_fat: newAvgFat,
          current_avg_snf: newAvgSnf
        })
        .eq('id', pool.id)

      if (poolError) throw poolError

      // Create inventory items
      const validItems = inventoryItems.filter(i => i.product_id && i.quantity)
      if (validItems.length > 0) {
        const inventoryRecords = validItems.map(item => ({
          product_id: item.product_id,
          qty: parseFloat(item.quantity),
          fat_percent: manualFatPercent,
          uom: item.unit
        }))

        const { error: invError } = await supabase
          .from('inventory_items')
          .insert(inventoryRecords)

        if (invError) throw invError
      }

      alert(`Used ${useLiters}L @ ${manualFatPercent}% fat, ${manualSnfPercent}% SNF. ${validItems.length} inventory items created.`)
      setShowUseModal(false)
      setUseForm({ liters: '', fat_percent: '', snf_percent: '', purpose: '' })
      setInventoryItems([])
      loadData()
    } catch (err: any) {
      alert('Failed: ' + err.message)
    } finally {
      setProcessing(false)
    }
  }

  const handleResetPool = async () => {
    if (!pool) return

    setProcessing(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: appUser } = await supabase
        .from('app_users')
        .select('id')
        .eq('auth_uid', user?.id)
        .single()

      const response = await fetch('/api/reset-pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pool_id: pool.id,
          user_id: appUser?.id
        })
      })

      const result = await response.json()
      if (!result.success) throw new Error(result.error)

      alert(`${result.message}\n\nSummary:\n` +
        `• Milk Used: ${result.summary?.milk_used?.toFixed(2) || 0}L\n` +
        `• Collections: ${result.summary?.collections_count || 0}\n` +
        `• Usages: ${result.summary?.usage_count || 0}\n` +
        `• Inventory Items: ${result.summary?.inventory_count || 0}`)
      
      setShowResetConfirm(false)
      loadData()
    } catch (err: any) {
      alert('Failed to reset: ' + err.message)
    } finally {
      setProcessing(false)
    }
  }

  const toggleCollection = (id: string) => {
    setSelectedCollections(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  const addInventoryItem = () => {
    setInventoryItems([...inventoryItems, { product_id: '', quantity: '', unit: 'L' }])
  }

  const updateInventoryItem = (index: number, field: keyof InventoryItem, value: string) => {
    const updated = [...inventoryItems]
    updated[index][field] = value
    setInventoryItems(updated)
  }

  const removeInventoryItem = (index: number) => {
    setInventoryItems(inventoryItems.filter((_, i) => i !== index))
  }

  const getMaxFatPercent = () => {
    if (!pool || !useForm.liters || parseFloat(useForm.liters) <= 0) return 0
    return (pool.remaining_fat_units / parseFloat(useForm.liters)).toFixed(2)
  }

  const getMaxSnfPercent = () => {
    if (!pool || !useForm.liters || parseFloat(useForm.liters) <= 0) return 0
    return (pool.remaining_snf_units / parseFloat(useForm.liters)).toFixed(2)
  }

  if (loading) return <div className="text-center py-12">Loading...</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Milk Pool</h1>
          <p className="text-gray-600 mt-1">Direct milk usage with fat tracking and inventory creation</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push('/dashboard/milk-pool/books')}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-medium"
          >
            📚 View Books History
          </button>
          <button
            onClick={() => setShowUseModal(true)}
            disabled={!pool || pool.remaining_milk_liters <= 0}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"
          >
            Use Milk
          </button>
          <button
            onClick={() => setShowResetConfirm(true)}
            disabled={!pool}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"
          >
            Reset Pool
          </button>
        </div>
      </div>

      {/* Pool Stats */}
      {pool && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Total Milk</div>
            <div className="text-2xl font-bold text-blue-600">{pool.total_milk_liters?.toFixed(2) || 0}L</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Original Avg Fat</div>
            <div className="text-2xl font-bold text-purple-600">{pool.original_avg_fat?.toFixed(2) || 0}%</div>
            <div className="text-xs text-gray-400">🔒 Locked</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Original Avg SNF</div>
            <div className="text-2xl font-bold text-purple-600">{pool.original_avg_snf?.toFixed(2) || 0}%</div>
            <div className="text-xs text-gray-400">🔒 Locked</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-2 border-green-500">
            <div className="text-sm text-gray-600">Remaining Milk</div>
            <div className="text-2xl font-bold text-green-600">{pool.remaining_milk_liters?.toFixed(2) || 0}L</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-2 border-orange-500">
            <div className="text-sm text-gray-600">Current Avg Fat</div>
            <div className="text-2xl font-bold text-orange-600">{pool.current_avg_fat?.toFixed(2) || 0}%</div>
            <div className="text-xs text-gray-400">Auto-adjusted</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-2 border-orange-500">
            <div className="text-sm text-gray-600">Current Avg SNF</div>
            <div className="text-2xl font-bold text-orange-600">{pool.current_avg_snf?.toFixed(2) || 0}%</div>
            <div className="text-xs text-gray-400">Auto-adjusted</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Fat Units Left</div>
            <div className="text-2xl font-bold text-gray-600">{pool.remaining_fat_units?.toFixed(2) || 0}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">SNF Units Left</div>
            <div className="text-2xl font-bold text-gray-600">{pool.remaining_snf_units?.toFixed(2) || 0}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Add Collections */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Add Collections to Pool</h2>
            <button
              onClick={handleAddToPool}
              disabled={selectedCollections.length === 0 || processing}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded font-medium text-sm disabled:opacity-50"
            >
              {processing ? 'Adding...' : `Add ${selectedCollections.length} Selected`}
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {collections.length > 0 ? (
              collections.map((c) => (
                <div
                  key={c.id}
                  onClick={() => toggleCollection(c.id)}
                  className={`flex items-center p-3 border-b cursor-pointer hover:bg-gray-50 ${
                    selectedCollections.includes(c.id) ? 'bg-blue-50' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedCollections.includes(c.id)}
                    onChange={() => {}}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <div className="ml-3 flex-1">
                    <div className="font-medium text-gray-900">{c.suppliers?.name}</div>
                    <div className="text-sm text-gray-700">
                      {c.qty_liters}L • Fat: {c.fat}% • SNF: {c.snf || 'N/A'}%
                    </div>
                  </div>
                  <div className="text-xs text-gray-600">
                    {new Date(c.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-gray-700">
                No approved collections available
              </div>
            )}
          </div>
        </div>

        {/* Usage History */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Usage History</h2>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={usageStartDate}
                onChange={(e) => setUsageStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white text-sm"
              />
              <input
                type="date"
                value={usageEndDate}
                onChange={(e) => setUsageEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white text-sm"
              />
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {usageLog.filter(log => {
              const logDate = new Date(log.used_at).toISOString().split('T')[0];
              if (usageStartDate && logDate < usageStartDate) return false;
              if (usageEndDate && logDate > usageEndDate) return false;
              return true;
            }).length > 0 ? (
              usageLog.filter(log => {
                const logDate = new Date(log.used_at).toISOString().split('T')[0];
                if (usageStartDate && logDate < usageStartDate) return false;
                if (usageEndDate && logDate > usageEndDate) return false;
                return true;
              }).map((log) => (
                <div key={log.id} className="p-3 border-b">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium text-gray-900">
                        {log.used_liters}L @ {log.manual_fat_percent}% fat, {log.manual_snf_percent || 0}% SNF
                      </div>
                      <div className="text-sm text-gray-700">
                        Fat units: {log.used_fat_units?.toFixed(2)} • SNF units: {log.used_snf_units?.toFixed(2) || '0.00'}
                      </div>
                      <div className="text-sm text-gray-500">
                        After: Fat {log.remaining_avg_fat_after?.toFixed(2)}% • SNF {log.remaining_avg_snf_after?.toFixed(2) || '0.00'}%
                      </div>
                      {log.purpose && (
                        <div className="text-xs text-gray-600 mt-1">{log.purpose}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-600">
                        {new Date(log.used_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-gray-700">
                No usage history yet
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Archived Pools Section */}
      {archivedPools.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Previous Pools (Archived)</h2>
          </div>
          <div className="divide-y">
            {archivedPools.map((archive) => (
              <div key={archive.id} className="p-4">
                <div
                  className="flex justify-between items-center cursor-pointer"
                  onClick={() => setExpandedArchive(expandedArchive === archive.id ? null : archive.id)}
                >
                  <div>
                    <div className="font-medium text-gray-900">
                      {archive.pool_name} 
                      <span className="ml-2 text-xs bg-gray-200 px-2 py-1 rounded">Archived</span>
                    </div>
                    <div className="text-sm text-gray-600">
                      Total: {archive.total_milk_liters?.toFixed(2)}L • 
                      Remaining at reset: {archive.remaining_milk_liters?.toFixed(2)}L • 
                      Original Fat: {archive.original_avg_fat?.toFixed(2)}% • 
                      Original SNF: {(archive as any).original_avg_snf?.toFixed(2) || '0.00'}%
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {archive.usage_count} usages • {archive.collections_count} collections • 
                      Archived: {new Date(archive.archived_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-gray-400">
                    {expandedArchive === archive.id ? '▼' : '▶'}
                  </div>
                </div>

                {/* Expanded Archive Details */}
                {expandedArchive === archive.id && archive.snapshot_data && (
                  <div className="mt-4 pl-4 border-l-2 border-gray-200 space-y-4">
                    {/* Usage History */}
                    {archive.snapshot_data.usage_history?.length > 0 && (
                      <div>
                        <h4 className="font-medium text-gray-800 mb-2">Usage History</h4>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50">
                                <th className="px-2 py-1 text-left">Date</th>
                                <th className="px-2 py-1 text-left">Liters</th>
                                <th className="px-2 py-1 text-left">Fat %</th>
                                <th className="px-2 py-1 text-left">Fat Units</th>
                                <th className="px-2 py-1 text-left">SNF %</th>
                                <th className="px-2 py-1 text-left">SNF Units</th>
                                <th className="px-2 py-1 text-left">Purpose</th>
                              </tr>
                            </thead>
                            <tbody>
                              {archive.snapshot_data.usage_history.map((usage: any, idx: number) => (
                                <tr key={idx} className="border-t">
                                  <td className="px-2 py-1">{new Date(usage.used_at).toLocaleDateString()}</td>
                                  <td className="px-2 py-1">{usage.used_liters}L</td>
                                  <td className="px-2 py-1">{usage.manual_fat_percent}%</td>
                                  <td className="px-2 py-1">{usage.used_fat_units?.toFixed(2)}</td>
                                  <td className="px-2 py-1">{usage.manual_snf_percent || 0}%</td>
                                  <td className="px-2 py-1">{usage.used_snf_units?.toFixed(2) || '0.00'}</td>
                                  <td className="px-2 py-1">{usage.purpose || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Collections */}
                    {archive.snapshot_data.collections?.length > 0 && (
                      <div>
                        <h4 className="font-medium text-gray-800 mb-2">Collections Added</h4>
                        <div className="text-sm text-gray-600">
                          {archive.snapshot_data.collections.length} collections totaling{' '}
                          {archive.snapshot_data.collections.reduce((sum: number, c: any) => sum + (c.qty_liters || 0), 0).toFixed(2)}L
                        </div>
                      </div>
                    )}

                    {/* Inventory Items */}
                    {archive.snapshot_data.inventory_items?.length > 0 && (
                      <div>
                        <h4 className="font-medium text-gray-800 mb-2">Inventory Created</h4>
                        <div className="text-sm text-gray-600">
                          {archive.snapshot_data.inventory_items.length} items produced
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Use Milk Modal */}
      {showUseModal && pool && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4 text-gray-900">Use Milk from Pool</h2>
            
            <div className="bg-blue-50 p-3 rounded-lg mb-4 border border-blue-200">
              <div className="text-sm text-blue-900">
                <div>Available: <strong className="text-blue-800">{pool.remaining_milk_liters?.toFixed(2)}L</strong></div>
                <div>Current Avg Fat: <strong className="text-blue-800">{pool.current_avg_fat?.toFixed(2)}%</strong> | Current Avg SNF: <strong className="text-blue-800">{pool.current_avg_snf?.toFixed(2)}%</strong></div>
                <div>Fat Units Left: <strong className="text-blue-800">{pool.remaining_fat_units?.toFixed(2)}</strong> | SNF Units Left: <strong className="text-blue-800">{pool.remaining_snf_units?.toFixed(2)}</strong></div>
              </div>
            </div>

            <form onSubmit={handleUseMilk} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity (Liters) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.001"
                  max={pool.remaining_milk_liters}
                  required
                  value={useForm.liters}
                  onChange={(e) => setUseForm({ ...useForm, liters: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                  placeholder="Enter liters to use"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Manual Fat % <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={useForm.fat_percent}
                  onChange={(e) => setUseForm({ ...useForm, fat_percent: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                  placeholder="Enter desired fat %"
                />
                {useForm.liters && (
                  <p className="text-xs text-gray-500 mt-1">
                    Max possible: {getMaxFatPercent()}%
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Manual SNF % <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={useForm.snf_percent}
                  onChange={(e) => setUseForm({ ...useForm, snf_percent: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                  placeholder="Enter desired SNF %"
                />
                {useForm.liters && (
                  <p className="text-xs text-gray-500 mt-1">
                    Max possible: {getMaxSnfPercent()}%
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purpose (optional)</label>
                <input
                  type="text"
                  value={useForm.purpose}
                  onChange={(e) => setUseForm({ ...useForm, purpose: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                  placeholder="e.g., paneer, butter, ghee, etc."
                />
              </div>

              {/* Inventory Items Section */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">Inventory Items to Create</label>
                  <button
                    type="button"
                    onClick={addInventoryItem}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    + Add Item
                  </button>
                </div>
                
                {inventoryItems.map((item, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <select
                      value={item.product_id}
                      onChange={(e) => updateInventoryItem(index, 'product_id', e.target.value)}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 bg-white"
                    >
                      <option value="">Select product</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      value={item.quantity}
                      onChange={(e) => updateInventoryItem(index, 'quantity', e.target.value)}
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 bg-white"
                      placeholder="Qty"
                    />
                    <select
                      value={item.unit}
                      onChange={(e) => updateInventoryItem(index, 'unit', e.target.value)}
                      className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 bg-white"
                    >
                      <option value="L">L</option>
                      <option value="kg">kg</option>
                      <option value="pcs">pcs</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => removeInventoryItem(index)}
                      className="text-red-500 hover:text-red-700 px-2"
                    >
                      ×
                    </button>
                  </div>
                ))}

                {inventoryItems.length === 0 && (
                  <p className="text-xs text-gray-500">No inventory items. Add items to create inventory from this usage.</p>
                )}
              </div>

              {/* Preview calculation */}
              {useForm.liters && useForm.fat_percent && useForm.snf_percent && (
                <div className="bg-yellow-50 p-3 rounded-lg text-sm border border-yellow-200">
                  <div className="font-medium mb-1 text-yellow-900">Preview:</div>
                  <div className="text-yellow-800">Fat units to use: {(parseFloat(useForm.liters) * parseFloat(useForm.fat_percent)).toFixed(2)}</div>
                  <div className="text-yellow-800">SNF units to use: {(parseFloat(useForm.liters) * parseFloat(useForm.snf_percent)).toFixed(2)}</div>
                  <div className="text-yellow-800">
                    Remaining after: {(pool.remaining_milk_liters - parseFloat(useForm.liters)).toFixed(2)}L
                  </div>
                  <div className="text-yellow-800">
                    New avg fat: {
                      ((pool.remaining_fat_units - parseFloat(useForm.liters) * parseFloat(useForm.fat_percent)) / 
                      (pool.remaining_milk_liters - parseFloat(useForm.liters))).toFixed(2)
                    }%
                  </div>
                  <div className="text-yellow-800">
                    New avg SNF: {
                      ((pool.remaining_snf_units - parseFloat(useForm.liters) * parseFloat(useForm.snf_percent)) / 
                      (pool.remaining_milk_liters - parseFloat(useForm.liters))).toFixed(2)
                    }%
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={processing}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium disabled:opacity-50"
                >
                  {processing ? 'Processing...' : 'Use Milk'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowUseModal(false)
                    setUseForm({ liters: '', fat_percent: '', snf_percent: '', purpose: '' })
                    setInventoryItems([])
                  }}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 rounded-lg font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Pool Confirmation Modal */}
      {showResetConfirm && pool && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-red-600">Reset Pool?</h2>
            
            <div className="bg-red-50 p-4 rounded-lg mb-4 border border-red-200">
              <p className="text-red-800 font-medium mb-2">This will:</p>
              <ul className="text-sm text-red-700 list-disc list-inside space-y-1">
                <li>Archive current pool data ({pool.total_milk_liters?.toFixed(2)}L)</li>
                <li>Save all usage history ({usageLog.length} records)</li>
                <li>Create a new empty pool</li>
                <li>Set everything to zero</li>
              </ul>
            </div>

            <p className="text-gray-600 text-sm mb-4">
              The archived data will be visible in the "Previous Pools" section below.
            </p>

            <div className="flex gap-3">
              <button
                onClick={handleResetPool}
                disabled={processing}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg font-medium disabled:opacity-50"
              >
                {processing ? 'Resetting...' : 'Yes, Reset Pool'}
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 rounded-lg font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
