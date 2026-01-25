'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function CreateRoutePage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [agents, setAgents] = useState<any[]>([])
  const [shops, setShops] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [selectedShops, setSelectedShops] = useState<any[]>([])
  const [formData, setFormData] = useState({
    name: '',
    agent_id: '',
    date: new Date().toISOString().split('T')[0],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      const [agentsRes, shopsRes, productsRes] = await Promise.all([
        supabase.from('app_users').select('id, name, email').eq('role', 'delivery_agent').eq('status', 'active').order('name'),
        supabase.from('shops').select('id, name, address, city, contact, owner_name, shop_type, payment_terms, route_id, status').is('route_id', null).eq('status', 'approved').order('name'),
        supabase.from('products').select('id, name, sku, uom').order('name'),
      ])
      setAgents(agentsRes.data || [])
      setShops(shopsRes.data || [])
      setProducts(productsRes.data || [])
    }
    fetchData()
  }, [supabase])

  const addShop = (shop: any) => {
    if (!selectedShops.find(s => s.id === shop.id)) {
      // Add shop with empty product selections
      setSelectedShops([...selectedShops, { 
        ...shop, 
        seq: selectedShops.length + 1, 
        status: 'pending',
        products: [{ product_id: '', product_name: '', qty: '' }]
      }])
    }
    setSearchTerm('')
  }

  const removeShop = (shopId: string) => {
    setSelectedShops(selectedShops.filter(s => s.id !== shopId).map((s, i) => ({ ...s, seq: i + 1 })))
  }

  const updateShopProduct = (shopId: string, productIndex: number, field: string, value: string) => {
    setSelectedShops(selectedShops.map(s => {
      if (s.id !== shopId) return s
      const updatedProducts = [...s.products]
      if (field === 'product_id') {
        const product = products.find(p => p.id === value)
        updatedProducts[productIndex] = { 
          ...updatedProducts[productIndex], 
          product_id: value, 
          product_name: product?.name || '' 
        }
      } else {
        updatedProducts[productIndex] = { ...updatedProducts[productIndex], [field]: value }
      }
      return { ...s, products: updatedProducts }
    }))
  }

  const addProductToShop = (shopId: string) => {
    setSelectedShops(selectedShops.map(s => {
      if (s.id !== shopId) return s
      return { ...s, products: [...s.products, { product_id: '', product_name: '', qty: '' }] }
    }))
  }

  const removeProductFromShop = (shopId: string, productIndex: number) => {
    setSelectedShops(selectedShops.map(s => {
      if (s.id !== shopId) return s
      const updatedProducts = s.products.filter((_: any, i: number) => i !== productIndex)
      return { ...s, products: updatedProducts.length ? updatedProducts : [{ product_id: '', product_name: '', qty: '' }] }
    }))
  }

  const moveShop = (index: number, direction: 'up' | 'down') => {
    const newShops = [...selectedShops]
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= newShops.length) return
    ;[newShops[index], newShops[newIndex]] = [newShops[newIndex], newShops[index]]
    setSelectedShops(newShops.map((s, i) => ({ ...s, seq: i + 1 })))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedShops.length === 0) {
      setError('Please add at least one shop to the route')
      return
    }
    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: appUser } = await supabase
        .from('app_users')
        .select('id')
        .eq('auth_uid', user?.id)
        .single()

      // Create route first
      const { data: newRoute, error: routeError } = await supabase
        .from('routes')
        .insert({
          name: formData.name,
          agent_id: formData.agent_id || null,
          area: formData.name,
          is_active: true,
          created_by: appUser?.id,
        })
        .select()
        .single()

      if (routeError) throw routeError

      // Assign shops to the route
      const shopUpdates = selectedShops.map((shop, index) => ({
        id: shop.id,
        route_id: newRoute.id,
        sequence: index + 1,
        expected_products: shop.products
          .filter((p: any) => p.product_id)
          .map((p: any) => ({
            product_id: p.product_id,
            product_name: p.product_name,
            qty: parseFloat(p.qty) || 0,
          })),
      }))

      // Update each shop with route assignment
      for (const update of shopUpdates) {
        const { error: updateError } = await supabase
          .from('shops')
          .update({
            route_id: update.route_id,
          })
          .eq('id', update.id)

        if (updateError) throw updateError
      }

      router.push('/dashboard/routes')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to create route')
    } finally {
      setLoading(false)
    }
  }

  const filteredShops = shops.filter(shop => 
    shop.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    shop.city?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Create New Route</h1>

      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Route Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                placeholder="e.g., Morning Route A"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Agent</label>
              <select
                value={formData.agent_id}
                onChange={(e) => setFormData({ ...formData, agent_id: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              >
                <option value="">Unassigned</option>
                {agents.map(agent => (
                  <option key={agent.id} value={agent.id}>{agent.name || agent.email}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              />
            </div>
          </div>

          {/* Shop Selection */}
          <div className="border-t pt-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Add Shops to Route ({selectedShops.length} selected)
            </label>
            
            <div className="mb-4">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                placeholder="Search shops by name or city..."
              />
            </div>
              
            {/* Available Shops List - Always visible */}
            <div className="mb-4">
              <div className="text-sm font-medium text-gray-700 mb-2">Available Shops ({filteredShops.length})</div>
              <div className="max-h-96 overflow-y-auto border rounded-lg bg-white">
                {filteredShops.length > 0 ? (
                  filteredShops.map(shop => (
                    <button
                      key={shop.id}
                      type="button"
                      onClick={() => addShop(shop)}
                      disabled={selectedShops.some(s => s.id === shop.id)}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed border-b last:border-0"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium text-gray-900">{shop.name}</div>
                          <div className="text-xs text-gray-500">{shop.owner_name && `${shop.owner_name} • `}{shop.city}</div>
                          <div className="text-xs text-gray-400">{shop.address}</div>
                        </div>
                        <div className="text-right text-xs">
                          {selectedShops.some(s => s.id === shop.id) ? (
                            <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">Selected</span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Available</span>
                          )}
                          <div className="mt-1">
                            <span className="inline-block px-2 py-0.5 bg-gray-100 rounded text-gray-600 capitalize">{shop.shop_type || 'retail'}</span>
                          </div>
                          {shop.contact && <div className="mt-1 text-gray-500">{shop.contact}</div>}
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-8 text-center text-gray-500">
                    {shops.length === 0 ? (
                      <div>
                        <div className="text-lg mb-2">📭</div>
                        <div>No unassigned shops available</div>
                        <div className="text-xs mt-1">All approved shops are already assigned to routes</div>
                      </div>
                    ) : (
                      <div>
                        <div className="text-lg mb-2">🔍</div>
                        <div>No shops found matching "{searchTerm}"</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Selected Shops List */}
            <div className="space-y-4">
              {selectedShops.length > 0 ? (
                selectedShops.map((shop, index) => (
                  <div key={shop.id} className="border rounded-lg overflow-hidden bg-white">
                    {/* Shop Header */}
                    <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-500">#{shop.seq}</span>
                        <div>
                          <div className="font-semibold text-gray-900">{shop.name}</div>
                          <div className="text-xs text-gray-500">
                            {shop.owner_name && `${shop.owner_name} • `}
                            {shop.contact && `${shop.contact} • `}
                            {shop.city}
                          </div>
                          <div className="text-xs text-gray-400">{shop.address}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded capitalize">{shop.shop_type || 'retail'}</span>
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">{shop.payment_terms || 'immediate'}</span>
                        <div className="flex gap-1 ml-2">
                          <button type="button" onClick={() => moveShop(index, 'up')} disabled={index === 0} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">↑</button>
                          <button type="button" onClick={() => moveShop(index, 'down')} disabled={index === selectedShops.length - 1} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">↓</button>
                          <button type="button" onClick={() => removeShop(shop.id)} className="p-1 text-red-400 hover:text-red-600 ml-1">✕</button>
                        </div>
                      </div>
                    </div>
                    
                    {/* Products for this shop */}
                    <div className="p-4">
                      <div className="text-sm font-medium text-gray-700 mb-2">Expected Products</div>
                      <div className="space-y-2">
                        {shop.products.map((prod: any, pIndex: number) => (
                          <div key={pIndex} className="flex items-center gap-2">
                            <select
                              value={prod.product_id}
                              onChange={(e) => updateShopProduct(shop.id, pIndex, 'product_id', e.target.value)}
                              className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 text-gray-900 bg-white"
                            >
                              <option value="">Select product...</option>
                              {products.map(p => (
                                <option key={p.id} value={p.id}>{p.name} ({p.sku || p.uom})</option>
                              ))}
                            </select>
                            <input
                              type="number"
                              step="0.1"
                              value={prod.qty}
                              onChange={(e) => updateShopProduct(shop.id, pIndex, 'qty', e.target.value)}
                              placeholder="Qty"
                              className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 text-gray-900 bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => removeProductFromShop(shop.id, pIndex)}
                              className="p-1 text-red-400 hover:text-red-600"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => addProductToShop(shop.id)}
                        className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                      >
                        + Add Product
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="border rounded-lg p-8 text-center text-gray-500">
                  Search and add shops to create your route
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Route'}
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
