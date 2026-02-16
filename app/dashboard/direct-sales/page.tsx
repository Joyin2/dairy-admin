'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

interface DirectSale {
  id: string
  agent_id: string
  route_id: string | null
  customer_id: string | null
  customer_name: string | null
  customer_mobile: string | null
  road_area: string
  house_no: string | null
  customer_type: string
  total_items: number
  total_quantity: number
  total_amount: number
  cash_collected: number
  due_amount: number
  payment_mode: string
  notes: string | null
  sale_date: string
  created_at: string
  agent_name?: string
  route_name?: string
  items?: DirectSaleItem[]
}

interface DirectSaleItem {
  id: string
  product_name: string
  batch_number: string
  packaging_type: string | null
  package_size: string | null
  quantity_sold: number
  unit: string
  price_per_unit: number
  total_amount: number
}

interface DirectCustomer {
  id: string
  name: string | null
  mobile: string
  road_area: string | null
  house_no: string | null
  customer_type: string
  total_purchases: number
  total_dues: number
  created_at: string
}

interface RoadSummary {
  road: string
  salesCount: number
  totalAmount: number
  totalCollected: number
  totalDue: number
}

interface AgentPerformance {
  agentId: string
  agentName: string
  directSales: number
  totalAmount: number
  totalCollected: number
  totalDue: number
}

