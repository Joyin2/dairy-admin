'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface PoolBook {
  id: string
  original_pool_id: string
  pool_name: string
  total_milk_liters: number
  original_avg_fat: number
  remaining_milk_liters: number
  current_avg_fat: number
  pool_created_at: string
  archived_at: string
  snapshot_data: any
}

export default function PoolBooksPage() {
  const router = useRouter()
  const supabase = createClient()
  const [books, setBooks] = useState<PoolBook[]>([])
  const [loading, setLoading] = useState(true)
  
  // Filters
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    minMilk: '',
    maxMilk: '',
    searchBookNumber: ''
  })

  useEffect(() => {
    loadBooks()
  }, [])

  const loadBooks = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('milk_pool')
        .select('*')
        .eq('status', 'archived')
        .order('updated_at', { ascending: false })

      const { data, error } = await query.limit(50)

      if (error) throw error
      
      // Transform data to match interface
      const transformedData = (data || []).map(pool => ({
        id: pool.id,
        original_pool_id: pool.id,
        pool_name: pool.name,
        total_milk_liters: pool.total_milk_liters,
        original_avg_fat: pool.original_avg_fat,
        remaining_milk_liters: pool.remaining_milk_liters,
        current_avg_fat: pool.current_avg_fat,
        pool_created_at: pool.created_at,
        archived_at: pool.updated_at,
        snapshot_data: {}
      }))
      
      setBooks(transformedData)
    } catch (err: any) {
      console.error('Failed to load books:', err)
      alert('Failed to load books: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (field: string, value: string) => {
    setFilters({ ...filters, [field]: value })
  }

  const applyFilters = () => {
    loadBooks()
  }

  const clearFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      minMilk: '',
      maxMilk: '',
      searchBookNumber: ''
    })
    setTimeout(() => loadBooks(), 100)
  }

  const filteredBooks = books.filter(b => {
    // Filter by book number
    if (filters.searchBookNumber && !b.pool_name.includes(filters.searchBookNumber)) {
      return false;
    }
    
    // Filter by date
    if (filters.startDate) {
      const bookDate = new Date(b.archived_at).toISOString().split('T')[0];
      if (bookDate < filters.startDate) return false;
    }
    if (filters.endDate) {
      const bookDate = new Date(b.archived_at).toISOString().split('T')[0];
      if (bookDate > filters.endDate) return false;
    }
    
    // Filter by milk used
    const milkUsed = b.total_milk_liters - b.remaining_milk_liters;
    if (filters.minMilk && milkUsed < parseFloat(filters.minMilk)) return false;
    if (filters.maxMilk && milkUsed > parseFloat(filters.maxMilk)) return false;
    
    return true;
  })

  const viewBookDetails = (bookId: string) => {
    router.push(`/dashboard/milk-pool/books/${bookId}`)
  }

  if (loading) return <div className="text-center py-12">Loading pool books...</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Pool Books History</h1>
          <p className="text-gray-600 mt-1">Complete audit trail of all milk pool cycles</p>
        </div>
        <button
          onClick={() => router.push('/dashboard/milk-pool')}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
        >
          ← Back to Active Pool
        </button>
      </div>

      {/* Filters Section */}
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min Milk Used (L)</label>
            <input
              type="number"
              step="0.01"
              value={filters.minMilk}
              onChange={(e) => handleFilterChange('minMilk', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Milk Used (L)</label>
            <input
              type="number"
              step="0.01"
              value={filters.maxMilk}
              onChange={(e) => handleFilterChange('maxMilk', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
              placeholder="1000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Book Number</label>
            <input
              type="text"
              value={filters.searchBookNumber}
              onChange={(e) => handleFilterChange('searchBookNumber', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
              placeholder="e.g., 12"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={applyFilters}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
          >
            Apply Filters
          </button>
          <button
            onClick={clearFilters}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-medium"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Books Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            Closed Pool Books ({filteredBooks.length})
          </h2>
        </div>
        
        {filteredBooks.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Book #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Period
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Opening Milk
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Milk Used
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Closing Milk
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Avg Fat
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Activity
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Closed By
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredBooks.map((book) => (
                  <tr key={book.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{book.pool_name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-900">
                        {new Date(book.pool_created_at).toLocaleDateString()} → {new Date(book.archived_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{book.total_milk_liters?.toFixed(2)}L</div>
                      <div className="text-xs text-gray-500">{book.original_avg_fat?.toFixed(2)}% fat</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm font-medium text-blue-600">{(book.total_milk_liters - book.remaining_milk_liters)?.toFixed(2)}L</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{book.remaining_milk_liters?.toFixed(2)}L</div>
                      <div className="text-xs text-gray-500">{book.current_avg_fat?.toFixed(2)}% fat</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {book.original_avg_fat?.toFixed(2)}% → {book.current_avg_fat?.toFixed(2)}%
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-xs text-gray-600">
                        <div>📝 {book.snapshot_data?.usage_history?.length || 0} usages</div>
                        <div>📦 {book.snapshot_data?.collections?.length || 0} collections</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-900">-</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => viewBookDetails(book.id)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View Details →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-gray-500">
            <div className="text-4xl mb-2">📚</div>
            <div className="text-lg">No pool books found</div>
            <div className="text-sm mt-1">Books will appear here after you reset the active pool</div>
          </div>
        )}
      </div>
    </div>
  )
}
