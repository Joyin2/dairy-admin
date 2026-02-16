'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

interface ProductReturn {
  id: string
  shop_id: string
  route_id: string
  agent_id: string
  allocation_id: string | null
  return_date: string
  return_type: string
  status: string
  total_items: number
  total_quantity: number
  total_value: number
  notes: string | null
  admin_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  shop?: { name: string; owner_name: string; city: string }
  route?: { name: string; area: string }
  agent?: { name: string; email: string }
  reviewed_by_user?: { name: string }
  items?: ProductReturnItem[]
}

interface ProductReturnItem {
  id: string
  return_id: string
  product_name: string
  batch_number: string
  packaging_type: string | null
  package_size: string | null
  quantity_returned: number
  unit: string
  price_per_unit: number
  total_value: number
  reason: string
  reason_note: string | null
  photo_url: string | null
  disposition: string
  admin_notes: string | null
  inventory_item_id: string | null
  delivery_sale_id: string | null
}

interface WasteEntry {
  id: string
  product_name: string
  batch_number: string
  quantity: number
  unit: string
  value_loss: number
  reason: string
  reason_note: string | null
  shop_name: string | null
  agent_name: string | null
  created_at: string
}

type TabView = 'pending' | 'return_ledger' | 'waste_ledger'

const REASON_LABELS: Record<string, { label: string; icon: string }> = {
  expired: { label: 'Expired', icon: '⏰' },
  damaged: { label: 'Damaged', icon: '💔' },
  leakage: { label: 'Leakage', icon: '💧' },
  wrong_supply: { label: 'Wrong Supply', icon: '❌' },
  customer_complaint: { label: 'Customer Complaint', icon: '😤' },
  other: { label: 'Other', icon: '📝' },
}