export default function DirectSalesPage() {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<'ledger' | 'roadwise' | 'customers'>('ledger')
  const [sales, setSales] = useState<DirectSale[]>([])
  const [customers, setCustomers] = useState<DirectCustomer[]>([])
  const [roadSummary, setRoadSummary] = useState<RoadSummary[]>([])
  const [agentPerformance, setAgentPerformance] = useState<AgentPerformance[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState('')
  const [agentFilter, setAgentFilter] = useState('')
  const [roadFilter, setRoadFilter] = useState('')
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([])

  const [summary, setSummary] = useState({
    totalSales: 0,
    totalRevenue: 0,
    totalCollected: 0,
    totalDue: 0,
    uniqueRoads: 0,
    uniqueCustomers: 0,
  })

  useEffect(() => {
    fetchAgents()
  }, [])

  useEffect(() => {
    fetchData()
  }, [dateFilter, agentFilter, roadFilter])

  const fetchAgents = async () => {
    const { data } = await supabase
      .from('app_users')
      .select('id, name')
      .eq('role', 'delivery_agent')
      .eq('status', 'active')
      .order('name')
    setAgents(data || [])
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      // Fetch direct sales
      let query = supabase
        .from('direct_sales')
        .select('*')
        .order('created_at', { ascending: false })

      if (dateFilter) query = query.eq('sale_date', dateFilter)
      if (agentFilter) query = query.eq('agent_id', agentFilter)
      if (roadFilter) query = query.ilike('road_area', `%${roadFilter}%`)

      const { data: salesData } = await query

      // Enrich with agent names, route names, and items
      const enriched: DirectSale[] = []
      const agentIds = new Set<string>()
      const routeIds = new Set<string>()

      for (const sale of (salesData || [])) {
        agentIds.add(sale.agent_id)
        if (sale.route_id) routeIds.add(sale.route_id)
      }

      // Fetch agent names
      const agentMap: Record<string, string> = {}
      if (agentIds.size > 0) {
        const { data: agentsData } = await supabase
          .from('app_users')
          .select('id, name')
          .in('id', Array.from(agentIds))
        for (const a of (agentsData || [])) {
          agentMap[a.id] = a.name || 'Unknown'
        }
      }

      // Fetch route names
      const routeMap: Record<string, string> = {}
      if (routeIds.size > 0) {
        const { data: routesData } = await supabase
          .from('routes')
          .select('id, name')
          .in('id', Array.from(routeIds))
        for (const r of (routesData || [])) {
          routeMap[r.id] = r.name || 'Unknown'
        }
      }

      // Fetch all items
      const saleIds = (salesData || []).map((s: any) => s.id)
      let itemsMap: Record<string, DirectSaleItem[]> = {}
      if (saleIds.length > 0) {
        const { data: itemsData } = await supabase
          .from('direct_sale_items')
          .select('*')
          .in('direct_sale_id', saleIds)
        for (const item of (itemsData || [])) {
          if (!itemsMap[item.direct_sale_id]) itemsMap[item.direct_sale_id] = []
          itemsMap[item.direct_sale_id].push(item)
        }
      }

      for (const sale of (salesData || [])) {
        enriched.push({
          ...sale,
          agent_name: agentMap[sale.agent_id] || 'Unknown',
          route_name: sale.route_id ? routeMap[sale.route_id] || '-' : '-',
          items: itemsMap[sale.id] || [],
        })
      }

      setSales(enriched)

      // Calculate summary
      const totalRevenue = enriched.reduce((s, d) => s + parseFloat(String(d.total_amount || 0)), 0)
      const totalCollected = enriched.reduce((s, d) => s + parseFloat(String(d.cash_collected || 0)), 0)
      const totalDue = enriched.reduce((s, d) => s + parseFloat(String(d.due_amount || 0)), 0)
      const roads = new Set(enriched.map(d => d.road_area))
      const custIds = new Set(enriched.map(d => d.customer_id).filter(Boolean))

      setSummary({
        totalSales: enriched.length,
        totalRevenue,
        totalCollected,
        totalDue,
        uniqueRoads: roads.size,
        uniqueCustomers: custIds.size,
      })

      // Road-wise summary
      const roadMap: Record<string, RoadSummary> = {}
      for (const sale of enriched) {
        const road = sale.road_area
        if (!roadMap[road]) {
          roadMap[road] = { road, salesCount: 0, totalAmount: 0, totalCollected: 0, totalDue: 0 }
        }
        roadMap[road].salesCount++
        roadMap[road].totalAmount += parseFloat(String(sale.total_amount || 0))
        roadMap[road].totalCollected += parseFloat(String(sale.cash_collected || 0))
        roadMap[road].totalDue += parseFloat(String(sale.due_amount || 0))
      }
      setRoadSummary(Object.values(roadMap).sort((a, b) => b.totalAmount - a.totalAmount))

      // Agent performance
      const agentPerfMap: Record<string, AgentPerformance> = {}
      for (const sale of enriched) {
        if (!agentPerfMap[sale.agent_id]) {
          agentPerfMap[sale.agent_id] = {
            agentId: sale.agent_id,
            agentName: sale.agent_name || 'Unknown',
            directSales: 0, totalAmount: 0, totalCollected: 0, totalDue: 0,
          }
        }
        agentPerfMap[sale.agent_id].directSales++
        agentPerfMap[sale.agent_id].totalAmount += parseFloat(String(sale.total_amount || 0))
        agentPerfMap[sale.agent_id].totalCollected += parseFloat(String(sale.cash_collected || 0))
        agentPerfMap[sale.agent_id].totalDue += parseFloat(String(sale.due_amount || 0))
      }
      setAgentPerformance(Object.values(agentPerfMap).sort((a, b) => b.totalAmount - a.totalAmount))

      // Fetch customers
      const { data: customersData } = await supabase
        .from('direct_customers')
        .select('*')
        .order('created_at', { ascending: false })
      setCustomers(customersData || [])

    } catch (err: any) {
      console.error('Error fetching direct sales:', err)
    } finally {
      setLoading(false)
    }
  }

  const tabs = [
    { id: 'ledger' as const, label: 'Direct Sales Ledger' },
    { id: 'roadwise' as const, label: 'Road-wise Report' },
    { id: 'customers' as const, label: 'Customers' },
  ]

  const customerTypeLabel = (t: string) => {
    switch (t) {
      case 'walk_in': return 'Walk-in'
      case 'home_delivery': return 'Home'
      case 'temporary': return 'Temporary'
      default: return t
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Direct Sales</h1>
          <p className="text-gray-500 mt-1">Road / Home customer sales without registered shop</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-emerald-500">
          <div className="text-2xl font-bold text-gray-900">{summary.totalSales}</div>
          <div className="text-xs text-gray-500">Total Sales</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
          <div className="text-2xl font-bold text-blue-600">Rs {summary.totalRevenue.toFixed(0)}</div>
          <div className="text-xs text-gray-500">Total Revenue</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
          <div className="text-2xl font-bold text-green-600">Rs {summary.totalCollected.toFixed(0)}</div>
          <div className="text-xs text-gray-500">Cash Collected</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-amber-500">
          <div className="text-2xl font-bold text-amber-600">Rs {summary.totalDue.toFixed(0)}</div>
          <div className="text-xs text-gray-500">Total Due</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
          <div className="text-2xl font-bold text-purple-600">{summary.uniqueRoads}</div>
          <div className="text-xs text-gray-500">Roads Covered</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-indigo-500">
          <div className="text-2xl font-bold text-indigo-600">{summary.uniqueCustomers}</div>
          <div className="text-xs text-gray-500">Unique Customers</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Agent</label>
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Agents</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Road / Area</label>
            <input
              type="text"
              value={roadFilter}
              onChange={(e) => setRoadFilter(e.target.value)}
              placeholder="Search road..."
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          {(dateFilter || agentFilter || roadFilter) && (
            <div className="flex items-end">
              <button
                onClick={() => { setDateFilter(''); setAgentFilter(''); setRoadFilter('') }}
                className="text-sm text-red-600 hover:text-red-700 font-medium px-3 py-2"
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <>
          {/* Direct Sales Ledger Tab */}
          {activeTab === 'ledger' && (
            <div className="space-y-4">
              {/* Agent Performance Summary */}
              {agentPerformance.length > 0 && (
                <div className="bg-white rounded-lg shadow overflow-hidden mb-4">
                  <div className="px-6 py-3 border-b bg-gray-50">
                    <h3 className="text-sm font-semibold text-gray-700">Agent Performance (Direct Sales)</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sales</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Collected</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Due</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {agentPerformance.map(ap => (
                          <tr key={ap.agentId}>
                            <td className="px-4 py-2 font-medium text-gray-900">{ap.agentName}</td>
                            <td className="px-4 py-2 text-gray-700">{ap.directSales}</td>
                            <td className="px-4 py-2 text-blue-600 font-semibold">Rs {ap.totalAmount.toFixed(0)}</td>
                            <td className="px-4 py-2 text-green-600 font-semibold">Rs {ap.totalCollected.toFixed(0)}</td>
                            <td className="px-4 py-2 text-amber-600 font-semibold">Rs {ap.totalDue.toFixed(0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Sales Table */}
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b">
                  <h2 className="text-lg font-semibold text-gray-900">Direct Sales Ledger ({sales.length})</h2>
                </div>
                {sales.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">No direct sales found</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Road / Area</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Products</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paid</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Route</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {sales.map(sale => (
                          <tr key={sale.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {new Date(sale.sale_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-sm font-medium text-gray-900">{sale.customer_name || 'Walk-in'}</div>
                              {sale.customer_mobile && (
                                <div className="text-xs text-gray-500">{sale.customer_mobile}</div>
                              )}
                              <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${
                                sale.customer_type === 'home_delivery' ? 'bg-blue-100 text-blue-700' :
                                sale.customer_type === 'temporary' ? 'bg-amber-100 text-amber-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {customerTypeLabel(sale.customer_type)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-sm font-medium text-gray-900">{sale.road_area}</div>
                              {sale.house_no && <div className="text-xs text-gray-500">House: {sale.house_no}</div>}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {(sale.items || []).map((item, idx) => (
                                <div key={idx} className="text-xs mb-1">
                                  <span className="font-medium">{item.product_name}</span>
                                  <span className="text-gray-500 ml-1">({item.batch_number})</span>
                                  <span className="text-gray-400 ml-1">{item.quantity_sold} {item.unit} x Rs {item.price_per_unit}</span>
                                </div>
                              ))}
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                              Rs {parseFloat(String(sale.total_amount || 0)).toFixed(0)}
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold text-green-600">
                              Rs {parseFloat(String(sale.cash_collected || 0)).toFixed(0)}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {parseFloat(String(sale.due_amount || 0)) > 0 ? (
                                <span className="font-semibold text-red-600">
                                  Rs {parseFloat(String(sale.due_amount || 0)).toFixed(0)}
                                </span>
                              ) : (
                                <span className="text-green-600 text-xs font-medium">Paid</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">{sale.agent_name}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">{sale.route_name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Road-wise Report Tab */}
          {activeTab === 'roadwise' && (
            <div className="space-y-4">
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b">
                  <h2 className="text-lg font-semibold text-gray-900">Road-wise Sales Summary ({roadSummary.length} roads)</h2>
                </div>
                {roadSummary.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">No data available</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Road / Area</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sales Count</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Sales</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Collection</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Due</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Collection %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {roadSummary.map(road => {
                          const collPct = road.totalAmount > 0
                            ? ((road.totalCollected / road.totalAmount) * 100).toFixed(0)
                            : '0'
                          return (
                            <tr key={road.road} className="hover:bg-gray-50">
                              <td className="px-6 py-3 text-sm font-semibold text-gray-900">{road.road}</td>
                              <td className="px-6 py-3 text-sm text-gray-700">{road.salesCount}</td>
                              <td className="px-6 py-3 text-sm font-semibold text-blue-600">Rs {road.totalAmount.toFixed(0)}</td>
                              <td className="px-6 py-3 text-sm font-semibold text-green-600">Rs {road.totalCollected.toFixed(0)}</td>
                              <td className="px-6 py-3 text-sm">
                                {road.totalDue > 0 ? (
                                  <span className="font-semibold text-red-600">Rs {road.totalDue.toFixed(0)}</span>
                                ) : (
                                  <span className="text-green-600 text-xs">Cleared</span>
                                )}
                              </td>
                              <td className="px-6 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-emerald-500 rounded-full"
                                      style={{ width: `${collPct}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-gray-500">{collPct}%</span>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr className="font-semibold">
                          <td className="px-6 py-3 text-sm text-gray-900">Total</td>
                          <td className="px-6 py-3 text-sm text-gray-900">
                            {roadSummary.reduce((s, r) => s + r.salesCount, 0)}
                          </td>
                          <td className="px-6 py-3 text-sm text-blue-600">
                            Rs {roadSummary.reduce((s, r) => s + r.totalAmount, 0).toFixed(0)}
                          </td>
                          <td className="px-6 py-3 text-sm text-green-600">
                            Rs {roadSummary.reduce((s, r) => s + r.totalCollected, 0).toFixed(0)}
                          </td>
                          <td className="px-6 py-3 text-sm text-red-600">
                            Rs {roadSummary.reduce((s, r) => s + r.totalDue, 0).toFixed(0)}
                          </td>
                          <td className="px-6 py-3"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Customers Tab */}
          {activeTab === 'customers' && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold text-gray-900">Direct Customers ({customers.length})</h2>
                <p className="text-sm text-gray-500 mt-1">Customer profiles auto-created when mobile number is provided</p>
              </div>
              {customers.length === 0 ? (
                <div className="text-center py-12 text-gray-400">No customer profiles yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mobile</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Road / Area</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Purchases</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Dues</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Since</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {customers.map(cust => (
                        <tr key={cust.id} className="hover:bg-gray-50">
                          <td className="px-6 py-3 text-sm font-medium text-gray-900">
                            {cust.name || 'N/A'}
                          </td>
                          <td className="px-6 py-3 text-sm text-blue-600 font-mono">{cust.mobile}</td>
                          <td className="px-6 py-3 text-sm text-gray-700">
                            {cust.road_area || '-'}
                            {cust.house_no && <span className="text-gray-400 ml-1">(#{cust.house_no})</span>}
                          </td>
                          <td className="px-6 py-3">
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              cust.customer_type === 'home_delivery' ? 'bg-blue-100 text-blue-700' :
                              cust.customer_type === 'temporary' ? 'bg-amber-100 text-amber-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {customerTypeLabel(cust.customer_type)}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-sm font-semibold text-gray-900">
                            Rs {parseFloat(String(cust.total_purchases || 0)).toFixed(0)}
                          </td>
                          <td className="px-6 py-3 text-sm">
                            {parseFloat(String(cust.total_dues || 0)) > 0 ? (
                              <span className="font-semibold text-red-600">
                                Rs {parseFloat(String(cust.total_dues || 0)).toFixed(0)}
                              </span>
                            ) : (
                              <span className="text-green-600 text-xs">Clear</span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-sm text-gray-500">
                            {new Date(cust.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
