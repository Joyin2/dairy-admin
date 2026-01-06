'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function CreateShopPage() {
  const router = useRouter()
  const supabase = createClient()
  const [formData, setFormData] = useState({ name: '', contact: '', address: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error: insertError } = await supabase.from('shops').insert(formData)
      if (insertError) throw insertError
      router.push('/dashboard/shops')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to create shop')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Add New Shop</h1>
      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Shop Name <span className="text-red-500">*</span></label>
            <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Contact</label>
            <input type="text" value={formData.contact} onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
            <textarea rows={3} value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="flex gap-4 pt-4">
            <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50">
              {loading ? 'Creating...' : 'Create Shop'}
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
