'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function DeliveryDetailPage() {
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()
  
  const [delivery, setDelivery] = useState<any>(null)
  const [statusHistory, setStatusHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDelivery = async () => {
      const { data, error } = await supabase
        .from('deliveries')
        .select('*, shops(name, city, address, contact), routes(id, name, area, delivery_type, agent:app_users!routes_agent_id_fkey(name))')
        .eq('id', params.id)
        .single()
      
      if (error) {
        console.error('Error fetching delivery:', error)
        setError('Delivery not found')
      } else {
        setDelivery(data)
      }
      setLoading(false)
    }

    const fetchStatusHistory = async () => {
      const { data } = await supabase
        .from('delivery_status_history')
        .select('*, changed_by_user:app_users(name, email)')
        .eq('delivery_id', params.id)
        .order('changed_at', { ascending: false })
      
      setStatusHistory(data || [])
    }

    fetchDelivery()
    fetchStatusHistory()

    // Subscribe to real-time delivery updates
    const deliveryChannel = supabase
      .channel(`delivery-${params.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'deliveries',
          filter: `id=eq.${params.id}`,
        },
        (payload) => {
          console.log('Delivery updated:', payload.new)
          setDelivery(payload.new)
        }
      )
      .subscribe()

    // Subscribe to real-time status history updates
    const historyChannel = supabase
      .channel(`delivery-history-${params.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'delivery_status_history',
          filter: `delivery_id=eq.${params.id}`,
        },
        (payload) => {
          console.log('New status history:', payload.new)
          setStatusHistory((prev) => [payload.new, ...prev])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(deliveryChannel)
      supabase.removeChannel(historyChannel)
    }
  }, [params.id, supabase])

  const handleStatusUpdate = async (status: string) => {
    setSaving(true)
    const updates: any = { status }
    if (status === 'delivered') {
      updates.delivered_at = new Date().toISOString()
      updates.delivered_qty = delivery.expected_qty
    }
    
    const { error } = await supabase.from('deliveries').update(updates).eq('id', params.id)
    if (!error) {
      setDelivery({ ...delivery, ...updates })
    }
    setSaving(false)
  }

  const handleCollectPayment = async () => {
    const amount = prompt('Enter collected amount (₹):')
    if (!amount) return
    
    setSaving(true)
    const { error } = await supabase.from('deliveries').update({
      collected_amount: parseFloat(amount),
    }).eq('id', params.id)
    
    if (!error) {
      setDelivery({ ...delivery, collected_amount: parseFloat(amount) })
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this delivery?')) return
    setSaving(true)
    const { error } = await supabase.from('deliveries').delete().eq('id', params.id)
    if (!error) {
      router.push('/dashboard/deliveries')
      router.refresh()
    }
    setSaving(false)
  }

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

  if (loading) {
    return <div className="flex justify-center items-center min-h-[400px] text-gray-500">Loading...</div>
  }

  if (error || !delivery) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error || 'Delivery not found'}</p>
        <Link href="/dashboard/deliveries" className="text-blue-600 hover:text-blue-800">← Back to Deliveries</Link>
      </div>
    )
  }

  const items = delivery.items || []

  const getStatusIcon = (status: string) => {
    const icons: Record<string, string> = {
      pending: '⏳',
      in_transit: '🚚',
      delivered: '✅',
      partial: '⚠️',
      returned: '↩️',
      failed: '❌',
    }
    return icons[status] || '📦'
  }

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <Link href="/dashboard/deliveries" className="text-sm text-blue-600 hover:text-blue-800 mb-2 inline-block">
            ← Back to Deliveries
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Delivery Details</h1>
          <p className="text-gray-600 mt-1">
            {delivery.shops?.name} • {delivery.routes?.name || 'No Route'}
          </p>
        </div>
        <div className="flex gap-2">
          <span className={`px-4 py-2 text-sm rounded-lg ${getStatusBadge(delivery.status)}`}>
            {delivery.status}
          </span>
        </div>
      </div>

      {/* Delivery Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Shop Details</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Shop Name</p>
              <p className="font-medium text-gray-900">{delivery.shops?.name || 'Unknown'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">City</p>
              <p className="text-gray-900">{delivery.shops?.city || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Address</p>
              <p className="text-gray-900">{delivery.shops?.address || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Contact</p>
              <p className="text-gray-900">{delivery.shops?.contact || '-'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Delivery Info</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Expected Qty</p>
                <p className="text-2xl font-bold text-gray-900">{delivery.expected_qty || 0}L</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Delivered Qty</p>
                <p className="text-2xl font-bold text-green-600">{delivery.delivered_qty || 0}L</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Payment Mode</p>
                <p className="text-gray-900 capitalize">{delivery.payment_mode || 'Cash'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Collected Amount</p>
                <p className="text-2xl font-bold text-purple-600">₹{delivery.collected_amount || 0}</p>
              </div>
            </div>
            {delivery.delivered_at && (
              <div>
                <p className="text-sm text-gray-500">Delivered At</p>
                <p className="text-gray-900">{new Date(delivery.delivered_at).toLocaleString()}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Route Info */}
      {delivery.routes && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Route Information</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">{delivery.routes.name}</p>
              <p className="text-sm text-gray-500">
                {delivery.routes.area || 'N/A'} • {delivery.routes.delivery_type || 'morning'} • Agent: {delivery.routes.agent?.name || 'Unassigned'}
              </p>
            </div>
            <Link
              href={`/dashboard/routes/${delivery.route_id}`}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              View Route →
            </Link>
          </div>
        </div>
      )}

      {/* Real-Time Tracking Timeline */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Delivery Timeline</h2>
          <p className="text-sm text-gray-500 mt-1">Real-time updates from delivery agent</p>
        </div>
        
        {/* Progress Bar */}
        <div className="px-6 py-4 bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <span className="text-2xl mr-2">{getStatusIcon('pending')}</span>
              <span className="text-xs font-medium text-gray-600">Pending</span>
            </div>
            <div className="flex items-center">
              <span className="text-2xl mr-2">{getStatusIcon('in_transit')}</span>
              <span className="text-xs font-medium text-gray-600">In Transit</span>
            </div>
            <div className="flex items-center">
              <span className="text-2xl mr-2">{getStatusIcon('delivered')}</span>
              <span className="text-xs font-medium text-gray-600">Delivered</span>
            </div>
          </div>
          <div className="relative">
            <div className="h-2 bg-gray-200 rounded-full">
              <div 
                className={`h-2 rounded-full transition-all duration-500 ${
                  delivery.status === 'delivered' || delivery.status === 'partial' ? 'bg-green-500 w-full' :
                  delivery.status === 'in_transit' ? 'bg-blue-500 w-1/2' :
                  delivery.status === 'returned' || delivery.status === 'failed' ? 'bg-red-500 w-1/2' :
                  'bg-yellow-500 w-1/4'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Timestamp Cards */}
        {(delivery.accepted_at || delivery.picked_up_at || delivery.delivered_at) && (
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="grid grid-cols-3 gap-4">
              {delivery.accepted_at && (
                <div className="text-center">
                  <p className="text-xs text-gray-500">Accepted</p>
                  <p className="text-sm font-medium text-gray-900">{formatTimestamp(delivery.accepted_at)}</p>
                </div>
              )}
              {delivery.picked_up_at && (
                <div className="text-center">
                  <p className="text-xs text-gray-500">Picked Up</p>
                  <p className="text-sm font-medium text-gray-900">{formatTimestamp(delivery.picked_up_at)}</p>
                </div>
              )}
              {delivery.delivered_at && (
                <div className="text-center">
                  <p className="text-xs text-gray-500">Delivered</p>
                  <p className="text-sm font-medium text-gray-900">{formatTimestamp(delivery.delivered_at)}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Status History Timeline */}
        {statusHistory.length > 0 ? (
          <div className="px-6 py-4">
            <div className="flow-root">
              <ul className="-mb-8">
                {statusHistory.map((history, idx) => (
                  <li key={history.id}>
                    <div className="relative pb-8">
                      {idx !== statusHistory.length - 1 && (
                        <span
                          className="absolute left-5 top-5 -ml-px h-full w-0.5 bg-gray-200"
                          aria-hidden="true"
                        />
                      )}
                      <div className="relative flex items-start space-x-3">
                        <div>
                          <div className="relative px-1">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 ring-8 ring-white">
                              <span className="text-2xl">{getStatusIcon(history.status)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div>
                            <div className="text-sm">
                              <span className="font-medium text-gray-900 capitalize">
                                {history.status.replace('_', ' ')}
                              </span>
                              {history.previous_status && (
                                <span className="text-gray-500">
                                  {' '}from <span className="capitalize">{history.previous_status.replace('_', ' ')}</span>
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-gray-500">
                              {formatTimestamp(history.changed_at)}
                              {history.changed_by_user && (
                                <> • by {history.changed_by_user.name || history.changed_by_user.email}</>
                              )}
                            </p>
                          </div>
                          {history.metadata && (
                            <div className="mt-2 text-xs text-gray-700">
                              {history.metadata.delivered_qty && (
                                <span className="mr-3">📦 {history.metadata.delivered_qty}L delivered</span>
                              )}
                              {history.metadata.collected_amount && (
                                <span>💰 ₹{history.metadata.collected_amount} collected</span>
                              )}
                            </div>
                          )}
                          {history.location && (
                            <div className="mt-1 text-xs text-gray-500">
                              📍 Location: {history.location.lat?.toFixed(4)}, {history.location.lng?.toFixed(4)}
                            </div>
                          )}
                          {history.notes && (
                            <div className="mt-2 text-sm text-gray-600 bg-gray-50 rounded p-2">
                              {history.notes}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="px-6 py-8 text-center text-gray-500">
            <p className="text-sm">No status changes yet</p>
            <p className="text-xs mt-1">Updates will appear here in real-time</p>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Delivery Items</h2>
        </div>
        {items.length > 0 ? (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {items.map((item: any, index: number) => (
                <tr key={index}>
                  <td className="px-6 py-4 font-medium text-gray-900">{item.product_name}</td>
                  <td className="px-6 py-4 text-gray-600">{item.qty}</td>
                  <td className="px-6 py-4 text-gray-600">₹{item.price}</td>
                  <td className="px-6 py-4 text-gray-900 font-medium">₹{(item.qty * item.price).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={3} className="px-6 py-3 text-right font-medium text-gray-900">Total:</td>
                <td className="px-6 py-3 font-bold text-gray-900">
                  ₹{items.reduce((sum: number, item: any) => sum + (item.qty * item.price), 0).toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <div className="p-8 text-center text-gray-500">No items in this delivery</div>
        )}
      </div>
    </div>
  )
}
