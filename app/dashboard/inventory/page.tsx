'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

export default function InventoryPage() {
  const supabase = createClient()
  const [productionInventory, setProductionInventory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [filterPackagingType, setFilterPackagingType] = useState('')
  const [filterBatch, setFilterBatch] = useState('')

  useEffect(() => {
    loadInventory()
  }, [])

  const loadInventory = async () => {
    setLoading(true)
    
    const { data, error } = await supabase
      .from('production_inventory')
      .select('*')
      .order('created_at', { ascending: false })
    
    console.log('Production inventory query:', { data, error: error ? JSON.stringify(error) : null })
    
    if (error) {
      console.error('Failed to load production inventory:', error)
    }
    
    setProductionInventory(data || [])
    
    setLoading(false)
  }

  const filteredProductionInventory = productionInventory.filter(item => {
    // Search query filter (searches across all fields)
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchesSearch = 
        item.product_name?.toLowerCase().includes(query) ||
        item.batch_number?.toLowerCase().includes(query) ||
        item.packaging_type?.toLowerCase().includes(query) ||
        item.package_size?.toLowerCase().includes(query)
      
      if (!matchesSearch) return false
    }

    // Product filter
    if (filterProduct && item.product_name !== filterProduct) return false

    // Packaging type filter
    if (filterPackagingType && item.packaging_type !== filterPackagingType) return false

    // Batch filter
    if (filterBatch && item.batch_number !== filterBatch) return false

    return true
  })

  // Get unique values for filter dropdowns
  const uniqueProducts = [...new Set(productionInventory.map(item => item.product_name))].filter(Boolean).sort()
  const uniquePackagingTypes = [...new Set(productionInventory.map(item => item.packaging_type))].filter(Boolean).sort()
  const uniqueBatches = [...new Set(productionInventory.map(item => item.batch_number))].filter(Boolean).sort()

  const clearFilters = () => {
    setSearchQuery('')
    setFilterProduct('')
    setFilterPackagingType('')
    setFilterBatch('')
  }

  const hasActiveFilters = searchQuery || filterProduct || filterPackagingType || filterBatch

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Inventory Management</h1>
          <p className="text-sm text-gray-600 mt-1">Track packaged products from production</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {/* Search Box */}
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by product, batch, packaging, size..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Product Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Product
            </label>
            <select
              value={filterProduct}
              onChange={(e) => setFilterProduct(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Products</option>
              {uniqueProducts.map(product => (
                <option key={product} value={product}>{product}</option>
              ))}
            </select>
          </div>

          {/* Packaging Type Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Packaging Type
            </label>
            <select
              value={filterPackagingType}
              onChange={(e) => setFilterPackagingType(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Types</option>
              {uniquePackagingTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Batch Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Batch Number
            </label>
            <select
              value={filterBatch}
              onChange={(e) => setFilterBatch(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Batches</option>
              {uniqueBatches.map(batch => (
                <option key={batch} value={batch}>{batch}</option>
              ))}
            </select>
          </div>

          {/* Clear Filters Button */}
          <div className="flex items-end">
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Clear All Filters
              </button>
            )}
          </div>

          {/* Results Count */}
          <div className="lg:col-span-2 flex items-end justify-end">
            <div className="text-sm text-gray-600">
              Showing <span className="font-semibold text-gray-900">{filteredProductionInventory.length}</span> of{' '}
              <span className="font-semibold text-gray-900">{productionInventory.length}</span> items
            </div>
          </div>
        </div>
      </div>

      {/* Production Inventory Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
          {filteredProductionInventory.length > 0 ? (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Packaging Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Package Size</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredProductionInventory.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-blue-600">{item.batch_number}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{item.product_name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-700">{item.packaging_type || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{item.package_size || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-semibold text-gray-900">
                        {item.quantity}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {item.unit}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-gray-500">
              <p className="text-lg font-medium">No production inventory found</p>
              <p className="text-sm mt-2">Create production batches to add packaged inventory</p>
            </div>
          )}
        </div>
    </div>
  )
}
