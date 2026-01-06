import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function CollectionsPage() {
  const supabase = await createClient()

  const { data: collections } = await supabase
    .from('milk_collections')
    .select('*, suppliers(name), app_users(name)')
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Milk Collections</h1>
          <p className="text-gray-600 mt-1">Record and approve milk collections from suppliers</p>
        </div>
        <Link
          href="/dashboard/collections/create"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
        >
          + New Collection
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Total Today</div>
          <div className="text-2xl font-bold text-blue-600">
            {collections?.filter(c => new Date(c.created_at).toDateString() === new Date().toDateString()).length || 0}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Pending QC</div>
          <div className="text-2xl font-bold text-yellow-600">
            {collections?.filter(c => c.qc_status === 'pending').length || 0}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Approved</div>
          <div className="text-2xl font-bold text-green-600">
            {collections?.filter(c => c.qc_status === 'approved').length || 0}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Total Liters</div>
          <div className="text-2xl font-bold text-gray-900">
            {collections?.reduce((sum, c) => sum + parseFloat(c.qty_liters || 0), 0).toFixed(2) || 0}L
          </div>
        </div>
      </div>

      {/* Collections Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date/Time</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fat %</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SNF %</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Operator</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">QC Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {collections && collections.length > 0 ? (
              collections.map((collection: any) => (
                <tr key={collection.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(collection.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                    {collection.suppliers?.name || 'Unknown'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {collection.qty_liters}L
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {collection.fat || 'N/A'}%
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {collection.snf || 'N/A'}%
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {collection.app_users?.name || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      collection.qc_status === 'approved' ? 'bg-green-100 text-green-800' :
                      collection.qc_status === 'rejected' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {collection.qc_status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      collection.status === 'used_in_batch' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {collection.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <Link
                      href={`/dashboard/collections/${collection.id}`}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="px-6 py-4 text-center text-gray-500">
                  No collections found. Record your first collection.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
