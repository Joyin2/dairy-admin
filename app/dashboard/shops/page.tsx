'use client'

import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ShopsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [shops, setShops] = useState<any[]>([])
  const [routes, setRoutes] = useState<any[]>([])
  const [selectedRoute, setSelectedRoute] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    loadShops()
    loadRoutes()
  }, [])

  useEffect(() => {
    loadShops()
  }, [selectedRoute])

  const loadRoutes = async () => {
    const { data } = await supabase
      .from('routes')
      .select('id, name, area, is_active')
      .eq('is_active', true)
      .order('name')
      .limit(50)
    setRoutes(data || [])
  }

  const loadShops = async () => {
    setLoading(true)
    let query = supabase
      .from('shops')
      .select('*, routes(name, area, is_active), created_by_user:app_users!shops_created_by_fkey(name, email)')
      .order('created_at', { ascending: false })
    
    if (selectedRoute) {
      query = query.eq('route_id', selectedRoute)
    }
    
    const { data } = await query
    setShops(data || [])
    setLoading(false)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return
    
    setDeleting(id)
    try {
      const { error } = await supabase.from('shops').delete().eq('id', id)
      if (error) throw error
      setShops(shops.filter(shop => shop.id !== id))
    } catch (err: any) {
      alert('Failed to delete: ' + err.message)
    } finally {
      setDeleting(null)
    }
  }

  if (loading) {
    return <div className="text-center py-12">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Shops / Retailers</h1>
        <Link href="/dashboard/shops/create" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium">
          + Add Shop
        </Link>
      </div>

      {/* Filter by Route */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Filter by Route:</label>
          <select
            value={selectedRoute}
            onChange={(e) => setSelectedRoute(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Shops</option>
            {routes.map(route => (
              <option key={route.id} value={route.id}>
                {route.name} {route.area ? `(${route.area})` : ''}
              </option>
            ))}
          </select>
          {selectedRoute && (
            <button
              onClick={() => setSelectedRoute('')}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Clear Filter
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shop Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">City</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned Route</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sequence</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created By</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shop Type</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {shops && shops.length > 0 ? (
                shops.map((shop: any) => (
                  <tr key={shop.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{shop.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{shop.owner_name || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{shop.contact || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{shop.city || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {shop.routes ? (
                        <Link href={`/dashboard/routes/${shop.route_id}`} className="text-blue-600 hover:text-blue-800">
                          {shop.routes.name}
                        </Link>
                      ) : (
                        <span className="text-gray-400">Not assigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {shop.sequence || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        shop.status === 'approved' ? 'bg-green-100 text-green-800' :
                        shop.status === 'pending_approval' ? 'bg-yellow-100 text-yellow-800' :
                        shop.status === 'rejected' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {shop.status === 'pending_approval' ? 'Pending' : 
                         shop.status === 'approved' ? 'Approved' : 
                         shop.status === 'rejected' ? 'Rejected' : 'Unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {shop.created_by_user?.name || 'Admin'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                        {shop.shop_type === 'retail' ? 'Retail' :
                         shop.shop_type === 'wholesale' ? 'Wholesale' :
                         shop.shop_type === 'distributor' ? 'Distributor' : 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <div className="flex justify-end gap-2">
                        <Link href={`/dashboard/shops/${shop.id}`} className="text-blue-600 hover:text-blue-900">
                          Edit
                        </Link>
                        <button
                          onClick={() => handleDelete(shop.id, shop.name)}
                          disabled={deleting === shop.id}
                          className="text-red-600 hover:text-red-900 disabled:opacity-50"
                        >
                          {deleting === shop.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="px-6 py-4 text-center text-gray-500">
                    No shops found. Add your first shop.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
