'use client'

import { useState, useEffect } from 'react'
import { db } from '@/lib/firebase/client'
import { collection, query, where, getDocs, limit, doc, updateDoc, getDoc } from 'firebase/firestore'
import { useRouter, useParams } from 'next/navigation'

export default function EditShopPage() {
  const router = useRouter()
  const params = useParams()
  const [routes, setRoutes] = useState<any[]>([])
  const [agentMap, setAgentMap] = useState<Record<string, string>>({})

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
    retail_rate: '',
    wholesale_rate: '',
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
  const [shopTypeOther, setShopTypeOther] = useState('')
  const [paymentTermsOther, setPaymentTermsOther] = useState('')
  const [originalRouteId, setOriginalRouteId] = useState('')
  const [pendingBalance, setPendingBalance] = useState(0)

  useEffect(() => {
    loadShop()
    fetchRoutes()
    fetchPendingBalance()
  }, [])

  const fetchRoutes = async () => {
    const snap = await getDocs(query(
      collection(db, 'routes'),
      where('is_active', '==', true),
      limit(50)
    ))
    const routeList = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]
    routeList.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    setRoutes(routeList)

    const agentIds = [...new Set(routeList.map((r: any) => r.agent_id).filter(Boolean))]
    if (agentIds.length > 0) {
      const agentSnap = await getDocs(query(collection(db, 'app_users'), where('__name__', 'in', agentIds)))
      const map: Record<string, string> = {}
      agentSnap.docs.forEach(d => { map[d.id] = (d.data() as any).name || 'Unknown Agent' })
      setAgentMap(map)
    }
  }

  const fetchPendingBalance = async () => {
    const shopId = params.id as string
    const snap = await getDocs(query(
      collection(db, 'deliveries'),
      where('shop_id', '==', shopId),
      where('status', 'in', ['delivered', 'partial'])
    ))

    const salesMinusPayments = snap.docs.reduce((sum, d) => {
      const data = d.data()
      const expected = data.expected_amount || 0
      const collected = data.collected_amount || 0
      return sum + Math.max(0, expected - collected)
    }, 0)

    const returnsSnap = await getDocs(query(
      collection(db, 'product_returns'),
      where('shop_id', '==', shopId),
      where('status', '==', 'approved')
    ))
    const approvedReturns = returnsSnap.docs.reduce((sum, d) =>
      sum + parseFloat(String(d.data().total_value || 0)), 0)
    const balance = Math.max(0, salesMinusPayments - approvedReturns)
    setPendingBalance(balance)
  }

  const loadShop = async () => {
    try {
      const shopSnap = await getDoc(doc(db, 'shops', params.id as string))
      if (!shopSnap.exists()) throw new Error('Shop not found')

      const data = { id: shopSnap.id, ...shopSnap.data() } as any

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
        shop_type: ['retail', 'wholesale', 'distributor'].includes(data.shop_type) ? data.shop_type : (data.shop_type ? 'other' : 'retail'),
        retail_rate: data.retail_rate != null ? String(data.retail_rate) : '',
        wholesale_rate: data.wholesale_rate != null ? String(data.wholesale_rate) : '',
        credit_limit: data.credit_limit || '',
        payment_terms: ['immediate', '7_days', '15_days', '30_days'].includes(data.payment_terms) ? data.payment_terms : (data.payment_terms ? 'other' : 'immediate'),
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
      if (data.shop_type && !['retail', 'wholesale', 'distributor'].includes(data.shop_type)) {
        setShopTypeOther(data.shop_type)
      }
      if (data.payment_terms && !['immediate', '7_days', '15_days', '30_days'].includes(data.payment_terms)) {
        setPaymentTermsOther(data.payment_terms)
      }
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
      await updateDoc(doc(db, 'shops', params.id as string), {
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
        shop_type: formData.shop_type === 'other' ? shopTypeOther : formData.shop_type,
        retail_rate: formData.retail_rate ? parseFloat(formData.retail_rate) : null,
        wholesale_rate: formData.wholesale_rate ? parseFloat(formData.wholesale_rate) : null,
        credit_limit: formData.credit_limit,
        payment_terms: formData.payment_terms === 'other' ? paymentTermsOther : formData.payment_terms,
        route_id: formData.route_id || null,
        bank_account: formData.bank_account,
      })

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
                <option value="other">Other</option>
              </select>
              {formData.shop_type === 'other' && (
                <input
                  type="text"
                  value={shopTypeOther}
                  onChange={(e) => setShopTypeOther(e.target.value)}
                  className="w-full mt-2 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Specify shop type"
                  required
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Retail Rate (₹/unit)</label>
              <input
                type="number"
                step="0.01"
                value={formData.retail_rate}
                onChange={(e) => setFormData({ ...formData, retail_rate: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. 28.00"
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
                placeholder="e.g. 25.00"
              />
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
                <option value="other">Other</option>
              </select>
              {formData.payment_terms === 'other' && (
                <input
                  type="text"
                  value={paymentTermsOther}
                  onChange={(e) => setPaymentTermsOther(e.target.value)}
                  className="w-full mt-2 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Specify payment terms"
                  required
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Assign to Route / Agent</label>
              <select
                value={formData.route_id}
                onChange={(e) => setFormData({ ...formData, route_id: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              >
                <option value="">No Route</option>
                {routes.map(route => (
                  <option key={route.id} value={route.id}>
                    {route.name}{route.area ? ` (${route.area})` : ''}{agentMap[route.agent_id] ? ` — ${agentMap[route.agent_id]}` : ''}
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
