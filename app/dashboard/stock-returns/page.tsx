'use client'

import { db, auth } from '@/lib/firebase/client'
import { collection, query, where, getDocs, orderBy, doc, updateDoc, getDoc } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface ReturnRequest {
  id: string
  allocation_id: string
  agent_id: string
  status: string
  total_items: number
  total_quantity: number
  notes: string
  created_at: string
  reviewed_at: string | null
  agent?: { name: string; email: string }
  reviewed_by_user?: { name: string }
  items?: ReturnItem[]
}

interface ReturnItem {
  id: string
  return_id: string
  stock_item_id: string
  product_name: string
  batch_number: string
  packaging_type: string
  package_size: string
  quantity_returned: number
  unit: string
  disposition: string
  restock_quantity: number
  waste_quantity: number
  waste_reason: string
  inventory_item_id: string
}

export default function StockReturnsPage() {
  const [returns, setReturns] = useState<ReturnRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [selectedReturn, setSelectedReturn] = useState<ReturnRequest | null>(null)
  const [processing, setProcessing] = useState(false)
  const [summary, setSummary] = useState({
    pending: 0,
    approved: 0,
    totalPendingQty: 0,
  })

  useEffect(() => {
    fetchReturns()
    fetchSummary()
  }, [statusFilter])

  const fetchSummary = async () => {
    const snap = await getDocs(collection(db, 'stock_returns'))
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]

    const pending = data.filter(r => r.status === 'pending').length
    const approved = data.filter(r => r.status === 'approved').length
    const totalPendingQty = data
      .filter(r => r.status === 'pending')
      .reduce((sum, r) => sum + parseFloat(String(r.total_quantity || 0)), 0)

    setSummary({ pending, approved, totalPendingQty })
  }

  const fetchReturns = async () => {
    setLoading(true)
    try {
      let returnsQuery
      if (statusFilter) {
        returnsQuery = query(collection(db, 'stock_returns'), where('status', '==', statusFilter), orderBy('created_at', 'desc'))
      } else {
        returnsQuery = query(collection(db, 'stock_returns'), orderBy('created_at', 'desc'))
      }

      const snap = await getDocs(returnsQuery)
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]

      // Enrich with agent info and items
      const enriched = await Promise.all(
        data.map(async (ret: any) => {
          const [agentSnap, itemsSnap] = await Promise.all([
            getDoc(doc(db, 'app_users', ret.agent_id)),
            getDocs(query(collection(db, 'stock_return_items'), where('return_id', '==', ret.id))),
          ])

          let reviewedByUser = null
          if (ret.reviewed_by) {
            const reviewerSnap = await getDoc(doc(db, 'app_users', ret.reviewed_by))
            if (reviewerSnap.exists()) reviewedByUser = { name: (reviewerSnap.data() as any).name }
          }

          return {
            ...ret,
            agent: agentSnap.exists() ? { id: agentSnap.id, ...agentSnap.data() } : null,
            reviewed_by_user: reviewedByUser,
            items: itemsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
          }
        })
      )

      setReturns(enriched)
    } catch (err) {
      console.error('Error:', err)
    }
    setLoading(false)
  }

  const handleApproveAll = async (returnRequest: ReturnRequest) => {
    if (!returnRequest.items || returnRequest.items.length === 0) return

    setProcessing(true)
    try {
      const user = auth.currentUser
      let adminId = null
      if (user) {
        const appUserSnap = await getDocs(query(collection(db, 'app_users'), where('auth_uid', '==', user.uid)))
        if (!appUserSnap.empty) adminId = appUserSnap.docs[0].id
      }

      // Update all items to restock
      for (const item of returnRequest.items) {
        // Validate: check current remaining stock for this item
        const stockItemSnap = await getDoc(doc(db, 'agent_stock_items', item.stock_item_id))

        if (stockItemSnap.exists()) {
          const stockItem = stockItemSnap.data() as any
          const currentRemaining = parseFloat(String(stockItem.quantity_allocated || 0)) -
            parseFloat(String(stockItem.quantity_sold || 0)) -
            parseFloat(String(stockItem.quantity_returned || 0))
          const actualReturnQty = Math.min(item.quantity_returned, currentRemaining)

          // Update return item disposition
          await updateDoc(doc(db, 'stock_return_items', item.id), {
            disposition: 'restock',
            restock_quantity: actualReturnQty,
            waste_quantity: 0,
          })

          // Add back to production_inventory
          if (item.inventory_item_id && actualReturnQty > 0) {
            const invItemSnap = await getDoc(doc(db, 'production_inventory', item.inventory_item_id))
            if (invItemSnap.exists()) {
              const invItem = invItemSnap.data() as any
              await updateDoc(doc(db, 'production_inventory', item.inventory_item_id), {
                quantity: parseFloat(String(invItem.quantity)) + actualReturnQty
              })
            }
          }

          // Update agent_stock_items.quantity_returned
          const newReturned = parseFloat(String(stockItem.quantity_returned || 0)) + actualReturnQty
          await updateDoc(doc(db, 'agent_stock_items', item.stock_item_id), {
            quantity_returned: newReturned
          })
        }
      }

      // Update return request status
      await updateDoc(doc(db, 'stock_returns', returnRequest.id), {
        status: 'approved',
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
      })

      // Mark allocation as completed now that return is approved
      await updateDoc(doc(db, 'agent_stock_allocations', returnRequest.allocation_id), {
        status: 'completed',
        completed_at: new Date().toISOString(),
      })

      setSelectedReturn(null)
      fetchReturns()
      fetchSummary()
    } catch (err) {
      console.error('Error approving:', err)
    }
    setProcessing(false)
  }

  const handleRejectAll = async (returnRequest: ReturnRequest) => {
    if (!returnRequest.items || returnRequest.items.length === 0) return

    setProcessing(true)
    try {
      const user = auth.currentUser
      let adminId = null
      if (user) {
        const appUserSnap = await getDocs(query(collection(db, 'app_users'), where('auth_uid', '==', user.uid)))
        if (!appUserSnap.empty) adminId = appUserSnap.docs[0].id
      }

      // Update all items to rejected
      for (const item of returnRequest.items) {
        await updateDoc(doc(db, 'stock_return_items', item.id), {
          disposition: 'rejected',
          restock_quantity: 0,
          waste_quantity: 0,
          waste_reason: 'Rejected by admin - agent to continue selling',
        })
      }

      // NOTE: Do NOT update agent_stock_items.quantity_returned
      // Rejection means the agent keeps the stock and can continue selling.
      // Do NOT mark allocation as completed - agent stays active.

      // Fix quantity_returned on stock items - recalculate based on approved returns only
      for (const item of returnRequest.items) {
        if (item.stock_item_id) {
          const stockItemSnap = await getDoc(doc(db, 'agent_stock_items', item.stock_item_id))
          if (stockItemSnap.exists()) {
            // Sum only approved return quantities (restock or waste) for this stock item
            const approvedSnap = await getDocs(query(
              collection(db, 'stock_return_items'),
              where('stock_item_id', '==', item.stock_item_id),
              where('disposition', 'in', ['restock', 'waste'])
            ))
            const correctReturned = approvedSnap.docs.reduce(
              (sum: number, d: any) => sum + parseFloat(String(d.data().quantity_returned || 0)), 0
            )
            await updateDoc(doc(db, 'agent_stock_items', item.stock_item_id), {
              quantity_returned: correctReturned
            })
          }
        }
      }

      // Reactivate allocation if it was prematurely completed
      const allocSnap = await getDoc(doc(db, 'agent_stock_allocations', returnRequest.allocation_id))
      if (allocSnap.exists() && (allocSnap.data() as any).status === 'completed') {
        await updateDoc(doc(db, 'agent_stock_allocations', returnRequest.allocation_id), {
          status: 'in_delivery',
          completed_at: null
        })
      }

      // Update return request status
      await updateDoc(doc(db, 'stock_returns', returnRequest.id), {
        status: 'rejected',
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
      })

      setSelectedReturn(null)
      fetchReturns()
      fetchSummary()
    } catch (err) {
      console.error('Error rejecting:', err)
    }
    setProcessing(false)
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending Review' },
      approved: { bg: 'bg-green-100', text: 'text-green-800', label: 'Approved' },
      rejected: { bg: 'bg-red-100', text: 'text-red-800', label: 'Rejected' },
      partial: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Partial' },
    }
    const s = styles[status] || styles.pending
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
        {s.label}
      </span>
    )
  }

  const statuses = [
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: '', label: 'All' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Stock Returns</h1>
          <p className="text-sm text-gray-600 mt-1">Review and approve returned products from delivery agents</p>
        </div>
        <Link
          href="/dashboard/dispatch"
          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          ← Back to Dispatch
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
          <p className="text-xs text-gray-500 uppercase font-medium">Pending Approval</p>
          <p className="text-2xl font-bold text-yellow-600">{summary.pending}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-500">
          <p className="text-xs text-gray-500 uppercase font-medium">Pending Quantity</p>
          <p className="text-2xl font-bold text-orange-600">{summary.totalPendingQty.toFixed(1)} units</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
          <p className="text-xs text-gray-500 uppercase font-medium">Approved Returns</p>
          <p className="text-2xl font-bold text-green-600">{summary.approved}</p>
        </div>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 flex-wrap">
        {statuses.map(s => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(s.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === s.value
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Returns List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : returns.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="text-5xl mb-4">📦</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Return Requests</h3>
          <p className="text-gray-600">
            {statusFilter === 'pending'
              ? 'No pending return requests to review.'
              : 'No return requests found for the selected filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {returns.map((ret) => (
            <div key={ret.id} className="bg-white rounded-lg shadow overflow-hidden">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {ret.agent?.name || 'Unknown Agent'}
                    </h3>
                    <p className="text-sm text-gray-500">{ret.agent?.email}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Submitted: {new Date(ret.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(ret.status)}
                  </div>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 rounded-lg p-4 mb-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase font-medium">Items</p>
                    <p className="text-lg font-bold text-gray-900">{ret.total_items}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase font-medium">Total Quantity</p>
                    <p className="text-lg font-bold text-gray-900">{parseFloat(String(ret.total_quantity)).toFixed(1)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase font-medium">Status</p>
                    <p className="text-lg font-bold text-gray-900 capitalize">{ret.status}</p>
                  </div>
                  {ret.reviewed_by_user && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-medium">Reviewed By</p>
                      <p className="text-sm font-semibold text-gray-900">{ret.reviewed_by_user.name}</p>
                    </div>
                  )}
                </div>

                {/* Items Table */}
                {ret.items && ret.items.length > 0 && (
                  <div className="border rounded-lg overflow-hidden mb-4">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Packaging</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty Returned</th>
                          <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Disposition</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {ret.items.map((item) => (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.product_name}</td>
                            <td className="px-4 py-3 text-sm text-blue-600 font-mono">{item.batch_number}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {item.packaging_type || '-'} {item.package_size ? `(${item.package_size})` : ''}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                              {parseFloat(String(item.quantity_returned)).toFixed(1)} {item.unit}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {item.disposition === 'pending' ? (
                                <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded">Pending</span>
                              ) : item.disposition === 'restock' ? (
                                <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">Restocked</span>
                              ) : item.disposition === 'waste' ? (
                                <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded">Waste</span>
                              ) : (
                                <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">{item.disposition}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Action Buttons */}
                {ret.status === 'pending' && (
                  <div className="flex gap-3 pt-4 border-t border-gray-200">
                    <button
                      onClick={() => handleApproveAll(ret)}
                      disabled={processing}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      ✓ Approve All & Restock
                    </button>
                    <button
                      onClick={() => setSelectedReturn(ret)}
                      disabled={processing}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      Review Items
                    </button>
                    <button
                      onClick={() => handleRejectAll(ret)}
                      disabled={processing}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      ✗ Reject (Agent Keeps Stock)
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Review Modal */}
      {selectedReturn && (
        <ReviewModal
          returnRequest={selectedReturn}
          onClose={() => setSelectedReturn(null)}
          onComplete={() => {
            setSelectedReturn(null)
            fetchReturns()
            fetchSummary()
          }}
        />
      )}
    </div>
  )
}

// Review Modal Component
function ReviewModal({
  returnRequest,
  onClose,
  onComplete
}: {
  returnRequest: ReturnRequest
  onClose: () => void
  onComplete: () => void
}) {
  const [items, setItems] = useState<(ReturnItem & { localDisposition: string; localWasteReason: string })[]>([])
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    setItems(
      (returnRequest.items || []).map(item => ({
        ...item,
        localDisposition: 'restock',
        localWasteReason: '',
      }))
    )
  }, [returnRequest])

  const handleSubmit = async () => {
    setProcessing(true)
    try {
      const user = auth.currentUser
      let adminId = null
      if (user) {
        const appUserSnap = await getDocs(query(collection(db, 'app_users'), where('auth_uid', '==', user.uid)))
        if (!appUserSnap.empty) adminId = appUserSnap.docs[0].id
      }

      let hasRestock = false
      let hasWaste = false

      for (const item of items) {
        const isRestock = item.localDisposition === 'restock'

        if (isRestock) hasRestock = true
        else hasWaste = true

        // Validate: check current remaining stock for this item
        const stockItemSnap = await getDoc(doc(db, 'agent_stock_items', item.stock_item_id))

        if (stockItemSnap.exists()) {
          const stockItem = stockItemSnap.data() as any
          const currentRemaining = parseFloat(String(stockItem.quantity_allocated || 0)) -
            parseFloat(String(stockItem.quantity_sold || 0)) -
            parseFloat(String(stockItem.quantity_returned || 0))
          const actualReturnQty = Math.min(item.quantity_returned, currentRemaining)

          // Update return item
          await updateDoc(doc(db, 'stock_return_items', item.id), {
            disposition: item.localDisposition,
            restock_quantity: isRestock ? actualReturnQty : 0,
            waste_quantity: isRestock ? 0 : actualReturnQty,
            waste_reason: isRestock ? null : item.localWasteReason,
          })

          // Only add back to inventory if restocking
          if (isRestock && item.inventory_item_id && actualReturnQty > 0) {
            const invItemSnap = await getDoc(doc(db, 'production_inventory', item.inventory_item_id))
            if (invItemSnap.exists()) {
              const invItem = invItemSnap.data() as any
              await updateDoc(doc(db, 'production_inventory', item.inventory_item_id), {
                quantity: parseFloat(String(invItem.quantity)) + actualReturnQty
              })
            }
          }

          // Update agent_stock_items.quantity_returned for both restock and waste
          if (actualReturnQty > 0) {
            const newReturned = parseFloat(String(stockItem.quantity_returned || 0)) + actualReturnQty
            await updateDoc(doc(db, 'agent_stock_items', item.stock_item_id), {
              quantity_returned: newReturned
            })
          }
        }
      }

      // Determine overall status
      let newStatus = 'approved'
      if (hasRestock && hasWaste) newStatus = 'partial'
      else if (!hasRestock && hasWaste) newStatus = 'rejected'

      await updateDoc(doc(db, 'stock_returns', returnRequest.id), {
        status: newStatus,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
      })

      // Mark allocation as completed now that return is processed
      await updateDoc(doc(db, 'agent_stock_allocations', returnRequest.allocation_id), {
        status: 'completed',
        completed_at: new Date().toISOString(),
      })

      onComplete()
    } catch (err) {
      console.error('Error processing:', err)
    }
    setProcessing(false)
  }

  const updateItem = (itemId: string, field: string, value: string) => {
    setItems(items.map(i =>
      i.id === itemId ? { ...i, [field]: value } : i
    ))
  }

  const restockCount = items.filter(i => i.localDisposition === 'restock').length
  const wasteCount = items.filter(i => i.localDisposition === 'waste').length

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Review Return Items</h2>
              <p className="text-sm text-gray-600 mt-1">
                Agent: {returnRequest.agent?.name || 'Unknown'}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-semibold text-gray-900">{item.product_name}</h4>
                    <p className="text-sm text-blue-600 font-mono">Batch: {item.batch_number}</p>
                    <p className="text-sm text-gray-500">
                      {item.packaging_type} {item.package_size ? `(${item.package_size})` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-900">
                      {parseFloat(String(item.quantity_returned)).toFixed(1)} {item.unit}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Disposition</label>
                    <select
                      value={item.localDisposition}
                      onChange={(e) => updateItem(item.id, 'localDisposition', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    >
                      <option value="restock">✓ Restock to Inventory</option>
                      <option value="waste">✗ Mark as Waste</option>
                    </select>
                  </div>
                  {item.localDisposition === 'waste' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Waste Reason</label>
                      <select
                        value={item.localWasteReason}
                        onChange={(e) => updateItem(item.id, 'localWasteReason', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      >
                        <option value="">Select reason...</option>
                        <option value="Damaged packaging">Damaged packaging</option>
                        <option value="Expired product">Expired product</option>
                        <option value="Contaminated">Contaminated</option>
                        <option value="Temperature abuse">Temperature abuse</option>
                        <option value="Quality issues">Quality issues</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-4">
              <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                {restockCount} to Restock
              </span>
              <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
                {wasteCount} as Waste
              </span>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2.5 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={processing}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {processing ? 'Processing...' : 'Confirm & Process'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
