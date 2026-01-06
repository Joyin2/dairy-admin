'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function CreateBatchPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [products, setProducts] = useState<any[]>([])
  const [collections, setCollections] = useState<any[]>([])
  const [selectedCollections, setSelectedCollections] = useState<string[]>([])
  const [formData, setFormData] = useState({
    product_id: '',
    yield_qty: '',
    expiry_date: '',
    batch_code: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      const [productsRes, collectionsRes] = await Promise.all([
        supabase.from('products').select('id, name').order('name'),
        supabase.from('milk_collections').select('*, suppliers(name)')
          .eq('qc_status', 'approved').eq('status', 'new').order('created_at', { ascending: false })
      ])
      setProducts(productsRes.data || [])
      setCollections(collectionsRes.data || [])
    }
    fetchData()
  }, [supabase])

  const toggleCollection = (id: string) => {
    setSelectedCollections(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedCollections.length === 0) {
      setError('Select at least one collection')
      return
    }
    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      const { data, error: batchError } = await supabase.rpc('create_batch', {
        p_created_by: user?.id,
        p_input_collection_ids: selectedCollections,
        p_product_id: formData.product_id,
        p_yield_qty: parseFloat(formData.yield_qty),
        p_expiry_date: formData.expiry_date || null,
        p_batch_code: formData.batch_code || null,
      })

      if (batchError) throw batchError

      router.push('/dashboard/batches')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to create batch')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Create Production Batch</h1>

      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Product <span className="text-red-500">*</span>
              </label>
              <select required value={formData.product_id} onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="">Select Product</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Yield Quantity <span className="text-red-500">*</span>
              </label>
              <input type="number" step="0.001" required value={formData.yield_qty}
                onChange={(e) => setFormData({ ...formData, yield_qty: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Batch Code (optional)</label>
              <input type="text" value={formData.batch_code}
                onChange={(e) => setFormData({ ...formData, batch_code: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Expiry Date</label>
              <input type="date" value={formData.expiry_date}
                onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="border-t pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Select Collections ({selectedCollections.length} selected)
            </label>
            <div className="max-h-96 overflow-y-auto border rounded-lg">
              {collections.length > 0 ? (
                collections.map((c: any) => (
                  <div key={c.id} className="flex items-center p-3 hover:bg-gray-50 border-b">
                    <input type="checkbox" checked={selectedCollections.includes(c.id)}
                      onChange={() => toggleCollection(c.id)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                    <div className="ml-3 flex-1">
                      <div className="text-sm font-medium text-gray-900">{c.suppliers?.name}</div>
                      <div className="text-xs text-gray-500">
                        {c.qty_liters}L • Fat: {c.fat}% • SNF: {c.snf}% • {new Date(c.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 text-center text-gray-500">No approved collections available</div>
              )}
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50">
              {loading ? 'Creating...' : 'Create Batch'}
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
