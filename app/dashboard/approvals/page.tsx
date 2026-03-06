'use client'

import { db, auth } from '@/lib/firebase/client'
import { collection, query, where, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore'
import { useEffect, useState } from 'react'

export default function ApprovalsPage() {
  const [pendingShops, setPendingShops] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)

  useEffect(() => {
    fetchPendingShops()
  }, [])

  const fetchPendingShops = async () => {
    setLoading(true)
    try {
      const q = query(
        collection(db, 'shops'),
        where('status', '==', 'pending_approval')
      )
      const snapshot = await getDocs(q)
      const shops = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => {
          const ta = a.created_at?.toDate?.() ?? new Date(a.created_at ?? 0)
          const tb = b.created_at?.toDate?.() ?? new Date(b.created_at ?? 0)
          return tb.getTime() - ta.getTime()
        })

      // Enrich with creator user info
      const enriched = await Promise.all(
        shops.map(async (shop: any) => {
          if (!shop.created_by) return shop
          try {
            const userDoc = await getDoc(doc(db, 'app_users', shop.created_by))
            return {
              ...shop,
              created_by_user: userDoc.exists() ? userDoc.data() : null,
            }
          } catch {
            return shop
          }
        })
      )

      setPendingShops(enriched)
    } catch (err: any) {
      console.error('Error fetching pending shops:', err)
    }
    setLoading(false)
  }

  const handleApprove = async (shopId: string, shopName: string) => {
    if (!confirm(`Approve shop: ${shopName}?`)) return

    setProcessing(shopId)
    try {
      // Get the app_users id from auth_uid
      let adminId = null
      const uid = auth.currentUser?.uid
      if (uid) {
        const usersQ = query(collection(db, 'app_users'), where('auth_uid', '==', uid))
        const usersSnap = await getDocs(usersQ)
        if (!usersSnap.empty) {
          adminId = usersSnap.docs[0].id
        }
      }

      await updateDoc(doc(db, 'shops', shopId), {
        status: 'approved',
        approved_by: adminId,
        approved_at: new Date().toISOString(),
      })

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
      // Get the app_users id from auth_uid
      let adminId = null
      const uid = auth.currentUser?.uid
      if (uid) {
        const usersQ = query(collection(db, 'app_users'), where('auth_uid', '==', uid))
        const usersSnap = await getDocs(usersQ)
        if (!usersSnap.empty) {
          adminId = usersSnap.docs[0].id
        }
      }

      await updateDoc(doc(db, 'shops', shopId), {
        status: 'rejected',
        approval_notes: notes,
        approved_by: adminId,
        approved_at: new Date().toISOString(),
      })

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
