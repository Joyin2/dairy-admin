import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function ShopsPage() {
  const supabase = await createClient()
  const { data: shops } = await supabase.from('shops').select('*').order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Shops / Retailers</h1>
        <Link href="/dashboard/shops/create" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium">
          + Add Shop
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {shops && shops.length > 0 ? (
          shops.map((shop: any) => (
            <div key={shop.id} className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{shop.name}</h3>
              <p className="text-sm text-gray-600 mb-1">📞 {shop.contact || 'N/A'}</p>
              <p className="text-sm text-gray-600 mb-4">📍 {shop.address || 'N/A'}</p>
              <Link href={`/dashboard/shops/${shop.id}`} className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                Edit Details →
              </Link>
            </div>
          ))
        ) : (
          <div className="col-span-3 text-center py-12 text-gray-500">
            No shops found. Add your first shop.
          </div>
        )}
      </div>
    </div>
  )
}
