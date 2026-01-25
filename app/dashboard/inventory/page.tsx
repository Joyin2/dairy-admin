'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

export default function InventoryPage() {
  const supabase = createClient()
  const [inventory, setInventory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [adjusting, setAdjusting] = useState<string | null>(null)
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [filters, setFilters] = useState({
    product: '',
    startDate: '',
    endDate: '',
    minQty: '',
    maxQty: '',
    minFat: '',
    maxFat: ''
  })

  useEffect(() => {
    loadInventory()
  }, [])

  const loadInventory = async () => {
    const { data } = await supabase
      .from('inventory_items')
      .select('*, products(name, sku)')
      .order('created_at', { ascending: false })
    setInventory(data || [])
    setLoading(false)
  }

  const handleAdjust = async (id: string, currentQty: number) => {
    if (!adjustQty || !adjustReason) {
      alert('Enter quantity and reason')
      return
    }

    const newQty = currentQty + parseFloat(adjustQty)
    if (newQty < 0) {
      alert('Quantity cannot be negative')
      return
    }

    const { error } = await supabase
      .from('inventory_items')
      .update({ 
        qty: newQty,
        metadata: { 
          last_adjustment: {
            previous_qty: currentQty,
            adjusted_by: parseFloat(adjustQty),
            reason: adjustReason,
            date: new Date().toISOString()
          }
        },
        last_updated: new Date().toISOString()
      })
      .eq('id', id)

    if (!error) {
      setInventory(inventory.map(item => 
        item.id === id ? { ...item, qty: newQty } : item
      ))
      setAdjusting(null)
      setAdjustQty('')
      setAdjustReason('')
    } else {
      alert('Failed to adjust: ' + error.message)
    }
  }

  // Filter inventory
  const filteredInventory = inventory.filter(item => {
    if (filters.product && !item.products?.name?.toLowerCase().includes(filters.product.toLowerCase())) {
      return false;
    }
    
    if (filters.startDate) {
      const itemDate = new Date(item.created_at).toISOString().split('T')[0];
      if (itemDate < filters.startDate) return false;
    }
    
    if (filters.endDate) {
      const itemDate = new Date(item.created_at).toISOString().split('T')[0];
      if (itemDate > filters.endDate) return false;
    }
    
    const qty = parseFloat(item.qty || 0);
    if (filters.minQty && qty < parseFloat(filters.minQty)) return false;
    if (filters.maxQty && qty > parseFloat(filters.maxQty)) return false;
    
    const fat = parseFloat(item.fat_percent || 0);
    if (filters.minFat && fat < parseFloat(filters.minFat)) return false;
    if (filters.maxFat && fat > parseFloat(filters.maxFat)) return false;
    
    return true;
  })

  // Calculate totals by product
  const productTotals = filteredInventory.reduce((acc: any, item) => {
    const productName = item.products?.name || 'Unknown'
    if (!acc[productName]) {
      acc[productName] = { qty: 0, count: 0, unit: item.uom || 'liter' }
    }
    acc[productName].qty += parseFloat(item.qty || 0)
    acc[productName].count += 1
    return acc
  }, {})

  // Calculate total stock
  const totalStock = filteredInventory.reduce((sum, i) => sum + parseFloat(i.qty || 0), 0)
  const lowStockCount = filteredInventory.filter(i => parseFloat(i.qty || 0) < 10).length

  const clearFilters = () => {
    setFilters({
      product: '',
      startDate: '',
      endDate: '',
      minQty: '',
      maxQty: '',
      minFat: '',
      maxFat: ''
    })
  }

  if (loading) return <div className="text-center py-12 text-gray-700">Loading...</div>

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Inventory</h1>
          <p className="text-gray-700 mt-1">Track stock levels by product</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
            <input
              type="text"
              value={filters.product}
              onChange={(e) => setFilters({ ...filters, product: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white text-sm"
              placeholder="Search product..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min Qty</label>
            <input
              type="number"
              step="0.01"
              value={filters.minQty}
              onChange={(e) => setFilters({ ...filters, minQty: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white text-sm"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Qty</label>
            <input
              type="number"
              step="0.01"
              value={filters.maxQty}
              onChange={(e) => setFilters({ ...filters, maxQty: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white text-sm"
              placeholder="1000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min Fat %</label>
            <input
              type="number"
              step="0.1"
              value={filters.minFat}
              onChange={(e) => setFilters({ ...filters, minFat: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white text-sm"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Fat %</label>
            <input
              type="number"
              step="0.1"
              value={filters.maxFat}
              onChange={(e) => setFilters({ ...filters, maxFat: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white text-sm"
              placeholder="10"
            />
          </div>
        </div>
        <div className="mt-4">
          <button
            onClick={clearFilters}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-medium text-sm"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-700">Total Items</div>
          <div className="text-2xl font-bold text-blue-600">{filteredInventory.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-700">Total Stock</div>
          <div className="text-2xl font-bold text-green-600">{totalStock.toFixed(2)}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-700">Low Stock (&lt;10)</div>
          <div className="text-2xl font-bold text-yellow-600">{lowStockCount}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-700">Products</div>
          <div className="text-2xl font-bold text-purple-600">{Object.keys(productTotals).length}</div>
        </div>
      </div>

      {/* Product Summary */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Stock by Product</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(productTotals).map(([name, data]: [string, any]) => (
            <div key={name} className="bg-gray-50 rounded-lg p-3">
              <div className="font-medium text-gray-900">{name}</div>
              <div className="text-xl font-bold text-blue-600">
                {data.qty.toFixed(2)} {data.unit === 'kg' ? 'kg' : 'L'}
              </div>
              <div className="text-xs text-gray-600">{data.count} item(s)</div>
            </div>
          ))}
          {Object.keys(productTotals).length === 0 && (
            <div className="col-span-4 text-center text-gray-600 py-4">
              No inventory yet. Add inventory from the Milk Pool.
            </div>
          )}
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Product</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Quantity</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Fat %</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Unit</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Created</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredInventory.length > 0 ? (
                filteredInventory.map((item: any) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-gray-900">{item.products?.name || 'N/A'}</div>
                      <div className="text-xs text-gray-600">{item.products?.sku || ''}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`font-semibold ${
                        parseFloat(item.qty) < 10 ? 'text-red-600' : 'text-gray-900'
                      }`}>
                        {parseFloat(item.qty).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">
                        {item.fat_percent ? `${item.fat_percent}%` : '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-700">{item.uom || 'liter'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      {adjusting === item.id ? (
                        <div className="flex items-center gap-2 justify-end">
                          <input
                            type="number"
                            placeholder="+/-"
                            value={adjustQty}
                            onChange={(e) => setAdjustQty(e.target.value)}
                            className="w-20 px-2 py-1 border rounded text-sm text-gray-900 bg-white"
                          />
                          <input
                            type="text"
                            placeholder="Reason"
                            value={adjustReason}
                            onChange={(e) => setAdjustReason(e.target.value)}
                            className="w-24 px-2 py-1 border rounded text-sm text-gray-900 bg-white"
                          />
                          <button
                            onClick={() => handleAdjust(item.id, parseFloat(item.qty))}
                            className="text-green-600 hover:text-green-900"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => { setAdjusting(null); setAdjustQty(''); setAdjustReason(''); }}
                            className="text-gray-600 hover:text-gray-900"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAdjusting(item.id)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Adjust
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-700">
                    No inventory items yet. Add inventory from the Milk Pool.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
