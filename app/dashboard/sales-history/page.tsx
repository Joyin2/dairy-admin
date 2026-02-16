'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface SaleRecord {
  id: string
  delivery_id: string
  product_name: string
  batch_number: string
  quantity_sold: number
  unit: string
  price_per_unit: number
  total_amount: number
  created_at: string
  shop_name?: string
  shop_city?: string
  agent_name?: string
  agent_id?: string
  route_name?: string
}

interface Agent {
  id: string
  name: string
}

export default function SalesHistoryPage() {
  const supabase = createClient()
  const [sales, setSales] = useState<SaleRecord[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [agentFilter, setAgentFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalQuantity: 0,
    totalRevenue: 0,
    uniqueShops: 0,
  })

  useEffect(() => {
    fetchAgents()
  }, [])

  useEffect(() => {
    fetchSales()
  }, [agentFilter, dateFilter])

  const fetchAgents = async () => {
    const { data } = await supabase
      .from('app_users')
      .select('id, name')
      .eq('role', 'delivery_agent')
      .eq('status', 'active')
      .order('name')
    setAgents(data || [])
  }

  const fetchSales = async () => {
    setLoading(true)
    try {
      // Fetch delivery_sales with related data
      const { data: salesData, error: salesError } = await supabase
        .from('delivery_sales')
        .select('*')
        .order('created_at', { ascending: false })

      if (salesError) {
        console.error('Error fetching sales:', salesError)
        setLoading(false)
        return
      }

      // Enrich with delivery, shop, route, and agent info
      const enrichedSales: SaleRecord[] = []
      const shopSet = new Set<string>()

      for (const sale of salesData || []) {
        // Get delivery with shop and route info
        const { data: delivery } = await supabase
          .from('deliveries')
          .select('id, shop_id, route_id, shops(name, city), routes(name, agent_id)')
          .eq('id', sale.delivery_id)
          .single()

        if (!delivery) continue

        const agentId = (delivery.routes as any)?.agent_id
        
        // Apply agent filter
        if (agentFilter && agentId !== agentFilter) continue
        
        // Apply date filter
        if (dateFilter) {
          const saleDate = new Date(sale.created_at).toISOString().split('T')[0]
          if (saleDate !== dateFilter) continue
        }

        // Get agent name
        let agentName = 'Unknown'
        if (agentId) {
          const { data: agent } = await supabase
            .from('app_users')
            .select('name')
            .eq('id', agentId)
            .single()
          agentName = agent?.name || 'Unknown'
        }

        shopSet.add(delivery.shop_id)

        enrichedSales.push({
          ...sale,
          shop_name: (delivery.shops as any)?.name || 'Unknown Shop',
          shop_city: (delivery.shops as any)?.city || '',
          agent_name: agentName,
          agent_id: agentId,
          route_name: (delivery.routes as any)?.name || 'Unknown Route',
        })
      }

      setSales(enrichedSales)
      
      // Calculate summary
      const totalQty = enrichedSales.reduce((s, r) => s + parseFloat(String(r.quantity_sold || 0)), 0)
      const totalRev = enrichedSales.reduce((s, r) => s + parseFloat(String(r.total_amount || 0)), 0)
      
      setSummary({
        totalSales: enrichedSales.length,
        totalQuantity: totalQty,
        totalRevenue: totalRev,
        uniqueShops: shopSet.size,
      })
    } catch (err) {
      console.error('Error fetching sales:', err)
    }
    setLoading(false)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const clearFilters = () => {
    setAgentFilter('')
    setDateFilter('')
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Delivery Sales History</h1>
          <p className="text-sm text-gray-600 mt-1">View all sales made by delivery agents</p>
        </div>
        <Link
          href="/dashboard/dispatch"
          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          ← Back to Dispatch
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
          <p className="text-xs text-gray-500 uppercase font-medium">Total Sales</p>
          <p className="text-2xl font-bold text-gray-900">{summary.totalSales}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
          <p className="text-xs text-gray-500 uppercase font-medium">Total Quantity</p>
          <p className="text-2xl font-bold text-green-600">{summary.totalQuantity.toFixed(1)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-emerald-500">
          <p className="text-xs text-gray-500 uppercase font-medium">Total Revenue</p>
          <p className="text-2xl font-bold text-emerald-600">Rs {summary.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
          <p className="text-xs text-gray-500 uppercase font-medium">Shops Served</p>
          <p className="text-2xl font-bold text-purple-600">{summary.uniqueShops}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Agent</label>
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            >
              <option value="">All Agents</option>
              {agents.map(agent => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Date</label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            />
          </div>
          {(agentFilter || dateFilter) && (
            <button
              onClick={clearFilters}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Sales Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading sales data...</div>
      ) : sales.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="text-5xl mb-4">📋</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Sales Found</h3>
          <p className="text-gray-600">
            {agentFilter || dateFilter 
              ? 'No sales match the selected filters. Try adjusting your filters.'
              : 'Sales records will appear here once deliveries are made.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date & Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shop</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {formatDate(sale.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{sale.agent_name}</div>
                      <div className="text-xs text-gray-500">{sale.route_name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{sale.shop_name}</div>
                      {sale.shop_city && <div className="text-xs text-gray-500">{sale.shop_city}</div>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{sale.product_name}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                        {sale.batch_number}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                      {parseFloat(String(sale.quantity_sold)).toFixed(1)} {sale.unit}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-600">
                      Rs {parseFloat(String(sale.price_per_unit)).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-green-600">
                      Rs {parseFloat(String(sale.total_amount)).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-gray-700 text-right">
                    Totals:
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-gray-900">
                    {summary.totalQuantity.toFixed(1)}
                  </td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-green-600">
                    Rs {summary.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
