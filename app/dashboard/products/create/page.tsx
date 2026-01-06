'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function CreateProductPage() {
  const router = useRouter()
  const supabase = createClient()
  const [formData, setFormData] = useState({ sku: '', name: '', uom: 'liter', shelf_life_days: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error: insertError } = await supabase.from('products').insert({
        ...formData,
        shelf_life_days: formData.shelf_life_days ? parseInt(formData.shelf_life_days) : null
      })
      if (insertError) throw insertError
      router.push('/dashboard/products')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to create product')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Add New Product</h1>
      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>}
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Product Name <span className="text-red-500">*</span></label>
              <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">SKU</label>
              <input type="text" value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Unit of Measure</label>
              <select value={formData.uom} onChange={(e) => setFormData({ ...formData, uom: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="liter">Liter</option>
                <option value="kg">Kilogram</option>
                <option value="piece">Piece</option>
                <option value="box">Box</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Shelf Life (days)</label>
              <input type="number" value={formData.shelf_life_days} onChange={(e) => setFormData({ ...formData, shelf_life_days: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50">
              {loading ? 'Creating...' : 'Create Product'}
            </button>
            <button type="button" onClick={() => router.back()} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-2 rounded-lg font-medium">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
