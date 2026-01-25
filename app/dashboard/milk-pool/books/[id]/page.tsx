'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'

interface BookDetails {
  book_id: string
  book_number: number
  book_name: string
  pool_id: string
  opening_total_liters: number
  opening_fat_units: number
  opening_avg_fat: number
  closing_total_liters: number
  closing_fat_units: number
  closing_avg_fat: number
  total_milk_used: number
  total_fat_used: number
  total_collections_count: number
  total_usage_count: number
  total_inventory_items_count: number
  usage_history_json: any[]
  inventory_history_json: any[]
  collections_history_json: any[]
  created_at: string
  closed_at: string
  closed_by: string
  notes?: string
}

export default function BookDetailsPage() {
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()
  const [book, setBook] = useState<BookDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'summary' | 'usage' | 'collections' | 'inventory'>('summary')

  useEffect(() => {
    if (params.id) {
      loadBookDetails(params.id as string)
    }
  }, [params.id])

  const loadBookDetails = async (bookId: string) => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('milk_pool')
        .select('*')
        .eq('id', bookId)
        .eq('status', 'archived')
        .single()

      if (error) throw error
      if (!data) throw new Error('Book not found')

      // Get usage history
      const { data: usageHistory } = await supabase
        .from('milk_usage_log')
        .select('*, app_users(name)')
        .eq('milk_pool_id', bookId)
        .order('used_at')

      // Get collections history
      const { data: collectionsHistory } = await supabase
        .from('pool_collections')
        .select('*, milk_collections(*, suppliers(name))')
        .eq('milk_pool_id', bookId)
        .order('added_at')

      // Transform to match interface
      const transformedBook: BookDetails = {
        book_id: data.id,
        book_number: 1,
        book_name: data.name,
        pool_id: data.id,
        opening_total_liters: data.total_milk_liters,
        opening_fat_units: data.total_fat_units,
        opening_avg_fat: data.original_avg_fat,
        closing_total_liters: data.remaining_milk_liters,
        closing_fat_units: data.remaining_fat_units,
        closing_avg_fat: data.current_avg_fat,
        total_milk_used: data.total_milk_liters - data.remaining_milk_liters,
        total_fat_used: data.total_fat_units - data.remaining_fat_units,
        total_collections_count: collectionsHistory?.length || 0,
        total_usage_count: usageHistory?.length || 0,
        total_inventory_items_count: 0,
        usage_history_json: usageHistory || [],
        inventory_history_json: [],
        collections_history_json: collectionsHistory || [],
        created_at: data.created_at,
        closed_at: data.updated_at,
        closed_by: data.created_by,
        notes: undefined
      }

      setBook(transformedBook)
    } catch (err: any) {
      console.error('Failed to load book:', err)
      alert('Failed to load book: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="text-center py-12">Loading book details...</div>
  if (!book) return <div className="text-center py-12">Book not found</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{book.book_name}</h1>
          <p className="text-gray-600 mt-1">Pool Book #{book.book_number} - Complete Cycle Details</p>
        </div>
        <button
          onClick={() => router.push('/dashboard/milk-pool/books')}
          className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-medium"
        >
          ← Back to Books
        </button>
      </div>

      {/* Book Info Card */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-sm text-gray-600">Period</div>
            <div className="text-lg font-medium text-gray-900">
              {new Date(book.created_at).toLocaleDateString()} → {new Date(book.closed_at).toLocaleDateString()}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Duration: {Math.ceil((new Date(book.closed_at).getTime() - new Date(book.created_at).getTime()) / (1000 * 60 * 60 * 24))} days
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Status</div>
            <div className="flex items-center mt-1">
              <span className="px-3 py-1 bg-gray-200 text-gray-800 rounded-full text-sm font-medium">
                Closed
              </span>
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Notes</div>
            <div className="text-sm text-gray-900 mt-1">{book.notes || 'No notes'}</div>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div className="bg-blue-50 rounded-lg shadow p-4 border-2 border-blue-200">
          <div className="text-sm text-blue-700">Opening Milk</div>
          <div className="text-2xl font-bold text-blue-900">{book.opening_total_liters?.toFixed(2)}L</div>
          <div className="text-xs text-blue-600">{book.opening_avg_fat?.toFixed(2)}% fat</div>
        </div>
        <div className="bg-red-50 rounded-lg shadow p-4 border-2 border-red-200">
          <div className="text-sm text-red-700">Milk Used</div>
          <div className="text-2xl font-bold text-red-900">{book.total_milk_used?.toFixed(2)}L</div>
          <div className="text-xs text-red-600">{book.total_fat_used?.toFixed(2)} fat units</div>
        </div>
        <div className="bg-green-50 rounded-lg shadow p-4 border-2 border-green-200">
          <div className="text-sm text-green-700">Closing Milk</div>
          <div className="text-2xl font-bold text-green-900">{book.closing_total_liters?.toFixed(2)}L</div>
          <div className="text-xs text-green-600">{book.closing_avg_fat?.toFixed(2)}% fat</div>
        </div>
        <div className="bg-purple-50 rounded-lg shadow p-4">
          <div className="text-sm text-purple-700">Collections</div>
          <div className="text-2xl font-bold text-purple-900">{book.total_collections_count}</div>
        </div>
        <div className="bg-orange-50 rounded-lg shadow p-4">
          <div className="text-sm text-orange-700">Usages</div>
          <div className="text-2xl font-bold text-orange-900">{book.total_usage_count}</div>
        </div>
        <div className="bg-yellow-50 rounded-lg shadow p-4">
          <div className="text-sm text-yellow-700">Inventory Items</div>
          <div className="text-2xl font-bold text-yellow-900">{book.total_inventory_items_count}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('summary')}
              className={`px-6 py-3 font-medium text-sm ${
                activeTab === 'summary'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Summary
            </button>
            <button
              onClick={() => setActiveTab('usage')}
              className={`px-6 py-3 font-medium text-sm ${
                activeTab === 'usage'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Usage History ({book.total_usage_count})
            </button>
            <button
              onClick={() => setActiveTab('collections')}
              className={`px-6 py-3 font-medium text-sm ${
                activeTab === 'collections'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Collections ({book.total_collections_count})
            </button>
            <button
              onClick={() => setActiveTab('inventory')}
              className={`px-6 py-3 font-medium text-sm ${
                activeTab === 'inventory'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Inventory Produced ({book.total_inventory_items_count})
            </button>
          </nav>
        </div>

        <div className="p-6">
          {/* Summary Tab */}
          {activeTab === 'summary' && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-3">Milk Flow Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Opening Stock:</span>
                    <span className="font-medium text-gray-900">{book.opening_total_liters?.toFixed(2)}L @ {book.opening_avg_fat?.toFixed(2)}% fat</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Opening Fat Units:</span>
                    <span className="font-medium text-gray-900">{book.opening_fat_units?.toFixed(2)}</span>
                  </div>
                  <div className="border-t pt-2"></div>
                  <div className="flex justify-between text-blue-600">
                    <span>Collections Added:</span>
                    <span className="font-medium">{book.total_collections_count} batches</span>
                  </div>
                  <div className="flex justify-between text-red-600">
                    <span>Milk Used:</span>
                    <span className="font-medium">{book.total_milk_used?.toFixed(2)}L ({book.total_fat_used?.toFixed(2)} fat units)</span>
                  </div>
                  <div className="border-t pt-2"></div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Closing Stock:</span>
                    <span className="font-medium text-gray-900">{book.closing_total_liters?.toFixed(2)}L @ {book.closing_avg_fat?.toFixed(2)}% fat</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Closing Fat Units:</span>
                    <span className="font-medium text-gray-900">{book.closing_fat_units?.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-2">Fat % Journey</h3>
                <div className="text-sm text-blue-800">
                  Started at <strong>{book.opening_avg_fat?.toFixed(2)}%</strong> and ended at <strong>{book.closing_avg_fat?.toFixed(2)}%</strong>
                  {book.opening_avg_fat < book.closing_avg_fat ? ' (increased due to selective usage)' : book.opening_avg_fat > book.closing_avg_fat ? ' (decreased)' : ' (remained stable)'}
                </div>
              </div>
            </div>
          )}

          {/* Usage History Tab */}
          {activeTab === 'usage' && (
            <div className="overflow-x-auto">
              {book.usage_history_json && book.usage_history_json.length > 0 ? (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Date</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Liters Used</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Fat %</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Fat Units</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Remaining After</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Avg Fat After</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Purpose</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">User</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {book.usage_history_json.map((usage: any, idx: number) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm text-gray-900">{new Date(usage.used_at).toLocaleString()}</td>
                        <td className="px-4 py-2 text-sm font-medium text-blue-600">{usage.used_liters}L</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{usage.manual_fat_percent}%</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{usage.used_fat_units?.toFixed(2)}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{usage.remaining_liters_after?.toFixed(2)}L</td>
                        <td className="px-4 py-2 text-sm text-orange-600">{usage.remaining_avg_fat_after?.toFixed(2)}%</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{usage.purpose || '-'}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{usage.user_name || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-8 text-gray-500">No usage records</div>
              )}
            </div>
          )}

          {/* Collections Tab */}
          {activeTab === 'collections' && (
            <div className="overflow-x-auto">
              {book.collections_history_json && book.collections_history_json.length > 0 ? (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Date Added</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Supplier</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Quantity</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Fat %</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">SNF %</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Fat Units</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {book.collections_history_json.map((collection: any, idx: number) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm text-gray-900">{new Date(collection.added_at).toLocaleString()}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{collection.supplier_name || 'N/A'}</td>
                        <td className="px-4 py-2 text-sm font-medium text-blue-600">{collection.qty_liters}L</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{collection.fat}%</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{collection.snf || 'N/A'}%</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{(collection.qty_liters * collection.fat).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-8 text-gray-500">No collections added</div>
              )}
            </div>
          )}

          {/* Inventory Tab */}
          {activeTab === 'inventory' && (
            <div className="overflow-x-auto">
              {book.inventory_history_json && book.inventory_history_json.length > 0 ? (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Product</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Quantity</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Unit</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Created At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {book.inventory_history_json.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm font-medium text-gray-900">{item.product_name || 'N/A'}</td>
                        <td className="px-4 py-2 text-sm text-blue-600">{item.quantity}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{item.unit}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{new Date(item.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-8 text-gray-500">No inventory items produced</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
