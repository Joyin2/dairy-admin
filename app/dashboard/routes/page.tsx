'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { db } from '@/lib/firebase/client'
import { collection, query, where, getDocs, limit, doc, deleteDoc, getCountFromServer } from 'firebase/firestore'

export default function RoutesPage() {
  const [routes, setRoutes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    const fetchRoutes = async () => {
      setLoading(true)
      const q = query(
        collection(db, 'routes'),
        where('is_active', '==', true),
        limit(50)
      )
      const snap = await getDocs(q)
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]
      data.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))

      // For each route, fetch agent, created_by_user, and shop count
      const routesWithDetails = await Promise.all(
        data.map(async (route) => {
          // Fetch agent
          if (route.agent_id) {
            try {
              const agentQ = query(collection(db, 'app_users'), where('__name__', '==', route.agent_id))
              const agentSnap = await getDocs(agentQ)
              route.agent = agentSnap.empty ? null : { id: agentSnap.docs[0].id, ...agentSnap.docs[0].data() }
            } catch {
              route.agent = null
            }
          } else {
            route.agent = null
          }

          // Fetch created_by_user
          if (route.created_by) {
            try {
              const userQ = query(collection(db, 'app_users'), where('__name__', '==', route.created_by))
              const userSnap = await getDocs(userQ)
              route.created_by_user = userSnap.empty ? null : { id: userSnap.docs[0].id, ...userSnap.docs[0].data() }
            } catch {
              route.created_by_user = null
            }
          } else {
            route.created_by_user = null
          }

          // Get shop count
          try {
            const shopCountQ = query(collection(db, 'shops'), where('route_id', '==', route.id))
            const countSnap = await getCountFromServer(shopCountQ)
            route.shopCount = countSnap.data().count
          } catch {
            route.shopCount = 0
          }

          return route
        })
      )

      setRoutes(routesWithDetails)
      setLoading(false)
    }
    fetchRoutes()
  }, [])

  const handleDelete = async (routeId: string, routeName: string) => {
    if (!confirm(`Are you sure you want to delete route "${routeName}"? This will also remove all shop assignments for this route.`)) {
      return
    }

    setDeleting(routeId)
    try {
      await deleteDoc(doc(db, 'routes', routeId))
      setRoutes(routes.filter(r => r.id !== routeId))
      alert('Route deleted successfully')
    } catch (error: any) {
      console.error('Error deleting route:', error)
      alert('Failed to delete route: ' + error.message)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Routes</h1>
          <p className="text-sm text-gray-500 mt-1">Permanent route structures for deliveries</p>
        </div>
        <Link
          href="/dashboard/routes/create"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          + Create Route
        </Link>
      </div>

      {/* Routes List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : routes.length > 0 ? (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Route Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Area / Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shops</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created By</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {routes.map((route: any) => (
                <tr key={route.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{route.name}</div>
                    {route.description && (
                      <div className="text-sm text-gray-500">{route.description}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {route.agent?.name || 'Unassigned'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{route.area || 'N/A'}</div>
                    <div className="text-xs text-gray-500 capitalize">{route.delivery_type || 'morning'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-900 font-medium">{route.shopCount || 0}</span>
                    <span className="text-xs text-gray-500"> shops</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 text-xs rounded-full ${
                      route.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {route.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {route.created_by_user?.name || 'System'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-3">
                      <Link
                        href={`/dashboard/routes/${route.id}`}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => handleDelete(route.id, route.name)}
                        disabled={deleting === route.id}
                        className="text-red-600 hover:text-red-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {deleting === route.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-gray-500">
            No routes found. Create your first permanent route to get started.
          </div>
        )}
      </div>
    </div>
  )
}
