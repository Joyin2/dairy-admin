'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function DispatchPage() {
  const supabase = createClient()
  const [allocations, setAllocations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [summary, setSummary] = useState({
    totalDispatches: 0,
    activeAgents: 0,
    totalAllocated: 0,
    totalSold: 0,
    totalRemaining: 0,
    totalCashCollected: 0,
    totalOutstandingDues: 0,
    batchSales: [] as any[],
  })

  useEffect(() => {
    fetchAllocations()
    fetchSummary()
  }, [statusFilter])

  const fetchAllocations = async () => {
    setLoading(true)
    try {
      // First fetch allocations
      let query = supabase
        .from('agent_stock_allocations')
        .select('*')
        .order('created_at', { ascending: false })

      if (statusFilter) {
        query = query.eq('status', statusFilter)
      }

      const { data: allocData, error: allocError } = await query
      if (allocError) {
        console.error('Error fetching allocations:', JSON.stringify(allocError))
        setLoading(false)
        return
      }

      // Enrich with agent info, created_by info, and items
      const enriched = await Promise.all(
        (allocData || []).map(async (alloc: any) => {
          const [agentRes, creatorRes, itemsRes] = await Promise.all([
            supabase.from('app_users').select('name, email, phone').eq('id', alloc.agent_id).single(),
            alloc.created_by
              ? supabase.from('app_users').select('name').eq('id', alloc.created_by).single()
              : Promise.resolve({ data: null }),
            supabase.from('agent_stock_items').select('id, product_name, batch_number, packaging_type, package_size, quantity_allocated, quantity_sold, quantity_returned, unit').eq('allocation_id', alloc.id),
          ])
          return {
            ...alloc,
            agent: agentRes.data,
            created_by_user: creatorRes.data,
            items: itemsRes.data || [],
          }
        })
      )

      setAllocations(enriched)
    } catch (err: any) {
      console.error('Error fetching allocations:', err)
    }
    setLoading(false)
  }

  const fetchSummary = async () => {
    try {
      // Get all allocations with items
      const { data: allAllocs } = await supabase
        .from('agent_stock_allocations')
        .select('id, agent_id, status')

      const { data: allItems } = await supabase
        .from('agent_stock_items')
        .select('id, allocation_id, product_name, batch_number, quantity_allocated, quantity_sold, quantity_returned, unit')

      // Get cash collected from deliveries
      const { data: deliveryData } = await supabase
        .from('deliveries')
        .select('expected_amount, collected_amount, shop_id')
        .in('status', ['delivered', 'partial'])

      // Get batch-wise sales
      const { data: salesData } = await supabase
        .from('delivery_sales')
        .select('batch_number, product_name, quantity_sold, total_amount, unit')
        .order('batch_number')

      const items = allItems || []
      const allocs = allAllocs || []
      const deliveries = deliveryData || []
      const sales = salesData || []

      const totalAllocated = items.reduce((s: number, i: any) => s + parseFloat(i.quantity_allocated || 0), 0)
      const totalSold = items.reduce((s: number, i: any) => s + parseFloat(i.quantity_sold || 0), 0)
      const totalReturned = items.reduce((s: number, i: any) => s + parseFloat(i.quantity_returned || 0), 0)
      const totalCash = deliveries.reduce((s: number, d: any) => s + parseFloat(String(d.collected_amount || 0)), 0)
      const totalExpected = deliveries.reduce((s: number, d: any) => s + parseFloat(String(d.expected_amount || 0)), 0)
      const activeAgentIds = new Set(allocs.filter((a: any) => ['picked_up', 'in_delivery'].includes(a.status)).map((a: any) => a.agent_id))

      // Aggregate sales by batch
      const batchMap: Record<string, { batch: string; product: string; qtySold: number; revenue: number; unit: string }> = {}
      for (const sale of sales) {
        const key = sale.batch_number
        if (!batchMap[key]) {
          batchMap[key] = { batch: sale.batch_number, product: sale.product_name, qtySold: 0, revenue: 0, unit: sale.unit }
        }
        batchMap[key].qtySold += parseFloat(sale.quantity_sold || 0)
        batchMap[key].revenue += parseFloat(sale.total_amount || 0)
      }

      setSummary({
        totalDispatches: allocs.length,
        activeAgents: activeAgentIds.size,
        totalAllocated,
        totalSold,
        totalRemaining: totalAllocated - totalSold - totalReturned,
        totalCashCollected: totalCash,
        totalOutstandingDues: Math.max(0, totalExpected - totalCash),
        batchSales: Object.values(batchMap),
      })
    } catch (err) {
      console.error('Error fetching summary:', err)
    }
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string; label: string }> = {
      pending_pickup: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending Pickup' },
      picked_up: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Picked Up' },
      in_delivery: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'In Delivery' },
      completed: { bg: 'bg-green-100', text: 'text-green-800', label: 'Completed' },
      returned: { bg: 'bg-red-100', text: 'text-red-800', label: 'Returned' },
    }
    const s = styles[status] || styles.pending_pickup
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
        {s.label}
      </span>
    )
  }

  const getTotalItems = (items: any[]) => {
    if (!items || items.length === 0) return { count: 0, totalQty: 0, totalSold: 0, totalReturned: 0 }
    return {
      count: items.length,
      totalQty: items.reduce((sum: number, i: any) => sum + parseFloat(i.quantity_allocated || 0), 0),
      totalSold: items.reduce((sum: number, i: any) => sum + parseFloat(i.quantity_sold || 0), 0),
      totalReturned: items.reduce((sum: number, i: any) => sum + parseFloat(i.quantity_returned || 0), 0),
    }
  }

  const statuses = [
    { value: '', label: 'All' },
    { value: 'pending_pickup', label: 'Pending Pickup' },
    { value: 'picked_up', label: 'Picked Up' },
    { value: 'in_delivery', label: 'In Delivery' },
    { value: 'completed', label: 'Completed' },
    { value: 'returned', label: 'Returned' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Stock Dispatch</h1>
          <p className="text-sm text-gray-600 mt-1">Allocate and track inventory dispatched to delivery agents</p>
        </div>
        <Link
          href="/dashboard/dispatch/create"
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
        >
          + Create Dispatch
        </Link>
      </div>

      {/* Summary Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
          <p className="text-xs text-gray-500 uppercase font-medium">Total Dispatches</p>
          <p className="text-2xl font-bold text-gray-900">{summary.totalDispatches}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
          <p className="text-xs text-gray-500 uppercase font-medium">Active Agents</p>
          <p className="text-2xl font-bold text-gray-900">{summary.activeAgents}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-indigo-500">
          <p className="text-xs text-gray-500 uppercase font-medium">Stock Given</p>
          <p className="text-2xl font-bold text-gray-900">{summary.totalAllocated.toFixed(1)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
          <p className="text-xs text-gray-500 uppercase font-medium">Total Sold</p>
          <p className="text-2xl font-bold text-green-600">{summary.totalSold.toFixed(1)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
          <p className="text-xs text-gray-500 uppercase font-medium">Remaining Stock</p>
          <p className="text-2xl font-bold text-yellow-600">{summary.totalRemaining.toFixed(1)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-emerald-500">
          <p className="text-xs text-gray-500 uppercase font-medium">Cash Collected</p>
          <p className="text-2xl font-bold text-emerald-600">Rs {summary.totalCashCollected.toFixed(0)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
          <p className="text-xs text-gray-500 uppercase font-medium">Outstanding Dues</p>
          <p className="text-2xl font-bold text-red-600">Rs {summary.totalOutstandingDues.toFixed(0)}</p>
        </div>
      </div>

      {/* Batch-wise Sales */}
      {summary.batchSales.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Batch-wise Sales Tracking</h3>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty Sold</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {summary.batchSales.map((bs: any, idx: number) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-sm font-medium text-blue-600">{bs.batch}</td>
                  <td className="px-6 py-3 text-sm text-gray-900">{bs.product}</td>
                  <td className="px-6 py-3 text-sm text-right font-semibold text-gray-900">{bs.qtySold.toFixed(1)} {bs.unit}</td>
                  <td className="px-6 py-3 text-sm text-right font-semibold text-green-600">Rs {bs.revenue.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Status Filter */}
      <div className="flex gap-2 flex-wrap">
        {statuses.map(s => (
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

      {/* Allocations List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : allocations.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="text-5xl mb-4">📦</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Dispatches Found</h3>
          <p className="text-gray-600">Create a dispatch to allocate stock to a delivery agent.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {allocations.map((alloc) => {
            const totals = getTotalItems(alloc.items)
            return (
              <Link key={alloc.id} href={`/dashboard/dispatch/${alloc.id}`}>
                <div className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {alloc.agent?.name || 'Unknown Agent'}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {alloc.agent?.email} {alloc.agent?.phone ? `| ${alloc.agent.phone}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {getStatusBadge(alloc.status)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 bg-gray-50 rounded-lg p-4">
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-medium">Items</p>
                      <p className="text-lg font-bold text-gray-900">{totals.count}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-medium">Qty Allocated</p>
                      <p className="text-lg font-bold text-gray-900">{totals.totalQty.toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-medium">Qty Sold</p>
                      <p className="text-lg font-bold text-green-600">{totals.totalSold.toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-medium">Qty Returned</p>
                      <p className="text-lg font-bold text-red-600">{totals.totalReturned.toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-medium">Dispatched On</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {new Date(alloc.created_at).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-gray-500">
                        by {alloc.created_by_user?.name || 'Admin'}
                      </p>
                    </div>
                  </div>

                  {alloc.notes && (
                    <p className="text-sm text-gray-500 mt-3 italic">Note: {alloc.notes}</p>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
