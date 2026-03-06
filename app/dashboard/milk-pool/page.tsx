'use client'

import { db, auth } from '@/lib/firebase/client'
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  doc,
  deleteDoc,
  updateDoc,
  addDoc,
  getDoc,
  writeBatch,
} from 'firebase/firestore'
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
    const poolSnap = await getDocs(
      query(collection(db, 'milk_pool'), where('status', '==', 'active'), limit(1))
    )

    let currentPool: MilkPool | null = null

    if (!poolSnap.empty) {
      const d = poolSnap.docs[0]
      currentPool = { id: d.id, ...d.data() } as MilkPool
    } else {
      // Create default pool
      const newPoolRef = await addDoc(collection(db, 'milk_pool'), {
        name: 'Main Pool',
        status: 'active',
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
        created_at: new Date().toISOString(),
      })
      const newPoolSnap = await getDoc(newPoolRef)
      currentPool = { id: newPoolRef.id, ...newPoolSnap.data() } as MilkPool
    }

    setPool(currentPool)

    // Load available collections (approved, not yet in pool) — fetch with supplier join
    const colSnap = await getDocs(
      query(
        collection(db, 'milk_collections'),
        where('qc_status', '==', 'approved'),
        where('status', '==', 'new'),
        orderBy('created_at', 'desc')
      )
    )
    const availableCollections = await Promise.all(
      colSnap.docs.map(async (d) => {
        const item = { id: d.id, ...d.data() } as any
        if (item.supplier_id) {
          const sSnap = await getDoc(doc(db, 'suppliers', item.supplier_id))
          item.suppliers = sSnap.exists() ? sSnap.data() : null
        }
        return item as Collection
      })
    )
    setCollections(availableCollections)

    // Load usage log and products for the active pool
    if (currentPool) {
      const logsSnap = await getDocs(
        query(
          collection(db, 'milk_usage_log'),
          where('milk_pool_id', '==', currentPool.id),
          orderBy('used_at', 'desc'),
          limit(20)
        )
      )
      setUsageLog(logsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as UsageLog)))

      const prodSnap = await getDocs(
        query(collection(db, 'products'), orderBy('name'))
      )
      setProducts(prodSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
    }

    // Load archived pools (replace RPC get_archived_pools)
    const archiveSnap = await getDocs(
      query(collection(db, 'milk_pool'), where('status', '==', 'archived'), orderBy('archived_at', 'desc'))
    )
    const archived: ArchivedPool[] = archiveSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ArchivedPool))
    setArchivedPools(archived)

    setLoading(false)
  }

  // Resolve current Firebase user's app_users doc id
  const getCurrentAppUserId = async (): Promise<string | null> => {
    const firebaseUser = auth.currentUser
    if (!firebaseUser) return null
    const appUserSnap = await getDocs(
      query(collection(db, 'app_users'), where('auth_uid', '==', firebaseUser.uid), limit(1))
    )
    if (appUserSnap.empty) return null
    return appUserSnap.docs[0].id
  }

  const handleAddToPool = async () => {
    if (selectedCollections.length === 0 || !pool) return

    setProcessing(true)
    try {
      // Fetch selected collection docs
      const collectionDocs = await Promise.all(
        selectedCollections.map((id) => getDoc(doc(db, 'milk_collections', id)))
      )

      // Compute new pool totals (implements add_collections_to_pool logic)
      let addedLiters = 0
      let addedFatUnits = 0
      let addedSnfUnits = 0

      for (const snap of collectionDocs) {
        if (!snap.exists()) continue
        const data = snap.data()
        const liters = data.qty_liters || 0
        const fat = data.fat || 0
        const snf = data.snf || 0
        addedLiters += liters
        addedFatUnits += liters * fat
        addedSnfUnits += liters * snf
      }

      const newTotalLiters = (pool.total_milk_liters || 0) + addedLiters
      const newTotalFatUnits = (pool.total_fat_units || 0) + addedFatUnits
      const newTotalSnfUnits = (pool.total_snf_units || 0) + addedSnfUnits
      const newRemainingLiters = (pool.remaining_milk_liters || 0) + addedLiters
      const newRemainingFatUnits = (pool.remaining_fat_units || 0) + addedFatUnits
      const newRemainingSnfUnits = (pool.remaining_snf_units || 0) + addedSnfUnits

      const newAvgFat = newTotalLiters > 0 ? newTotalFatUnits / newTotalLiters : 0
      const newAvgSnf = newTotalLiters > 0 ? newTotalSnfUnits / newTotalLiters : 0

      const newCurrentAvgFat = newRemainingLiters > 0 ? newRemainingFatUnits / newRemainingLiters : 0
      const newCurrentAvgSnf = newRemainingLiters > 0 ? newRemainingSnfUnits / newRemainingLiters : 0

      // Batch: update pool + mark each collection as 'in_pool'
      const batch = writeBatch(db)

      batch.update(doc(db, 'milk_pool', pool.id), {
        total_milk_liters: newTotalLiters,
        total_fat_units: newTotalFatUnits,
        total_snf_units: newTotalSnfUnits,
        original_avg_fat: newAvgFat,
        original_avg_snf: newAvgSnf,
        remaining_milk_liters: newRemainingLiters,
        remaining_fat_units: newRemainingFatUnits,
        remaining_snf_units: newRemainingSnfUnits,
        current_avg_fat: newCurrentAvgFat,
        current_avg_snf: newCurrentAvgSnf,
      })

      for (const id of selectedCollections) {
        batch.update(doc(db, 'milk_collections', id), {
          status: 'in_pool',
          pool_id: pool.id,
        })
      }

      await batch.commit()

      alert(`Added ${addedLiters.toFixed(2)}L to pool. New avg fat: ${newCurrentAvgFat.toFixed(2)}%`)
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
      const newAvgFat = newRemainingLiters > 0 ? newRemainingFatUnits / newRemainingLiters : 0

      // Calculate SNF usage
      const usedSnfUnits = useLiters * manualSnfPercent
      const newRemainingSnfUnits = pool.remaining_snf_units - usedSnfUnits
      const newAvgSnf = newRemainingLiters > 0 ? newRemainingSnfUnits / newRemainingLiters : 0

      // Insert usage log
      await addDoc(collection(db, 'milk_usage_log'), {
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
        purpose: useForm.purpose || null,
        used_at: new Date().toISOString(),
      })

      // Update pool
      await updateDoc(doc(db, 'milk_pool', pool.id), {
        remaining_milk_liters: newRemainingLiters,
        remaining_fat_units: newRemainingFatUnits,
        remaining_snf_units: newRemainingSnfUnits,
        current_avg_fat: newAvgFat,
        current_avg_snf: newAvgSnf,
      })

      // Create inventory items
      const validItems = inventoryItems.filter((i) => i.product_id && i.quantity)
      if (validItems.length > 0) {
        await Promise.all(
          validItems.map((item) =>
            addDoc(collection(db, 'inventory_items'), {
              product_id: item.product_id,
              qty: parseFloat(item.quantity),
              fat_percent: manualFatPercent,
              uom: item.unit,
              created_at: new Date().toISOString(),
            })
          )
        )
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
      const appUserId = await getCurrentAppUserId()

      const response = await fetch('/api/reset-pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pool_id: pool.id,
          user_id: appUserId,
        }),
      })

      const result = await response.json()
      if (!result.success) throw new Error(result.error)

      alert(
        `${result.message}\n\nSummary:\n` +
          `• Milk Used: ${result.summary?.milk_used?.toFixed(2) || 0}L\n` +
          `• Collections: ${result.summary?.collections_count || 0}\n` +
          `• Usages: ${result.summary?.usage_count || 0}\n` +
          `• Inventory Items: ${result.summary?.inventory_count || 0}`
      )

      setShowResetConfirm(false)
      loadData()
    } catch (err: any) {
      alert('Failed to reset: ' + err.message)
    } finally {
      setProcessing(false)
    }
  }

  const toggleCollection = (id: string) => {
    setSelectedCollections((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
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
