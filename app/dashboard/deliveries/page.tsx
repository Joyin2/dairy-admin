'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function DeliveriesPage() {
  const supabase = createClient()
  const [deliveries, setDeliveries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [liveUpdates, setLiveUpdates] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleDelete = async (id: string, shopName: string) => {
    if (!confirm(`Delete delivery for ${shopName}?`)) return
    
    setDeleting(id)
    try {
      const { error } = await supabase.from('deliveries').delete().eq('id', id)
      if (error) throw error
      setDeliveries(deliveries.filter(d => d.id !== id))
    } catch (err: any) {
      alert('Failed to delete: ' + err.message)
    } finally {
      setDeleting(null)
    }
  }

  useEffect(() => {
    const fetchDeliveries = async () => {
      setLoading(true)
      let query = supabase
        .from('deliveries')
        .select('*, shops(name, city), routes(name, area, agent:app_users!routes_agent_id_fkey(name))')
        .order('created_at', { ascending: false })
      
      if (statusFilter) {
        query = query.eq('status', statusFilter)
      }
      
      const { data, error } = await query.limit(100)
      if (!error && data) {
        setDeliveries(data)
      }
      setLoading(false)
    }
    fetchDeliveries()

    // Subscribe to real-time updates for all deliveries
    const channel = supabase
      .channel('deliveries-list')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'deliveries',
        },
        (payload) => {
          console.log('Delivery updated:', payload.new)
          // Show live update indicator
          setLiveUpdates((prev) => new Set(prev).add(payload.new.id))
          setTimeout(() => {
            setLiveUpdates((prev) => {
              const next = new Set(prev)
              next.delete(payload.new.id)
              return next
            })
          }, 3000)
          
          // Update the delivery in the list
          setDeliveries((prev) =>
            prev.map((d) => (d.id === payload.new.id ? { ...d, ...payload.new } : d))
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, statusFilter, dateFilter])

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      in_transit: 'bg-blue-100 text-blue-800',
      delivered: 'bg-green-100 text-green-800',
      partial: 'bg-orange-100 text-orange-800',
      returned: 'bg-red-100 text-red-800',
      failed: 'bg-red-100 text-red-800',
    }
    return colors[status] || colors.pending
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Deliveries</h1>
        <Link
          href="/dashboard/deliveries/create"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          + Create Delivery
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in_transit">In Transit</option>
              <option value="delivered">Delivered</option>
              <option value="partial">Partial</option>
              <option value="returned">Returned</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => { setStatusFilter(''); setDateFilter('') }}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {['pending', 'in_transit', 'delivered', 'partial', 'returned'].map(status => {
          const count = deliveries.filter(d => d.status === status).length
          return (
            <div key={status} className="bg-white rounded-lg shadow p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{count}</p>
              <p className="text-sm text-gray-500 capitalize">{status.replace('_', ' ')}</p>
            </div>
          )
        })}
      </div>

      {/* Deliveries List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : deliveries.length > 0 ? (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shop</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Route / Agent</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expected</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Delivered</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {deliveries.map((delivery) => (
                <tr 
                  key={delivery.id} 
                  className={`hover:bg-gray-50 transition-colors ${
                    liveUpdates.has(delivery.id) ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                  }`}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      {liveUpdates.has(delivery.id) && (
                        <span className="flex h-3 w-3 mr-2">
                          <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-blue-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                        </span>
                      )}
                      <div>
                        <div className="font-medium text-gray-900">{delivery.shops?.name || 'Unknown'}</div>
                        <div className="text-sm text-gray-500">{delivery.shops?.city}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-gray-900">{delivery.routes?.name || 'No Route'}</div>
                    <div className="text-xs text-gray-500">
                      {delivery.routes?.area || '-'} • Agent: {delivery.routes?.agent?.name || 'Unassigned'}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{delivery.expected_qty || 0}L</td>
                  <td className="px-6 py-4 text-gray-600">{delivery.delivered_qty || 0}L</td>
                  <td className="px-6 py-4 text-gray-600">₹{delivery.expected_amount || delivery.collected_amount || 0}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 text-xs rounded-full ${getStatusBadge(delivery.status)}`}>
                      {delivery.status}
                    </span>
                    {delivery.status === 'in_transit' && (
                      <div className="text-xs text-blue-600 mt-1 flex items-center">
                        <span className="inline-block w-2 h-2 bg-blue-600 rounded-full mr-1 animate-pulse"></span>
                        Live
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-3">
                      <Link
                        href={`/dashboard/deliveries/${delivery.id}`}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Track
                      </Link>
                      <Link
                        href={`/dashboard/deliveries/${delivery.id}/edit`}
                        className="text-gray-600 hover:text-gray-800 font-medium"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleDelete(delivery.id, delivery.shops?.name || 'this delivery')}
                        disabled={deleting === delivery.id}
                        className="text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
                      >
                        {deleting === delivery.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-gray-500">
            No deliveries found. Create your first delivery to get started.
          </div>
        )}
      </div>
    </div>
  )
}
