'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

export default function ApprovalsPage() {
  const supabase = createClient()
  const [pendingShops, setPendingShops] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)

  useEffect(() => {
    fetchPendingShops()
  }, [])

  const fetchPendingShops = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('shops')
      .select('*, created_by_user:app_users!shops_created_by_fkey(name, email, phone)')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setPendingShops(data)
    }
    setLoading(false)
  }

  const handleApprove = async (shopId: string, shopName: string) => {
    if (!confirm(`Approve shop: ${shopName}?`)) return
    
    setProcessing(shopId)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      // Get the app_users id from auth_uid
      const { data: appUser } = await supabase
        .from('app_users')
        .select('id')
        .eq('auth_uid', user?.id)
        .single()
      
      const { error } = await supabase
        .from('shops')
        .update({
          status: 'approved',
          approved_by: appUser?.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', shopId)

      if (error) throw error

      alert(`Shop "${shopName}" has been approved!`)
      fetchPendingShops()
    } catch (error: any) {
      alert('Failed to approve: ' + error.message)
    } finally {
      setProcessing(null)
    }
  }

  const handleReject = async (shopId: string, shopName: string) => {
    const notes = prompt(`Reject shop "${shopName}"? Enter rejection reason:`)
    if (!notes) return
    
    setProcessing(shopId)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      // Get the app_users id from auth_uid
      const { data: appUser } = await supabase
        .from('app_users')
        .select('id')
        .eq('auth_uid', user?.id)
        .single()
      
      const { error } = await supabase
        .from('shops')
        .update({
          status: 'rejected',
          approval_notes: notes,
          approved_by: appUser?.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', shopId)

      if (error) throw error

      alert(`Shop "${shopName}" has been rejected.`)
      fetchPendingShops()
    } catch (error: any) {
      alert('Failed to reject: ' + error.message)
    } finally {
      setProcessing(null)
    }
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Shop Approvals</h1>
        <div className="text-center py-12">Loading...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Shop Approvals</h1>
        <p className="text-gray-600 mt-2">
          Review and approve shops created by delivery agents ({pendingShops.length} pending)
        </p>
      </div>

      {pendingShops.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <div className="text-gray-400 text-5xl mb-4">✓</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Pending Approvals</h3>
          <p className="text-gray-600">All shops have been reviewed and processed.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {pendingShops.map((shop) => (
            <div key={shop.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">{shop.name}</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Owner:</span>
                      <span className="ml-2 text-gray-900">{shop.owner_name || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Contact:</span>
                      <span className="ml-2 text-gray-900">{shop.contact}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">City:</span>
                      <span className="ml-2 text-gray-900">{shop.city}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Type:</span>
                      <span className="ml-2 text-gray-900 capitalize">{shop.shop_type || 'retail'}</span>
                    </div>
                  </div>
                  <div className="mt-3">
                    <span className="text-gray-500 text-sm">Address:</span>
                    <p className="text-gray-900">{shop.address}</p>
                  </div>
                  {shop.gst_number && (
                    <div className="mt-2">
                      <span className="text-gray-500 text-sm">GST:</span>
                      <span className="ml-2 text-gray-900">{shop.gst_number}</span>
                    </div>
                  )}
                </div>
                <div className="ml-6 text-right">
                  <div className="text-sm text-gray-500 mb-1">Created by</div>
                  <div className="font-medium text-gray-900">
                    {shop.created_by_user?.name || 'Agent'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {shop.created_by_user?.email}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {new Date(shop.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3 pt-4 border-t">
                <button
                  onClick={() => handleApprove(shop.id, shop.name)}
                  disabled={processing === shop.id}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
                >
                  {processing === shop.id ? 'Processing...' : '✓ Approve'}
                </button>
                <button
                  onClick={() => handleReject(shop.id, shop.name)}
                  disabled={processing === shop.id}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
                >
                  {processing === shop.id ? 'Processing...' : '× Reject'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
