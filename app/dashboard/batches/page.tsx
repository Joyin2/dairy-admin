import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function BatchesPage() {
  const supabase = await createClient()

  const { data: batches } = await supabase
    .from('batches')
    .select('*, products(name), app_users(name)')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Production Batches</h1>
        <Link href="/dashboard/batches/create" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium">
          + Create Batch
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Total Batches</div>
          <div className="text-2xl font-bold text-blue-600">{batches?.length || 0}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Pending QC</div>
          <div className="text-2xl font-bold text-yellow-600">
            {batches?.filter(b => b.qc_status === 'pending').length || 0}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Total Yield</div>
          <div className="text-2xl font-bold text-green-600">
            {batches?.reduce((sum, b) => sum + parseFloat(b.yield_qty || 0), 0).toFixed(2) || 0}L
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch Code</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Yield Qty</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Production Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expiry</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">QC Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {batches && batches.length > 0 ? (
              batches.map((batch: any) => (
                <tr key={batch.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{batch.batch_code}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {batch.products?.name || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{batch.yield_qty}L</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(batch.production_date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {batch.expiry_date ? new Date(batch.expiry_date).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      batch.qc_status === 'approved' ? 'bg-green-100 text-green-800' :
                      batch.qc_status === 'rejected' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {batch.qc_status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <Link href={`/dashboard/batches/${batch.id}`} className="text-blue-600 hover:text-blue-900">
                      View
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                  No batches found. Create your first production batch.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
