'use client'

import { db } from '@/lib/firebase/client'
import { collection, query, where, getDocs, orderBy, limit, doc, deleteDoc } from 'firebase/firestore'
import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function ShopsPage() {
  const [shops, setShops] = useState<any[]>([])
  const [routes, setRoutes] = useState<any[]>([])
  const [selectedRoute, setSelectedRoute] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    loadRoutes()
  }, [])

  useEffect(() => {
    loadShops()
  }, [selectedRoute])

  const loadRoutes = async () => {
    const q = query(
      collection(db, 'routes'),
      where('is_active', '==', true),
      orderBy('name'),
      limit(50)
    )
    const snap = await getDocs(q)
    setRoutes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }

  const loadShops = async () => {
    setLoading(true)
    let q
    if (selectedRoute) {
      q = query(
        collection(db, 'shops'),
        where('route_id', '==', selectedRoute)
      )
    } else {
      q = query(collection(db, 'shops'))
    }

    const snap = await getDocs(q)
    const rawShops = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]
    rawShops.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))

    // Fetch related route and created_by_user for each shop
    const shopsWithJoins = await Promise.all(rawShops.map(async (shop) => {
      if (shop.route_id) {
        try {
          const routeSnap = await getDocs(
            query(collection(db, 'routes'), where('__name__', '==', shop.route_id))
          )
          shop.routes = routeSnap.empty ? null : { id: routeSnap.docs[0].id, ...routeSnap.docs[0].data() }
        } catch {
          shop.routes = null
        }
      } else {
        shop.routes = null
      }

      if (shop.created_by) {
        try {
          const userQ = query(collection(db, 'app_users'), where('__name__', '==', shop.created_by))
          const userSnap = await getDocs(userQ)
          shop.created_by_user = userSnap.empty ? null : { id: userSnap.docs[0].id, ...userSnap.docs[0].data() }
        } catch {
          shop.created_by_user = null
        }
      } else {
        shop.created_by_user = null
      }

      return shop
    }))

    setShops(shopsWithJoins)
    setLoading(false)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return

    setDeleting(id)
    try {
      await deleteDoc(doc(db, 'shops', id))
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
