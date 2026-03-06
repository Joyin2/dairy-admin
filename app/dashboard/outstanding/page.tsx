'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { db, auth } from '@/lib/firebase/client'
import { collection, query, where, getDocs } from 'firebase/firestore'

interface Agent {
  id: string
  name: string
}

export default function OutstandingBalancesPage() {
  const [balances, setBalances] = useState<any[]>([])
  const [filteredBalances, setFilteredBalances] = useState<any[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [agentFilter, setAgentFilter] = useState('')
  const [totalOutstanding, setTotalOutstanding] = useState(0)
  const [filteredOutstanding, setFilteredOutstanding] = useState(0)

  useEffect(() => {
    fetchAgents()
    fetchOutstandingBalances()
  }, [])

  // Apply filter when agentFilter or balances change
  useEffect(() => {
    if (agentFilter) {
      const filtered = balances.filter(b => b.agent_id === agentFilter)
      setFilteredBalances(filtered)
      setFilteredOutstanding(filtered.reduce((sum: number, b: any) => sum + b.outstanding, 0))
    } else {
      setFilteredBalances(balances)
      setFilteredOutstanding(totalOutstanding)
    }
  }, [agentFilter, balances, totalOutstanding])

  const fetchAgents = async () => {
    const q = query(
      collection(db, 'app_users'),
      where('role', '==', 'delivery_agent'),
      where('status', '==', 'active')
    )
    const snap = await getDocs(q)
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))
    data.sort((a: any, b: any) => a.name.localeCompare(b.name))
    setAgents(data)
  }

  const fetchOutstandingBalances = async () => {
    setLoading(true)

    // Get all deliveries with status delivered or partial
    const deliveriesQ = query(
      collection(db, 'deliveries'),
      where('status', 'in', ['delivered', 'partial'])
    )
    const deliveriesSnap = await getDocs(deliveriesQ)
    const deliveries = deliveriesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    if (deliveries.length > 0) {
      // Collect unique shop IDs and route IDs
      const shopIds = [...new Set(deliveries.map((d: any) => d.shop_id).filter(Boolean))]
      const routeIds = [...new Set(deliveries.map((d: any) => d.route_id).filter(Boolean))]

      // Fetch shops
      const shopMap: Record<string, any> = {}
      if (shopIds.length > 0) {
        const chunks = []
        for (let i = 0; i < shopIds.length; i += 10) chunks.push(shopIds.slice(i, i + 10))
        for (const chunk of chunks) {
          const q = query(collection(db, 'shops'), where('__name__', 'in', chunk))
          const snap = await getDocs(q)
          snap.docs.forEach(d => { shopMap[d.id] = { id: d.id, ...d.data() } })
        }
      }

      // Fetch routes
      const routeMap: Record<string, any> = {}
      if (routeIds.length > 0) {
        const chunks = []
        for (let i = 0; i < routeIds.length; i += 10) chunks.push(routeIds.slice(i, i + 10))
        for (const chunk of chunks) {
          const q = query(collection(db, 'routes'), where('__name__', 'in', chunk))
          const snap = await getDocs(q)
          snap.docs.forEach(d => { routeMap[d.id] = { id: d.id, ...d.data() } })
        }
      }

      // Fetch agents for routes
      const agentIds = [...new Set(Object.values(routeMap).map((r: any) => r.agent_id).filter(Boolean))]
      const agentNameMap: Record<string, string> = {}
      if (agentIds.length > 0) {
        const chunks = []
        for (let i = 0; i < agentIds.length; i += 10) chunks.push(agentIds.slice(i, i + 10))
        for (const chunk of chunks) {
          const q = query(collection(db, 'app_users'), where('__name__', 'in', chunk))
          const snap = await getDocs(q)
          snap.docs.forEach(d => { agentNameMap[d.id] = (d.data() as any).name })
        }
      }

      // Group by shop and calculate balance
      const shopBalances = deliveries.reduce((acc: any, delivery: any) => {
        const shopId = delivery.shop_id
        const expected = parseFloat(String(delivery.expected_amount || 0))
        const collected = parseFloat(String(delivery.collected_amount || 0))
        const balance = expected - collected

        if (balance > 0) {
          const shop = shopMap[shopId]
          const routeId = delivery.route_id
          const routeInfo = routeId ? routeMap[routeId] : null

          if (!acc[shopId]) {
            acc[shopId] = {
              shop_id: shopId,
              shop_name: shop?.name || 'Unknown',
              owner_name: shop?.owner_name || '',
              contact: shop?.contact || '',
              city: shop?.city || '',
              route_id: routeId,
              route_name: routeInfo?.name || 'Unassigned',
              agent_id: routeInfo?.agent_id || null,
              agent_name: routeInfo?.agent_id ? (agentNameMap[routeInfo.agent_id] || 'Unassigned') : 'Unassigned',
              total_expected: 0,
              total_collected: 0,
              outstanding: 0,
              delivery_count: 0,
            }
          }
          acc[shopId].total_expected += expected
          acc[shopId].total_collected += collected
          acc[shopId].outstanding += balance
          acc[shopId].delivery_count += 1
        }
        return acc
      }, {})

      const balanceArray = Object.values(shopBalances).sort((a: any, b: any) => b.outstanding - a.outstanding)
      setBalances(balanceArray)

      const total = balanceArray.reduce((sum: number, b: any) => sum + b.outstanding, 0)
      setTotalOutstanding(total)
    }

    setLoading(false)
  }

  const clearFilter = () => {
    setAgentFilter('')
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Outstanding Balances</h1>
          <p className="text-sm text-gray-600 mt-1">Track pending payments from shops</p>
        </div>
        <button
          onClick={() => fetchOutstandingBalances()}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          <span>{loading ? '⟳' : '↻'}</span>
          <span>Refresh</span>
        </button>
      </div>

      {/* Total Summary */}
      <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-lg shadow p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm opacity-90">{agentFilter ? 'Filtered Outstanding' : 'Total Outstanding'}</p>
            <p className="text-4xl font-bold mt-1">₹{filteredOutstanding.toFixed(2)}</p>
            {agentFilter && (
              <p className="text-sm opacity-75 mt-1">of ₹{totalOutstanding.toFixed(2)} total</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm opacity-90">Shops with Dues</p>
            <p className="text-4xl font-bold mt-1">{filteredBalances.length}</p>
            {agentFilter && (
              <p className="text-sm opacity-75 mt-1">of {balances.length} total</p>
            )}
          </div>
        </div>
      </div>

      {/* Filter Section */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[250px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Delivery Agent</label>
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
          {agentFilter && (
            <button
              onClick={clearFilter}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Clear Filter
            </button>
          )}
        </div>
      </div>

      {/* Outstanding List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : filteredBalances.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shop</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Route</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Expected</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Collected</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Outstanding</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Deliveries</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredBalances.map((balance) => (
                  <tr key={balance.shop_id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <div className="font-medium text-gray-900">{balance.shop_name}</div>
                      {balance.city && <div className="text-xs text-gray-500">{balance.city}</div>}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`text-sm ${balance.agent_name === 'Unassigned' ? 'text-gray-400 italic' : 'text-gray-900 font-medium'}`}>
                        {balance.agent_name}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {balance.route_id ? (
                        <Link href={`/dashboard/routes/${balance.route_id}`} className="text-blue-600 hover:text-blue-800 text-sm">
                          {balance.route_name}
                        </Link>
                      ) : (
                        <span className="text-gray-400 italic text-sm">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600">{balance.owner_name || '-'}</td>
                    <td className="px-4 py-4 text-sm text-gray-600">{balance.contact || '-'}</td>
                    <td className="px-4 py-4 text-right text-sm text-gray-600">₹{balance.total_expected.toFixed(2)}</td>
                    <td className="px-4 py-4 text-right text-sm text-gray-600">₹{balance.total_collected.toFixed(2)}</td>
                    <td className="px-4 py-4 text-right">
                      <span className="px-3 py-1 text-sm font-semibold rounded-full bg-red-100 text-red-800">
                        ₹{balance.outstanding.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center text-sm text-gray-600">{balance.delivery_count}</td>
                    <td className="px-4 py-4 text-right">
                      <Link
                        href={`/dashboard/shops/${balance.shop_id}`}
                        className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                      >
                        View Shop
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-gray-700 text-right">
                    Totals:
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                    ₹{filteredBalances.reduce((s: number, b: any) => s + b.total_expected, 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                    ₹{filteredBalances.reduce((s: number, b: any) => s + b.total_collected, 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="px-3 py-1 text-sm font-bold rounded-full bg-red-100 text-red-800">
                      ₹{filteredOutstanding.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-bold text-gray-900">
                    {filteredBalances.reduce((s: number, b: any) => s + b.delivery_count, 0)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            <p className="text-lg font-medium">
              {agentFilter ? 'No outstanding balances for this agent! 🎉' : 'No outstanding balances! 🎉'}
            </p>
            <p className="text-sm mt-2">
              {agentFilter ? 'Try selecting a different agent or clear the filter.' : 'All shops have paid their dues.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