export default function ProductReturnsPage() {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<TabView>('pending')
  const [returns, setReturns] = useState<ProductReturn[]>([])
  const [wasteEntries, setWasteEntries] = useState<WasteEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [selectedReturn, setSelectedReturn] = useState<ProductReturn | null>(null)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [summary, setSummary] = useState({
    pending: 0,
    approved: 0,
    totalPendingValue: 0,
    totalWasteValue: 0,
  })

  useEffect(() => {
    fetchData()
  }, [statusFilter, activeTab])

  const fetchData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        fetchReturns(),
        fetchSummary(),
        activeTab === 'waste_ledger' ? fetchWasteLedger() : Promise.resolve(),
      ])
    } catch (err) {
      console.error('Error:', err)
    }
    setLoading(false)
  }

  const fetchSummary = async () => {
    const { data } = await supabase
      .from('product_returns')
      .select('status, total_value')

    if (data) {
      const pending = data.filter(r => r.status === 'pending').length
      const approved = data.filter(r => ['approved_restock', 'approved_waste', 'partial'].includes(r.status)).length
      const totalPendingValue = data
        .filter(r => r.status === 'pending')
        .reduce((sum, r) => sum + parseFloat(String(r.total_value || 0)), 0)

      const { data: wasteData } = await supabase
        .from('waste_ledger')
        .select('value_loss')

      const totalWasteValue = (wasteData || [])
        .reduce((sum, w) => sum + parseFloat(String(w.value_loss || 0)), 0)

      setSummary({ pending, approved, totalPendingValue, totalWasteValue })
    }
  }

  const fetchReturns = async () => {
    let query = supabase
      .from('product_returns')
      .select('*')
      .order('created_at', { ascending: false })

    if (activeTab === 'pending') {
      if (statusFilter) {
        query = query.eq('status', statusFilter)
      }
    } else if (activeTab === 'return_ledger') {
      query = query.in('status', ['approved_restock', 'approved_waste', 'partial', 'rejected'])
    }

    const { data, error } = await query
    if (error) {
      console.error('Error fetching returns:', error)
      return
    }

    // Enrich with related data
    const enriched = await Promise.all(
      (data || []).map(async (ret: any) => {
        const [shopRes, routeRes, agentRes, reviewerRes, itemsRes] = await Promise.all([
          ret.shop_id ? supabase.from('shops').select('name, owner_name, city').eq('id', ret.shop_id).single() : Promise.resolve({ data: null }),
          ret.route_id ? supabase.from('routes').select('name, area').eq('id', ret.route_id).single() : Promise.resolve({ data: null }),
          supabase.from('app_users').select('name, email').eq('id', ret.agent_id).single(),
          ret.reviewed_by ? supabase.from('app_users').select('name').eq('id', ret.reviewed_by).single() : Promise.resolve({ data: null }),
          supabase.from('product_return_items').select('*').eq('return_id', ret.id),
        ])
        return {
          ...ret,
          shop: shopRes.data,
          route: routeRes.data,
          agent: agentRes.data,
          reviewed_by_user: reviewerRes.data,
          items: itemsRes.data || [],
        }
      })
    )
    setReturns(enriched)
  }

  const fetchWasteLedger = async () => {
    const { data, error } = await supabase
      .from('waste_ledger')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error) {
      setWasteEntries(data || [])
    }
  }

  const handleApproveRestock = async (returnReq: ProductReturn) => {
    if (!returnReq.items?.length) return
    setProcessing(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      let adminId = null
      if (user) {
        const { data: appUser } = await supabase.from('app_users').select('id').eq('auth_uid', user.id).single()
        adminId = appUser?.id
      }

      for (const item of returnReq.items) {
        await supabase.from('product_return_items').update({ disposition: 'restock' }).eq('id', item.id)

        // Add back to inventory
        if (item.inventory_item_id) {
          const { data: invItem } = await supabase.from('production_inventory').select('quantity').eq('id', item.inventory_item_id).single()
          if (invItem) {
            await supabase.from('production_inventory').update({
              quantity: parseFloat(String(invItem.quantity)) + item.quantity_returned
            }).eq('id', item.inventory_item_id)
          }
        }
      }

      // Update return status
      await supabase.from('product_returns').update({
        status: 'approved_restock',
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        admin_notes: 'All items approved for restock',
      }).eq('id', returnReq.id)

      setSelectedReturn(null)
      fetchData()
    } catch (err) {
      console.error('Error:', err)
    }
    setProcessing(false)
  }

  const handleApproveWaste = async (returnReq: ProductReturn) => {
    if (!returnReq.items?.length) return
    setProcessing(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      let adminId = null
      if (user) {
        const { data: appUser } = await supabase.from('app_users').select('id').eq('auth_uid', user.id).single()
        adminId = appUser?.id
      }

      for (const item of returnReq.items) {
        await supabase.from('product_return_items').update({ disposition: 'waste' }).eq('id', item.id)

        // Add to waste ledger
        await supabase.from('waste_ledger').insert({
          product_return_item_id: item.id,
          product_name: item.product_name,
          batch_number: item.batch_number,
          quantity: item.quantity_returned,
          unit: item.unit,
          value_loss: item.total_value,
          reason: item.reason,
          reason_note: item.reason_note,
          shop_name: returnReq.shop?.name || null,
          agent_name: returnReq.agent?.name || null,
          created_by: adminId,
        })
      }

      await supabase.from('product_returns').update({
        status: 'approved_waste',
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        admin_notes: 'All items marked as waste',
      }).eq('id', returnReq.id)

      setSelectedReturn(null)
      fetchData()
    } catch (err) {
      console.error('Error:', err)
    }
    setProcessing(false)
  }

  const handleReject = async (returnReq: ProductReturn) => {
    if (!returnReq.items?.length) return
    setProcessing(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      let adminId = null
      if (user) {
        const { data: appUser } = await supabase.from('app_users').select('id').eq('auth_uid', user.id).single()
        adminId = appUser?.id
      }

      for (const item of returnReq.items) {
        await supabase.from('product_return_items').update({ disposition: 'rejected' }).eq('id', item.id)
      }

      await supabase.from('product_returns').update({
        status: 'rejected',
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        admin_notes: 'Return request rejected',
      }).eq('id', returnReq.id)

      setSelectedReturn(null)
      fetchData()
    } catch (err) {
      console.error('Error:', err)
    }
    setProcessing(false)
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending' },
      approved_restock: { bg: 'bg-green-100', text: 'text-green-800', label: 'Restocked' },
      approved_waste: { bg: 'bg-red-100', text: 'text-red-800', label: 'Waste' },
      partial: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Partial' },
      rejected: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Rejected' },
    }
    const s = styles[status] || styles.pending
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
        {s.label}
      </span>
    )
  }

  const getReasonBadge = (reason: string) => {
    const r = REASON_LABELS[reason] || { label: reason, icon: '❓' }
    return `${r.icon} ${r.label}`
  }

  const tabs: { id: TabView; label: string; icon: string }[] = [
    { id: 'pending', label: 'Pending Approvals', icon: '⏳' },
    { id: 'return_ledger', label: 'Return Ledger', icon: '📒' },
    { id: 'waste_ledger', label: 'Waste Ledger', icon: '🗑️' },
  ]

  const statusFilters = [
    { value: 'pending', label: 'Pending' },
    { value: 'approved_restock', label: 'Restocked' },
    { value: 'approved_waste', label: 'Waste' },
    { value: 'rejected', label: 'Rejected' },
    { value: '', label: 'All' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Product Returns</h1>
        <p className="text-sm text-gray-600 mt-1">Shop product returns - approval, inventory & waste management</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
          <p className="text-xs text-gray-500 uppercase font-medium">Pending Returns</p>
          <p className="text-2xl font-bold text-yellow-600">{summary.pending}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-500">
          <p className="text-xs text-gray-500 uppercase font-medium">Pending Value</p>
          <p className="text-2xl font-bold text-orange-600">Rs {summary.totalPendingValue.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
          <p className="text-xs text-gray-500 uppercase font-medium">Processed</p>
          <p className="text-2xl font-bold text-green-600">{summary.approved}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
          <p className="text-xs text-gray-500 uppercase font-medium">Total Waste Loss</p>
          <p className="text-2xl font-bold text-red-600">Rs {summary.totalWasteValue.toFixed(2)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Pending Approvals Tab */}
      {activeTab === 'pending' && (
        <>
          {/* Status Filter */}
          <div className="flex gap-2 flex-wrap">
            {statusFilters.map(s => (
              <button
                key={s.value}
                onClick={() => setStatusFilter(s.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === s.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading...</div>
          ) : returns.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <div className="text-5xl mb-4">🔄</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Product Returns</h3>
              <p className="text-gray-600">
                {statusFilter === 'pending' ? 'No pending product returns to review.' : 'No returns found.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {returns.map(ret => (
                <div key={ret.id} className="bg-white rounded-lg shadow overflow-hidden">
                  <div className="p-6">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {ret.shop?.name || 'Unknown Shop'}
                          </h3>
                          {getStatusBadge(ret.status)}
                        </div>
                        <p className="text-sm text-gray-500">
                          Agent: {ret.agent?.name || 'Unknown'} | Route: {ret.route?.name || '-'}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(ret.created_at).toLocaleString()} | Type: {ret.return_type === 'sale_return' ? 'Sale Return' : 'Delivery Return'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-gray-900">Rs {parseFloat(String(ret.total_value)).toFixed(2)}</p>
                        <p className="text-sm text-gray-500">{ret.total_items} items | {parseFloat(String(ret.total_quantity)).toFixed(1)} units</p>
                      </div>
                    </div>

                    {/* Items Table */}
                    {ret.items && ret.items.length > 0 && (
                      <div className="border rounded-lg overflow-hidden mb-4">
                        <table className="w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Reason</th>
                              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {ret.items.map(item => (
                              <tr key={item.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3">
                                  <div className="text-sm font-medium text-gray-900">{item.product_name}</div>
                                  {item.packaging_type && (
                                    <div className="text-xs text-gray-500">{item.packaging_type} {item.package_size ? `(${item.package_size})` : ''}</div>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-sm text-blue-600 font-mono">{item.batch_number}</td>
                                <td className="px-4 py-3 text-sm text-right font-semibold">{parseFloat(String(item.quantity_returned)).toFixed(1)} {item.unit}</td>
                                <td className="px-4 py-3 text-sm text-right font-semibold">Rs {parseFloat(String(item.total_value)).toFixed(2)}</td>
                                <td className="px-4 py-3 text-center">
                                  <span className="text-xs">{getReasonBadge(item.reason)}</span>
                                  {item.reason_note && (
                                    <div className="text-xs text-gray-400 mt-1">{item.reason_note}</div>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {item.disposition === 'pending' && <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded">Pending</span>}
                                  {item.disposition === 'restock' && <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">Restocked</span>}
                                  {item.disposition === 'waste' && <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded">Waste</span>}
                                  {item.disposition === 'rejected' && <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">Rejected</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Action Buttons */}
                    {ret.status === 'pending' && (
                      <div className="flex gap-3 pt-4 border-t border-gray-200">
                        <button
                          onClick={() => handleApproveRestock(ret)}
                          disabled={processing}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                          ✓ Approve & Restock
                        </button>
                        <button
                          onClick={() => setSelectedReturn(ret)}
                          disabled={processing}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                          Review Items
                        </button>
                        <button
                          onClick={() => handleApproveWaste(ret)}
                          disabled={processing}
                          className="flex-1 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                          🗑️ Mark as Waste
                        </button>
                        <button
                          onClick={() => handleReject(ret)}
                          disabled={processing}
                          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                          ✗ Reject
                        </button>
                      </div>
                    )}

                    {/* Reviewed Info */}
                    {ret.reviewed_by_user && (
                      <div className="mt-3 pt-3 border-t border-gray-100 text-sm text-gray-500">
                        Reviewed by {ret.reviewed_by_user.name} on {ret.reviewed_at ? new Date(ret.reviewed_at).toLocaleString() : '-'}
                        {ret.admin_notes && <span className="ml-2 text-gray-400">| {ret.admin_notes}</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Return Ledger Tab */}
      {activeTab === 'return_ledger' && (
        <>
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading...</div>
          ) : returns.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <div className="text-5xl mb-4">📒</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Processed Returns</h3>
              <p className="text-gray-600">Approved or rejected returns will appear here.</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shop</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {returns.flatMap(ret =>
                    (ret.items || []).map(item => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-600">{new Date(ret.return_date).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{ret.shop?.name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{item.product_name}</td>
                        <td className="px-4 py-3 text-sm text-blue-600 font-mono">{item.batch_number}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold">{parseFloat(String(item.quantity_returned)).toFixed(1)} {item.unit}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold">Rs {parseFloat(String(item.total_value)).toFixed(2)}</td>
                        <td className="px-4 py-3 text-center">{getStatusBadge(ret.status)}</td>
                        <td className="px-4 py-3 text-center">
                          {item.disposition === 'restock' && <span className="text-xs text-green-700">Restocked</span>}
                          {item.disposition === 'waste' && <span className="text-xs text-red-700">Wasted</span>}
                          {item.disposition === 'rejected' && <span className="text-xs text-gray-700">Rejected</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Waste Ledger Tab */}
      {activeTab === 'waste_ledger' && (
        <>
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading...</div>
          ) : wasteEntries.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <div className="text-5xl mb-4">🗑️</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Waste Entries</h3>
              <p className="text-gray-600">Products marked as waste will appear here.</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Reason</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value Loss</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shop</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {wasteEntries.map(entry => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600">{new Date(entry.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{entry.product_name}</td>
                      <td className="px-4 py-3 text-sm text-blue-600 font-mono">{entry.batch_number}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">{parseFloat(String(entry.quantity)).toFixed(1)} {entry.unit}</td>
                      <td className="px-4 py-3 text-center text-sm">{getReasonBadge(entry.reason)}</td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-red-600">Rs {parseFloat(String(entry.value_loss)).toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{entry.shop_name || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{entry.agent_name || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Waste Summary */}
              <div className="p-4 bg-red-50 border-t border-red-200">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-red-800">Total Waste Loss</span>
                  <span className="text-lg font-bold text-red-700">
                    Rs {wasteEntries.reduce((sum, e) => sum + parseFloat(String(e.value_loss || 0)), 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Review Modal */}
      {selectedReturn && (
        <ReviewModal
          returnRequest={selectedReturn}
          onClose={() => setSelectedReturn(null)}
          onComplete={() => {
            setSelectedReturn(null)
            fetchData()
          }}
        />
      )}
    </div>
  )
}

// Review Modal - per-item disposition
function ReviewModal({
  returnRequest,
  onClose,
  onComplete,
}: {
  returnRequest: ProductReturn
  onClose: () => void
  onComplete: () => void
}) {
  const supabase = createClient()
  const [items, setItems] = useState<(ProductReturnItem & { localDisposition: string; localWasteReason: string })[]>([])
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    setItems(
      (returnRequest.items || []).map(item => ({
        ...item,
        localDisposition: 'restock',
        localWasteReason: '',
      }))
    )
  }, [returnRequest])

  const handleSubmit = async () => {
    setProcessing(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      let adminId = null
      if (user) {
        const { data: appUser } = await supabase.from('app_users').select('id').eq('auth_uid', user.id).single()
        adminId = appUser?.id
      }

      let hasRestock = false
      let hasWaste = false

      for (const item of items) {
        const isRestock = item.localDisposition === 'restock'
        if (isRestock) hasRestock = true
        else hasWaste = true

        await supabase.from('product_return_items').update({
          disposition: item.localDisposition,
          admin_notes: isRestock ? null : item.localWasteReason,
        }).eq('id', item.id)

        if (isRestock && item.inventory_item_id) {
          const { data: invItem } = await supabase.from('production_inventory').select('quantity').eq('id', item.inventory_item_id).single()
          if (invItem) {
            await supabase.from('production_inventory').update({
              quantity: parseFloat(String(invItem.quantity)) + item.quantity_returned
            }).eq('id', item.inventory_item_id)
          }
        } else if (!isRestock) {
          // Add to waste ledger
          await supabase.from('waste_ledger').insert({
            product_return_item_id: item.id,
            product_name: item.product_name,
            batch_number: item.batch_number,
            quantity: item.quantity_returned,
            unit: item.unit,
            value_loss: item.total_value,
            reason: item.reason,
            reason_note: item.localWasteReason || item.reason_note,
            shop_name: returnRequest.shop?.name || null,
            agent_name: returnRequest.agent?.name || null,
            created_by: adminId,
          })
        }
      }

      let newStatus = 'approved_restock'
      if (hasRestock && hasWaste) newStatus = 'partial'
      else if (!hasRestock && hasWaste) newStatus = 'approved_waste'

      await supabase.from('product_returns').update({
        status: newStatus,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
      }).eq('id', returnRequest.id)

      onComplete()
    } catch (err) {
      console.error('Error:', err)
    }
    setProcessing(false)
  }

  const updateItem = (itemId: string, field: string, value: string) => {
    setItems(items.map(i => i.id === itemId ? { ...i, [field]: value } : i))
  }

  const restockCount = items.filter(i => i.localDisposition === 'restock').length
  const wasteCount = items.filter(i => i.localDisposition === 'waste').length

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Review Return Items</h2>
              <p className="text-sm text-gray-600 mt-1">
                {returnRequest.shop?.name} | Agent: {returnRequest.agent?.name}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="space-y-4">
            {items.map(item => (
              <div key={item.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-semibold text-gray-900">{item.product_name}</h4>
                    <p className="text-sm text-blue-600 font-mono">Batch: {item.batch_number}</p>
                    <p className="text-sm text-gray-500">
                      Reason: {REASON_LABELS[item.reason]?.icon} {REASON_LABELS[item.reason]?.label}
                      {item.reason_note && ` - ${item.reason_note}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-900">
                      {parseFloat(String(item.quantity_returned)).toFixed(1)} {item.unit}
                    </p>
                    <p className="text-sm font-semibold text-gray-600">Rs {parseFloat(String(item.total_value)).toFixed(2)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Decision</label>
                    <select
                      value={item.localDisposition}
                      onChange={(e) => updateItem(item.id, 'localDisposition', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    >
                      <option value="restock">✓ Re-add to Inventory</option>
                      <option value="waste">✗ Mark as Waste</option>
                    </select>
                  </div>
                  {item.localDisposition === 'waste' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Waste Note</label>
                      <input
                        type="text"
                        value={item.localWasteReason}
                        onChange={(e) => updateItem(item.id, 'localWasteReason', e.target.value)}
                        placeholder="Additional waste note..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-4">
              <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                {restockCount} to Restock
              </span>
              <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
                {wasteCount} as Waste
              </span>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2.5 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={processing}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {processing ? 'Processing...' : 'Confirm & Process'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
