'use client'

import { useState, useEffect } from 'react'
import { db } from '@/lib/firebase/client'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { useRouter, useParams } from 'next/navigation'

export default function EditProductPage() {
  const router = useRouter()
  const params = useParams()

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    uom: 'liter',
    shelf_life_days: '',
    retail_rate: '',
    wholesale_rate: ''
  })
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uomOther, setUomOther] = useState('')

  useEffect(() => {
    loadProduct()
  }, [])

  const loadProduct = async () => {
    try {
      const docRef = doc(db, 'products', params.id as string)
      const snap = await getDoc(docRef)

      if (!snap.exists()) throw new Error('Product not found')

      const data = snap.data()
      setFormData({
        name: data.name || '',
        sku: data.sku || '',
        uom: ['liter', 'kg', 'piece', 'box'].includes(data.uom) ? data.uom : (data.uom ? 'other' : 'liter'),
        shelf_life_days: data.shelf_life_days?.toString() || '',
        retail_rate: data.retail_rate != null ? String(data.retail_rate) : '',
        wholesale_rate: data.wholesale_rate != null ? String(data.wholesale_rate) : ''
      })
      if (data.uom && !['liter', 'kg', 'piece', 'box'].includes(data.uom)) {
        setUomOther(data.uom)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingData(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const docRef = doc(db, 'products', params.id as string)
      await updateDoc(docRef, {
        name: formData.name,
        sku: formData.sku,
        uom: formData.uom === 'other' ? uomOther : formData.uom,
        shelf_life_days: formData.shelf_life_days ? parseInt(formData.shelf_life_days) : null,
        retail_rate: formData.retail_rate ? parseFloat(formData.retail_rate) : null,
        wholesale_rate: formData.wholesale_rate ? parseFloat(formData.wholesale_rate) : null,
        updated_at: new Date().toISOString(),
      })

      router.push('/dashboard/products')
    } catch (err: any) {
      setError(err.message || 'Failed to update product')
    } finally {
      setLoading(false)
    }
  }

  const generateSKU = () => {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substr(2, 5).toUpperCase()
    setFormData({ ...formData, sku: `PRD-${timestamp}-${random}` })
  }

  if (loadingData) {
    return (
      <div className="max-w-2xl">
        <div className="text-center py-12">
          <div className="text-gray-500">Loading product data...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Edit Product</h1>
      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Product Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">SKU</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
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
              <select
                value={formData.uom}
                onChange={(e) => setFormData({ ...formData, uom: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
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
                  className="w-full mt-2 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Specify unit of measure"
                  required
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Shelf Life (days)</label>
              <input
                type="number"
                value={formData.shelf_life_days}
                onChange={(e) => setFormData({ ...formData, shelf_life_days: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t pt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Retail Rate (₹/unit)</label>
              <input
                type="number"
                step="0.01"
                value={formData.retail_rate}
                onChange={(e) => setFormData({ ...formData, retail_rate: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Default for retail shops"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Wholesale Rate (₹/unit)</label>
              <input
                type="number"
                step="0.01"
                value={formData.wholesale_rate}
                onChange={(e) => setFormData({ ...formData, wholesale_rate: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Default for wholesale shops"
              />
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update Product'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-2 rounded-lg font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
