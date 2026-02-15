'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function CreateCollectionPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [formData, setFormData] = useState({
    supplier_id: '',
    qty_liters: '',
    fat: '',
    snf: '',
    price_per_liter: '',
    photo_url: '',
    qc_status: 'pending' as 'pending' | 'approved' | 'rejected',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSuppliers = async () => {
      const { data } = await supabase.from('suppliers').select('id, name').order('name')
      setSuppliers(data || [])
    }
    fetchSuppliers()
  }, [supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      // Get app_users.id from auth_uid
      const { data: appUser } = await supabase
        .from('app_users')
        .select('id')
        .eq('auth_uid', user?.id)
        .single()
      
      const { error: insertError } = await supabase
        .from('milk_collections')
        .insert({
          supplier_id: formData.supplier_id,
          operator_user_id: appUser?.id,
          qty_liters: parseFloat(formData.qty_liters),
          fat: formData.fat ? parseFloat(formData.fat) : null,
          snf: formData.snf ? parseFloat(formData.snf) : null,
          price_per_liter: formData.price_per_liter ? parseFloat(formData.price_per_liter) : null,
          photo_url: formData.photo_url || null,
          qc_status: formData.qc_status,
          status: 'new',
        })

      if (insertError) throw insertError

      router.push('/dashboard/collections')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to create collection')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Record Milk Collection</h1>

      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Supplier <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={formData.supplier_id}
              onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            >
              <option value="">Select Supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quantity (Liters) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.001"
                required
                value={formData.qty_liters}
                onChange={(e) => setFormData({ ...formData, qty_liters: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Fat %</label>
              <input
                type="number"
                step="0.01"
                value={formData.fat}
                onChange={(e) => setFormData({ ...formData, fat: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">SNF %</label>
              <input
                type="number"
                step="0.01"
                value={formData.snf}
                onChange={(e) => setFormData({ ...formData, snf: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Price per Liter (₹)
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.price_per_liter}
              onChange={(e) => setFormData({ ...formData, price_per_liter: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              placeholder="Enter price per liter"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Photo URL</label>
            <input
              type="url"
              value={formData.photo_url}
              onChange={(e) => setFormData({ ...formData, photo_url: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">QC Status</label>
            <select
              value={formData.qc_status}
              onChange={(e) => setFormData({ ...formData, qc_status: e.target.value as any })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              {loading ? 'Recording...' : 'Record Collection'}
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
