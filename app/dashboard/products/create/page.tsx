'use client'

import { useState } from 'react'
import { db } from '@/lib/firebase/client'
import { collection, addDoc } from 'firebase/firestore'
import { useRouter } from 'next/navigation'

export default function CreateProductPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({ sku: '', name: '', uom: 'liter', shelf_life_days: '', retail_rate: '', wholesale_rate: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uomOther, setUomOther] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Auto-generate SKU if empty
      let skuToUse = formData.sku
      if (!skuToUse) {
        skuToUse = `PRD-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`
      }

      await addDoc(collection(db, 'products'), {
        ...formData,
        uom: formData.uom === 'other' ? uomOther : formData.uom,
        sku: skuToUse,
        shelf_life_days: formData.shelf_life_days ? parseInt(formData.shelf_life_days) : null,
        retail_rate: formData.retail_rate ? parseFloat(formData.retail_rate) : null,
        wholesale_rate: formData.wholesale_rate ? parseFloat(formData.wholesale_rate) : null,
        created_at: new Date().toISOString(),
      })
      router.push('/dashboard/products')
    } catch (err: any) {
      setError(err.message || 'Failed to create product')
    } finally {
      setLoading(false)
    }
  }

  const generateSKU = () => {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substr(2, 5).toUpperCase()
    setFormData({ ...formData, sku: `PRD-${timestamp}-${random}` })
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">SKU</label>
              <div className="flex gap-2">
                <input type="text" value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  placeholder="Leave empty to auto-generate" />
                <button
                  type="button"
                  onClick={generateSKU}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium whitespace-nowrap"
                >
                  Generate
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Unit of Measure</label>
              <select value={formData.uom} onChange={(e) => setFormData({ ...formData, uom: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white">
                <option value="liter">Liter</option>
                <option value="kg">Kilogram</option>
                <option value="piece">Piece</option>
                <option value="box">Box</option>
                <option value="other">Other</option>
              </select>
              {formData.uom === 'other' && (
                <input
                  type="text"
                  value={uomOther}
                  onChange={(e) => setUomOther(e.target.value)}
                  className="w-full mt-2 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  placeholder="Specify unit of measure"
                  required
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Shelf Life (days)</label>
              <input type="number" value={formData.shelf_life_days} onChange={(e) => setFormData({ ...formData, shelf_life_days: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t pt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Retail Rate (₹/unit)</label>
              <input type="number" step="0.01" value={formData.retail_rate} onChange={(e) => setFormData({ ...formData, retail_rate: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                placeholder="Default for retail shops" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Wholesale Rate (₹/unit)</label>
              <input type="number" step="0.01" value={formData.wholesale_rate} onChange={(e) => setFormData({ ...formData, wholesale_rate: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                placeholder="Default for wholesale shops" />
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
