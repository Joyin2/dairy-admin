'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function RoutesPage() {
  const supabase = createClient()
  const [routes, setRoutes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    const fetchRoutes = async () => {
      setLoading(true)
      // Fetch permanent routes (not date-based)
      // Use explicit foreign key names to avoid ambiguity
      const { data, error } = await supabase
        .from('routes')
        .select(`
          *, 
          agent:app_users!routes_agent_id_fkey(name, email),
          created_by_user:app_users!routes_created_by_fkey(name, email)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(50)
      
      if (!error && data) {
        // For each route, get shop count from shops table
        const routesWithCounts = await Promise.all(
          data.map(async (route) => {
            const { count } = await supabase
              .from('shops')
              .select('*', { count: 'exact', head: true })
              .eq('route_id', route.id)
            
            return {
              ...route,
              shopCount: count || 0,
            }
          })
        )
        setRoutes(routesWithCounts)
      }
      setLoading(false)
    }
    fetchRoutes()
  }, [supabase])

  const handleDelete = async (routeId: string, routeName: string) => {
    if (!confirm(`Are you sure you want to delete route "${routeName}"? This will also remove all shop assignments for this route.`)) {
      return
    }

    setDeleting(routeId)
    try {
      const { error } = await supabase
        .from('routes')
        .delete()
        .eq('id', routeId)

      if (error) throw error

      // Remove from local state
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
