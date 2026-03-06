'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/firebase/client'
import { collection, query, where, getDocs, orderBy, doc, deleteDoc, updateDoc, getDoc } from 'firebase/firestore'

export default function RouteDetailPage() {
  const router = useRouter()
  const params = useParams()

  const [route, setRoute] = useState<any>(null)
  const [agents, setAgents] = useState<any[]>([])
  const [shops, setShops] = useState<any[]>([])
  const [availableShops, setAvailableShops] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddShop, setShowAddShop] = useState(false)
  const [selectedShopId, setSelectedShopId] = useState('')
  const [newSequence, setNewSequence] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      const routeId = params.id as string

      const [routeSnap, agentsSnap, shopsSnap, allShopsSnap] = await Promise.all([
        getDoc(doc(db, 'routes', routeId)),
        getDocs(query(collection(db, 'app_users'), where('role', '==', 'delivery_agent'), where('status', '==', 'active'))),
        getDocs(query(collection(db, 'shops'), where('route_id', '==', routeId))),
        getDocs(query(collection(db, 'shops'), where('status', 'in', ['approved', 'pending_approval']))),
      ])

      if (!routeSnap.exists()) {
        setError('Route not found')
      } else {
        const routeData = { id: routeSnap.id, ...routeSnap.data() } as any
        // Fetch agent data if exists
        if (routeData.agent_id) {
          const agentSnap = await getDoc(doc(db, 'app_users', routeData.agent_id))
          if (agentSnap.exists()) {
            (routeData as any).agent = { id: agentSnap.id, ...agentSnap.data() }
          }
        }
        setRoute(routeData)
      }

      const agentList = agentsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]
      agentList.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      setAgents(agentList)

      const shopList = shopsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]
      shopList.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      setShops(shopList)

      // Available = approved/no-status shops not assigned to any route (filter client-side)
      const allShops = allShopsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]
      const available = allShops.filter(s => !s.route_id)
      available.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      setAvailableShops(available)
      setLoading(false)
    }
    fetchData()
  }, [params.id])

  const handleAssignAgent = async (agentId: string) => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'routes', params.id as string), { agent_id: agentId || null })
      const agentData = agents.find(a => a.id === agentId)
      setRoute({ ...route, agent_id: agentId, agent: agentData })
    } catch (err: any) {
      setError(err.message)
    }
    setSaving(false)
  }

  const handleAddShopToRoute = async () => {
    if (!selectedShopId) {
      alert('Select shop')
      return
    }

    setSaving(true)
    try {
      await updateDoc(doc(db, 'shops', selectedShopId), { route_id: params.id as string })
      const shop = availableShops.find(s => s.id === selectedShopId)
      setShops([...shops, shop].sort((a, b) => a.name.localeCompare(b.name)))
      setAvailableShops(availableShops.filter(s => s.id !== selectedShopId))
      setShowAddShop(false)
      setSelectedShopId('')
      setNewSequence('')
    } catch (err: any) {
      alert('Failed: ' + err.message)
    }
    setSaving(false)
  }

  const handleRemoveShop = async (shopId: string) => {
    if (!confirm('Remove this shop from route?')) return

    setSaving(true)
    try {
      await updateDoc(doc(db, 'shops', shopId), { route_id: null })
      const shop = shops.find(s => s.id === shopId)
      setShops(shops.filter(s => s.id !== shopId))
      setAvailableShops([...availableShops, shop].sort((a, b) => a.name.localeCompare(b.name)))
    } catch (err: any) {
      alert('Failed: ' + err.message)
    }
    setSaving(false)
  }

  const handleUpdateSequence = async (shopId: string, newSeq: number) => {
    // Sequence functionality disabled until schema cache is refreshed
    alert('Sequence update will be available after schema cache refresh')
    return
  }

  const handleDeleteRoute = async () => {
    if (!confirm('Are you sure you want to delete this route?')) return
    setSaving(true)
    try {
      await deleteDoc(doc(db, 'routes', params.id as string))
      router.push('/dashboard/routes')
      router.refresh()
    } catch (err: any) {
      setError('Failed to delete route')
    }
    setSaving(false)
  }

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      in_progress: 'bg-green-100 text-green-800',
      completed: 'bg-gray-100 text-gray-800',
    }
    return colors[status] || colors.pending
  }

  if (loading) {
    return <div className="flex justify-center items-center min-h-[400px] text-gray-500">Loading...</div>
  }

  if (error || !route) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error || 'Route not found'}</p>
        <Link href="/dashboard/routes" className="text-blue-600 hover:text-blue-800">← Back to Routes</Link>
      </div>
    )
  }

  const stops = route.stops || []
  const completedStops = stops.filter((s: any) => s.status === 'completed').length
  const totalShops = shops.length
  const approvedShops = shops.filter(s => !s.status || s.status === 'approved').length

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <Link href="/dashboard/routes" className="text-sm text-blue-600 hover:text-blue-800 mb-2 inline-block">
            ← Back to Routes
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">{route.name}</h1>
          <div className="flex items-center gap-3 mt-2">
            {route.area && (
              <span className="text-sm text-gray-600">
                <span className="font-medium">Area:</span> {route.area}
              </span>
            )}
            <span className="text-sm text-gray-600">
              <span className="font-medium">Type:</span> <span className="capitalize">{route.delivery_type || 'morning'}</span>
            </span>
            <span className={`px-2 py-1 text-xs rounded-full ${
              route.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
            }`}>
              {route.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
          {route.description && (
            <p className="text-sm text-gray-500 mt-2">{route.description}</p>
          )}
        </div>
        <button
          onClick={handleDeleteRoute}
          disabled={saving}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"
        >
          Delete Route
        </button>
      </div>

      {/* Route Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Assigned Agent</p>
          <p className="text-lg font-semibold text-gray-900 mt-1">
            {route.agent?.name || 'Unassigned'}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Total Shops</p>
          <p className="text-2xl font-bold text-gray-900">{totalShops}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Approved Shops</p>
          <p className="text-2xl font-bold text-green-600">{approvedShops}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Delivery Type</p>
          <p className="text-lg font-semibold text-blue-600 capitalize">{route.delivery_type || 'Morning'}</p>
        </div>
      </div>

      {/* Agent Assignment */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Delivery Agent</h2>
        <div className="flex items-center gap-4">
          <select
            value={route.agent_id || ''}
            onChange={(e) => handleAssignAgent(e.target.value)}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-w-[250px]"
          >
            <option value="">Unassigned</option>
            {agents.map(agent => (
              <option key={agent.id} value={agent.id}>{agent.name || agent.email}</option>
            ))}
          </select>
          {route.agent && (
            <span className="text-sm text-gray-500">
              Currently: {route.agent.name || route.agent.email}
            </span>
          )}
        </div>
      </div>

      {/* Shops Assigned to Route */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">Shops on This Route</h2>
          <button
            onClick={() => setShowAddShop(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
          >
            + Add Shop
          </button>
        </div>
        {shops.length > 0 ? (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sequence</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shop Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">City</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {shops.map((shop: any) => (
                <tr key={shop.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <input
                      type="number"
                      value={shop.sequence}
                      onChange={(e) => handleUpdateSequence(shop.id, parseInt(e.target.value))}
                      className="w-16 px-2 py-1 border rounded text-gray-900 bg-white"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{shop.name}</div>
                    <Link href={`/dashboard/shops/${shop.id}`} className="text-xs text-blue-600 hover:text-blue-800">
                      View Details →
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{shop.contact || 'N/A'}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{shop.city || 'N/A'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      (!shop.status || shop.status === 'approved') ? 'bg-green-100 text-green-800' :
                      shop.status === 'pending_approval' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {!shop.status || shop.status === 'approved' ? 'Approved' :
                       shop.status === 'pending_approval' ? 'Pending' : shop.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleRemoveShop(shop.id)}
                      className="text-red-600 hover:text-red-900 text-sm"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-gray-500">No shops assigned to this route yet</div>
        )}
      </div>

      {/* Add Shop Modal */}
      {showAddShop && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Shop to Route</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Shop</label>
                <select
                  value={selectedShopId}
                  onChange={(e) => setSelectedShopId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-gray-900 bg-white"
                >
                  <option value="">Choose a shop...</option>
                  {availableShops.map(shop => (
                    <option key={shop.id} value={shop.id}>
                      {shop.name} - {shop.city}
                    </option>
                  ))}
                </select>
                {availableShops.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">All approved shops are already assigned to routes</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sequence</label>
                <input
                  type="number"
                  min="1"
                  value={newSequence}
                  onChange={(e) => setNewSequence(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-gray-900 bg-white"
                  placeholder="Delivery order (1, 2, 3...)"
                />
                <p className="text-xs text-gray-500 mt-1">Next available: {shops.length + 1}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={handleAddShopToRoute}
                disabled={saving || !selectedShopId || !newSequence}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
              >
                Add Shop
              </button>
              <button
                onClick={() => { setShowAddShop(false); setSelectedShopId(''); setNewSequence(''); }}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deliveries for this Route */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">Deliveries</h2>
          <Link
            href={`/dashboard/deliveries/create?route_id=${route.id}`}
            className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg"
          >
            + Add Delivery
          </Link>
        </div>
        <div className="p-6 text-center text-gray-500">
          Deliveries for this route will appear here
        </div>
      </div>
    </div>
  )
}
