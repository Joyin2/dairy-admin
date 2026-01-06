import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function SuppliersPage() {
  const supabase = await createClient()

  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('*, app_users(name)')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Suppliers (Farmers)</h1>
        <Link
          href="/dashboard/suppliers/create"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
        >
          + Add Supplier
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Address</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">KYC Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {suppliers && suppliers.length > 0 ? (
              suppliers.map((supplier: any) => (
                <tr key={supplier.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{supplier.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{supplier.phone || 'N/A'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{supplier.email || 'N/A'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{supplier.address || 'N/A'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      supplier.kyc_status === 'approved' ? 'bg-green-100 text-green-800' :
                      supplier.kyc_status === 'rejected' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {supplier.kyc_status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <Link href={`/dashboard/suppliers/${supplier.id}`} className="text-blue-600 hover:text-blue-900">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                  No suppliers found. Add your first supplier.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
