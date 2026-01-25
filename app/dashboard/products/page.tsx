'use client'

import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ProductsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    loadProducts()
  }, [])

  const loadProducts = async () => {
    const { data } = await supabase.from('products').select('*').order('created_at', { ascending: false })
    setProducts(data || [])
    setLoading(false)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return
    
    setDeleting(id)
    try {
      const { error } = await supabase.from('products').delete().eq('id', id)
      if (error) throw error
      setProducts(products.filter(product => product.id !== id))
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
        <h1 className="text-3xl font-bold text-gray-900">Products / SKUs</h1>
        <Link href="/dashboard/products/create" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium">
          + Add Product
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {products && products.length > 0 ? (
          products.map((product: any) => (
            <div key={product.id} className="bg-white rounded-lg shadow p-6">
              <div className="text-3xl mb-3">📦</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{product.name}</h3>
              <p className="text-sm text-gray-600 mb-1">SKU: {product.sku || 'N/A'}</p>
              <p className="text-sm text-gray-600 mb-1">Unit: {product.uom}</p>
              <p className="text-sm text-gray-600 mb-4">Shelf Life: {product.shelf_life_days || 'N/A'} days</p>
              <div className="flex gap-3">
                <Link href={`/dashboard/products/${product.id}`} className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                  Edit →
                </Link>
                <button
                  onClick={() => handleDelete(product.id, product.name)}
                  disabled={deleting === product.id}
                  className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50"
                >
                  {deleting === product.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-4 text-center py-12 text-gray-500">
            No products found. Add your first product.
          </div>
        )}
      </div>
    </div>
  )
}
