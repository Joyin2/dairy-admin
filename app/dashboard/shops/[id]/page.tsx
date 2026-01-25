'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'

export default function EditShopPage() {
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()
  const [routes, setRoutes] = useState<any[]>([])
  
  const [formData, setFormData] = useState({
    name: '',
    owner_name: '',
    contact: '',
    alternate_contact: '',
    email: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    gst_number: '',
    pan_number: '',
    shop_type: 'retail',
    credit_limit: '',
    payment_terms: 'immediate',
    route_id: '',
    bank_account: {
      account_number: '',
      ifsc: '',
      bank_name: '',
      account_holder: '',
      branch: '',
    },
  })
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [originalRouteId, setOriginalRouteId] = useState('')
  const [pendingBalance, setPendingBalance] = useState(0)

  useEffect(() => {
    loadShop()
    fetchRoutes()
    fetchPendingBalance()

    // Set up real-time subscription for delivery updates affecting this shop
    const channel = supabase
      .channel('shop-deliveries')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deliveries',
          filter: `shop_id=eq.${params.id}`,
        },
        () => {
          // Refetch pending balance when delivery is updated
          fetchPendingBalance()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const fetchRoutes = async () => {
    const { data } = await supabase
      .from('routes')
      .select('id, name, area, is_active')
      .eq('is_active', true)
      .order('name')
      .limit(50)
    setRoutes(data || [])
  }

  const fetchPendingBalance = async () => {
    const { data } = await supabase
      .from('deliveries')
      .select('expected_amount, collected_amount')
      .eq('shop_id', params.id)
      .in('status', ['delivered', 'partial'])
    
    if (data) {
      const balance = data.reduce((sum, d) => {
        const expected = d.expected_amount || 0
        const collected = d.collected_amount || 0
        return sum + (expected - collected)
      }, 0)
      setPendingBalance(balance)
    }
  }

  const loadShop = async () => {
    try {
      const { data, error } = await supabase
        .from('shops')
        .select('*, routes(name, area)')
        .eq('id', params.id)
        .single()

      if (error) throw error
      
      setFormData({
        name: data.name || '',
        owner_name: data.owner_name || '',
        contact: data.contact || '',
        alternate_contact: data.alternate_contact || '',
        email: data.email || '',
        address: data.address || '',
        city: data.city || '',
        state: data.state || '',
        pincode: data.pincode || '',
        gst_number: data.gst_number || '',
        pan_number: data.pan_number || '',
        shop_type: data.shop_type || 'retail',
        credit_limit: data.credit_limit || '',
        payment_terms: data.payment_terms || 'immediate',
        route_id: data.route_id || '',
        bank_account: data.bank_account || {
          account_number: '',
          ifsc: '',
          bank_name: '',
          account_holder: '',
          branch: '',
        },
      })
      setOriginalRouteId(data.route_id || '')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingData(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Warn if changing routes
    if (originalRouteId && formData.route_id && originalRouteId !== formData.route_id) {
      if (!confirm('This shop is already assigned to a route. Changing routes will reassign the shop. Continue?')) {
        return
      }
    }
    
    setLoading(true)
    setError(null)

    try {
      const { error: updateError } = await supabase
        .from('shops')
        .update({
          name: formData.name,
          owner_name: formData.owner_name,
          contact: formData.contact,
          alternate_contact: formData.alternate_contact,
          email: formData.email,
          address: formData.address,
          city: formData.city,
          state: formData.state,
          pincode: formData.pincode,
          gst_number: formData.gst_number,
          pan_number: formData.pan_number,
          shop_type: formData.shop_type,
          credit_limit: formData.credit_limit,
          payment_terms: formData.payment_terms,
          route_id: formData.route_id || null,
          bank_account: formData.bank_account,
        })
        .eq('id', params.id)

      if (updateError) throw updateError

      router.push('/dashboard/shops')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to update shop')
    } finally {
      setLoading(false)
    }
  }

  if (loadingData) {
    return (
      <div className="max-w-3xl">
        <div className="text-center py-12">
          <div className="text-gray-500">Loading shop data...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Edit Shop</h1>

      {/* Pending Balance Alert */}
      {pendingBalance > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-orange-800">Pending Payment</h3>
              <p className="text-xs text-orange-600 mt-1">This shop has outstanding balance</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-orange-800">₹{pendingBalance.toFixed(2)}</p>
              <p className="text-xs text-orange-600">Amount Due</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Shop Name <span className="text-red-500">*</span>
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
              <label className="block text-sm font-medium text-gray-700 mb-2">Owner Name</label>
              <input
                type="text"
                value={formData.owner_name}
                onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Contact</label>
              <input
                type="tel"
                value={formData.contact}
                onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Alternate Contact</label>
              <input
                type="tel"
                value={formData.alternate_contact}
                onChange={(e) => setFormData({ ...formData, alternate_contact: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
            <textarea
              rows={2}
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
              <input
                type="text"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Pincode</label>
              <input
                type="text"
                value={formData.pincode}
                onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">GST Number</label>
              <input
                type="text"
                value={formData.gst_number}
                onChange={(e) => setFormData({ ...formData, gst_number: e.target.value.toUpperCase() })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="22AAAAA0000A1Z5"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">PAN Number</label>
              <input
                type="text"
                value={formData.pan_number}
                onChange={(e) => setFormData({ ...formData, pan_number: e.target.value.toUpperCase() })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="ABCDE1234F"
                maxLength={10}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Shop Type</label>
              <select
                value={formData.shop_type}
                onChange={(e) => setFormData({ ...formData, shop_type: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="retail">Retail</option>
                <option value="wholesale">Wholesale</option>
                <option value="distributor">Distributor</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Credit Limit (₹)</label>
              <input
                type="number"
                value={formData.credit_limit}
                onChange={(e) => setFormData({ ...formData, credit_limit: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Payment Terms</label>
              <select
                value={formData.payment_terms}
                onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="immediate">Immediate</option>
                <option value="7_days">7 Days</option>
                <option value="15_days">15 Days</option>
                <option value="30_days">30 Days</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Assign to Route</label>
              <select
                value={formData.route_id}
                onChange={(e) => setFormData({ ...formData, route_id: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              >
                <option value="">No Route</option>
                {routes.map(route => (
                  <option key={route.id} value={route.id}>
                    {route.name} {route.area ? `(${route.area})` : ''}
                  </option>
                ))}
              </select>
              {originalRouteId && originalRouteId !== formData.route_id && (
                <p className="text-xs text-orange-600 mt-1">⚠️ Changing route will reassign this shop</p>
              )}
              <p className="text-xs text-gray-500 mt-1">Each shop can belong to only one route at a time</p>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-lg font-semibold mb-4">Bank Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Account Number</label>
                <input
                  type="text"
                  value={formData.bank_account.account_number}
                  onChange={(e) => setFormData({
                    ...formData,
                    bank_account: { ...formData.bank_account, account_number: e.target.value }
                  })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">IFSC Code</label>
                <input
                  type="text"
                  value={formData.bank_account.ifsc}
                  onChange={(e) => setFormData({
                    ...formData,
                    bank_account: { ...formData.bank_account, ifsc: e.target.value }
                  })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Bank Name</label>
                <input
                  type="text"
                  value={formData.bank_account.bank_name}
                  onChange={(e) => setFormData({
                    ...formData,
                    bank_account: { ...formData.bank_account, bank_name: e.target.value }
                  })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Account Holder Name</label>
                <input
                  type="text"
                  value={formData.bank_account.account_holder}
                  onChange={(e) => setFormData({
                    ...formData,
                    bank_account: { ...formData.bank_account, account_holder: e.target.value }
                  })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Branch</label>
                <input
                  type="text"
                  value={formData.bank_account.branch}
                  onChange={(e) => setFormData({
                    ...formData,
                    bank_account: { ...formData.bank_account, branch: e.target.value }
                  })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update Shop'}
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
