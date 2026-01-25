'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function CreateDeliveryForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  
  const [routes, setRoutes] = useState<any[]>([])
  const [allShops, setAllShops] = useState<any[]>([])
  const [shops, setShops] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [selectedProducts, setSelectedProducts] = useState<any[]>([])
  const [formData, setFormData] = useState({
    route_id: searchParams.get('route_id') || '',
    shop_id: '',
    expected_qty: '',
    payment_mode: 'cash',
    notes: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      const [routesRes, shopsRes, productsRes] = await Promise.all([
        supabase.from('routes').select('id, name, area, delivery_type, is_active').eq('is_active', true).order('name'),
        supabase.from('shops').select('id, name, city, address, route_id, status').eq('status', 'approved').order('name'),
        supabase.from('products').select('id, name, sku, uom').order('name'),
      ])
      setRoutes(routesRes.data || [])
      setAllShops(shopsRes.data || [])
      setProducts(productsRes.data || [])
      
      // Set initial shops based on pre-selected route
      if (formData.route_id) {
        const filteredShops = (shopsRes.data || []).filter((s: any) => s.route_id === formData.route_id)
        setShops(filteredShops)
      } else {
        setShops(shopsRes.data || [])
      }
    }
    fetchData()
  }, [supabase])

  // Filter shops when route changes
  useEffect(() => {
    if (formData.route_id) {
      const filteredShops = allShops.filter(s => s.route_id === formData.route_id)
      setShops(filteredShops)
      // Reset shop selection if current shop is not in the filtered list
      if (formData.shop_id && !filteredShops.find(s => s.id === formData.shop_id)) {
        setFormData({ ...formData, shop_id: '' })
      }
    } else {
      setShops(allShops)
    }
  }, [formData.route_id, allShops])

  // Calculate total quantity from selected products
  const totalQty = selectedProducts.reduce((sum, p) => sum + (parseFloat(p.qty) || 0), 0)
  const totalAmount = selectedProducts.reduce((sum, p) => sum + ((parseFloat(p.qty) || 0) * (parseFloat(p.price) || 0)), 0)

  const addProduct = (product: any) => {
    if (!selectedProducts.find(p => p.id === product.id)) {
      setSelectedProducts([...selectedProducts, { ...product, qty: '', price: '' }])
    }
  }

  const removeProduct = (productId: string) => {
    setSelectedProducts(selectedProducts.filter(p => p.id !== productId))
  }

  const updateProduct = (productId: string, field: string, value: string) => {
    setSelectedProducts(selectedProducts.map(p => 
      p.id === productId ? { ...p, [field]: value } : p
    ))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.shop_id) {
      setError('Please select a shop')
      return
    }
    setLoading(true)
    setError(null)

    try {
      const items = selectedProducts.map(p => ({
        product_id: p.id,
        product_name: p.name,
        qty: parseFloat(p.qty) || 0,
        price: parseFloat(p.price) || 0,
      }))

      const { error: insertError } = await supabase.from('deliveries').insert({
        route_id: formData.route_id || null,
        shop_id: formData.shop_id,
        expected_qty: totalQty,
        expected_amount: totalAmount,
        items,
        payment_mode: formData.payment_mode,
        status: 'pending',
      })

      if (insertError) throw insertError

      router.push('/dashboard/deliveries')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to create delivery')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Create New Delivery</h1>

      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Route (Optional)</label>
              <select
                value={formData.route_id}
                onChange={(e) => setFormData({ ...formData, route_id: e.target.value, shop_id: '' })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              >
                <option value="">No Route (Show All Shops)</option>
                {routes.map(route => (
                  <option key={route.id} value={route.id}>
                    {route.name} {route.area ? `- ${route.area}` : ''} ({route.delivery_type || 'morning'})
                  </option>
                ))}
              </select>
              {formData.route_id && (
                <p className="text-xs text-gray-500 mt-1">
                  Showing only shops assigned to this route ({shops.length} shops)
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Shop <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={formData.shop_id}
                onChange={(e) => setFormData({ ...formData, shop_id: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              >
                <option value="">Select Shop</option>
                {shops.length === 0 && formData.route_id ? (
                  <option disabled>No shops assigned to this route</option>
                ) : (
                  shops.map(shop => (
                    <option key={shop.id} value={shop.id}>{shop.name} - {shop.city}</option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Products Section */}
          <div className="border-t pt-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Products ({selectedProducts.length} items)
            </label>
            
            <div className="mb-4">
              <select
                onChange={(e) => {
                  const product = products.find(p => p.id === e.target.value)
                  if (product) addProduct(product)
                  e.target.value = ''
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              >
                <option value="">Add Product...</option>
                {products.filter(p => !selectedProducts.find(sp => sp.id === p.id)).map(product => (
                  <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>
                ))}
              </select>
            </div>

            {selectedProducts.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Quantity (Unit)</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Price (₹)</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {selectedProducts.map((product) => (
                      <tr key={product.id}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{product.name}</div>
                          <div className="text-xs text-gray-500">{product.sku}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="0.1"
                              value={product.qty}
                              onChange={(e) => updateProduct(product.id, 'qty', e.target.value)}
                              className="w-24 px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900 bg-white"
                              placeholder="0"
                            />
                            <span className="text-sm text-gray-600 font-medium">{product.uom || 'Unit'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            step="0.01"
                            value={product.price}
                            onChange={(e) => updateProduct(product.id, 'price', e.target.value)}
                            className="w-24 px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900 bg-white"
                            placeholder="0"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => removeProduct(product.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Total Expected Quantity
              </label>
              <div className="flex items-baseline gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={totalQty.toFixed(1)}
                  readOnly
                  className="w-32 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 font-semibold"
                  placeholder="0"
                />
                <span className="text-sm text-gray-600">total units</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Auto-calculated from all product quantities</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Payment Mode</label>
              <select
                value={formData.payment_mode}
                onChange={(e) => setFormData({ ...formData, payment_mode: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="credit">Credit</option>
              </select>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Delivery'}
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

export default function CreateDeliveryPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading...</div>}>
      <CreateDeliveryForm />
    </Suspense>
  )
}
