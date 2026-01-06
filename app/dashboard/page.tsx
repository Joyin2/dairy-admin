import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()

  // Fetch dashboard statistics
  const [
    { count: totalCollections },
    { count: todayCollections },
    { count: pendingDeliveries },
    { count: activeRoutes },
    { count: totalSuppliers },
    { count: totalShops },
  ] = await Promise.all([
    supabase.from('milk_collections').select('*', { count: 'exact', head: true }),
    supabase
      .from('milk_collections')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', new Date().toISOString().split('T')[0]),
    supabase.from('deliveries').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase
      .from('routes')
      .select('*', { count: 'exact', head: true })
      .eq('date', new Date().toISOString().split('T')[0]),
    supabase.from('suppliers').select('*', { count: 'exact', head: true }),
    supabase.from('shops').select('*', { count: 'exact', head: true }),
  ])

  // Get recent collections
  const { data: recentCollections } = await supabase
    .from('milk_collections')
    .select('*, suppliers(name), app_users(name)')
    .order('created_at', { ascending: false })
    .limit(5)

  // Get pending deliveries
  const { data: pendingDeliveriesData } = await supabase
    .from('deliveries')
    .select('*, shops(name), routes(name)')
    .eq('status', 'pending')
    .limit(5)

  const stats = [
    { label: 'Total Collections', value: totalCollections || 0, icon: '🥛', color: 'bg-blue-500' },
    { label: "Today's Collections", value: todayCollections || 0, icon: '📅', color: 'bg-green-500' },
    {
      label: 'Pending Deliveries',
      value: pendingDeliveries || 0,
      icon: '🚚',
      color: 'bg-yellow-500',
    },
    { label: 'Active Routes', value: activeRoutes || 0, icon: '🗺️', color: 'bg-purple-500' },
    { label: 'Total Suppliers', value: totalSuppliers || 0, icon: '🚜', color: 'bg-indigo-500' },
    { label: 'Total Shops', value: totalShops || 0, icon: '🏪', color: 'bg-pink-500' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <div className="text-sm text-gray-500">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
              </div>
              <div className={`${stat.color} rounded-full p-4 text-3xl`}>{stat.icon}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Collections */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Recent Collections</h2>
              <Link
                href="/dashboard/collections"
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                View all →
              </Link>
            </div>
          </div>
          <div className="p-6">
            {recentCollections && recentCollections.length > 0 ? (
              <div className="space-y-4">
                {recentCollections.map((collection: any) => (
                  <div key={collection.id} className="flex justify-between items-center py-2">
                    <div>
                      <p className="font-medium text-gray-900">
                        {collection.suppliers?.name || 'Unknown Supplier'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {collection.qty_liters}L • Fat: {collection.fat}% • SNF: {collection.snf}%
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          collection.qc_status === 'approved'
                            ? 'bg-green-100 text-green-800'
                            : collection.qc_status === 'rejected'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {collection.qc_status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No collections yet</p>
            )}
          </div>
        </div>

        {/* Pending Deliveries */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Pending Deliveries</h2>
              <Link
                href="/dashboard/deliveries"
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                View all →
              </Link>
            </div>
          </div>
          <div className="p-6">
            {pendingDeliveriesData && pendingDeliveriesData.length > 0 ? (
              <div className="space-y-4">
                {pendingDeliveriesData.map((delivery: any) => (
                  <div key={delivery.id} className="flex justify-between items-center py-2">
                    <div>
                      <p className="font-medium text-gray-900">
                        {delivery.shops?.name || 'Unknown Shop'}
                      </p>
                      <p className="text-sm text-gray-500">
                        Route: {delivery.routes?.name || 'N/A'} • {delivery.expected_qty}L
                      </p>
                    </div>
                    <span className="px-3 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                      {delivery.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No pending deliveries</p>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link
            href="/dashboard/collections"
            className="flex flex-col items-center justify-center p-4 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
          >
            <span className="text-3xl mb-2">🥛</span>
            <span className="text-sm font-medium text-gray-900">New Collection</span>
          </Link>
          <Link
            href="/dashboard/batches"
            className="flex flex-col items-center justify-center p-4 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
          >
            <span className="text-3xl mb-2">🏭</span>
            <span className="text-sm font-medium text-gray-900">Create Batch</span>
          </Link>
          <Link
            href="/dashboard/routes"
            className="flex flex-col items-center justify-center p-4 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
          >
            <span className="text-3xl mb-2">🗺️</span>
            <span className="text-sm font-medium text-gray-900">New Route</span>
          </Link>
          <Link
            href="/dashboard/reports"
            className="flex flex-col items-center justify-center p-4 bg-pink-50 hover:bg-pink-100 rounded-lg transition-colors"
          >
            <span className="text-3xl mb-2">📈</span>
            <span className="text-sm font-medium text-gray-900">View Reports</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
