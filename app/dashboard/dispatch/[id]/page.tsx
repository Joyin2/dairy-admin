'use client'

import { db } from '@/lib/firebase/client'
import { collection, query, where, getDocs, orderBy, doc, getDoc } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

export default function DispatchDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [allocation, setAllocation] = useState<any>(null)
  const [sales, setSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAllocation()
  }, [])

  const fetchAllocation = async () => {
    setLoading(true)
    try {
      // Fetch allocation
      const allocDoc = await getDoc(doc(db, 'agent_stock_allocations', params.id as string))
      if (!allocDoc.exists()) {
        setLoading(false)
        return
      }
      const allocData = { id: allocDoc.id, ...allocDoc.data() } as any

      // Fetch related data in parallel
      const [agentSnap, creatorSnap, itemsSnap] = await Promise.all([
        getDoc(doc(db, 'app_users', allocData.agent_id)),
        allocData.created_by
          ? getDoc(doc(db, 'app_users', allocData.created_by))
          : Promise.resolve(null),
        getDocs(query(
          collection(db, 'agent_stock_items'),
          where('allocation_id', '==', allocData.id)
        )),
      ])

      const enrichedAlloc = {
        ...allocData,
        agent: agentSnap.exists() ? agentSnap.data() : null,
        created_by_user: creatorSnap?.exists() ? creatorSnap.data() : null,
        items: itemsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      }
      setAllocation(enrichedAlloc)

      // Fetch sales for all items in this allocation
      if (enrichedAlloc.items.length > 0) {
        const itemIds = enrichedAlloc.items.map((i: any) => i.id)

        // Firestore 'in' supports up to 30 values; chunk if needed
        let allSales: any[] = []
        const chunks: string[][] = []
        for (let i = 0; i < itemIds.length; i += 30) {
          chunks.push(itemIds.slice(i, i + 30))
        }
        for (const chunk of chunks) {
          const salesSnap = await getDocs(query(
            collection(db, 'delivery_sales'),
            where('allocation_item_id', 'in', chunk),
            orderBy('created_at', 'desc')
          ))
          allSales = allSales.concat(salesSnap.docs.map(d => ({ id: d.id, ...d.data() })))
        }

        // Enrich sales with delivery/shop info
        const enrichedSales = await Promise.all(
          allSales.map(async (sale: any) => {
            if (!sale.delivery_id) return sale
            try {
              const deliveryDoc = await getDoc(doc(db, 'deliveries', sale.delivery_id))
              if (!deliveryDoc.exists()) return sale
              const deliveryData = { id: deliveryDoc.id, ...deliveryDoc.data() } as any

              let shopData = null
              if (deliveryData.shop_id) {
                const shopDoc = await getDoc(doc(db, 'shops', deliveryData.shop_id))
                if (shopDoc.exists()) shopData = shopDoc.data()
              }

              return {
                ...sale,
                delivery: {
                  ...deliveryData,
                  shops: shopData,
                },
              }
            } catch {
              return sale
            }
          })
        )
        setSales(enrichedSales)
      }
    } catch (err: any) {
      console.error('Error fetching allocation:', err)
    }
    setLoading(false)
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string; label: string }> = {
      pending_pickup: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending Pickup' },
      picked_up: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Picked Up' },
      in_delivery: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'In Delivery' },
      completed: { bg: 'bg-green-100', text: 'text-green-800', label: 'Completed' },
      returned: { bg: 'bg-red-100', text: 'text-red-800', label: 'Returned' },
    }
    const s = styles[status] || styles.pending_pickup
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
        {s.label}
      </span>
    )
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading dispatch details...</div>
  }

  if (!allocation) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Dispatch not found</p>
        <Link href="/dashboard/dispatch" className="text-blue-600 hover:underline mt-2 inline-block">
          Back to Dispatch List
        </Link>
      </div>
    )
  }

  const items = allocation.items || []
  const totalAllocated = items.reduce((sum: number, i: any) => sum + parseFloat(i.quantity_allocated || 0), 0)
  const totalSold = items.reduce((sum: number, i: any) => sum + parseFloat(i.quantity_sold || 0), 0)
  const totalReturned = items.reduce((sum: number, i: any) => sum + parseFloat(i.quantity_returned || 0), 0)
  const totalRemaining = totalAllocated - totalSold - totalReturned
  const totalRevenue = sales.reduce((sum: number, s: any) => sum + parseFloat(s.total_amount || 0), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/dashboard/dispatch" className="text-blue-600 hover:underline text-sm">
              &larr; Back to Dispatch
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Dispatch Details</h1>
          <p className="text-sm text-gray-500 mt-1">
            Created {(allocation.created_at?.toDate?.() ?? new Date(allocation.created_at)).toLocaleString()}
            {allocation.created_by_user && ` by ${allocation.created_by_user.name}`}
          </p>
        </div>
        {getStatusBadge(allocation.status)}
      </div>

      {/* Agent Info */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Agent Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-500">Name</p>
            <p className="font-semibold text-gray-900">{allocation.agent?.name || 'Unknown'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Email</p>
            <p className="text-gray-900">{allocation.agent?.email || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Phone</p>
            <p className="text-gray-900">{allocation.agent?.phone || '-'}</p>
          </div>
        </div>
        {allocation.notes && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500">Notes</p>
            <p className="text-gray-900">{allocation.notes}</p>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <p className="text-xs text-gray-500 uppercase font-medium">Total Allocated</p>
          <p className="text-2xl font-bold text-gray-900">{totalAllocated.toFixed(1)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <p className="text-xs text-gray-500 uppercase font-medium">Sold</p>
          <p className="text-2xl font-bold text-green-600">{totalSold.toFixed(1)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <p className="text-xs text-gray-500 uppercase font-medium">Returned</p>
          <p className="text-2xl font-bold text-red-600">{totalReturned.toFixed(1)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <p className="text-xs text-gray-500 uppercase font-medium">Remaining</p>
          <p className="text-2xl font-bold text-yellow-600">{totalRemaining.toFixed(1)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <p className="text-xs text-gray-500 uppercase font-medium">Revenue</p>
          <p className="text-2xl font-bold text-blue-600">{totalRevenue.toFixed(2)}</p>
        </div>
      </div>

      {/* Items Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Dispatched Products</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Packaging</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Allocated</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sold</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Returned</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Remaining</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {items.map((item: any) => {
              const remaining = parseFloat(item.quantity_allocated) - parseFloat(item.quantity_sold || 0) - parseFloat(item.quantity_returned || 0)
              return (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{item.product_name}</td>
                  <td className="px-6 py-4 text-sm text-blue-600 font-mono">{item.batch_number}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {item.packaging_type || '-'} {item.package_size ? `(${item.package_size})` : ''}
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                    {parseFloat(item.quantity_allocated).toFixed(1)} {item.unit}
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-green-600">
                    {parseFloat(item.quantity_sold || 0).toFixed(1)}
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-red-600">
                    {parseFloat(item.quantity_returned || 0).toFixed(1)}
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-yellow-600">
                    {remaining.toFixed(1)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Sales History */}
      {sales.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Delivery Sales History</h2>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shop</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qty Sold</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price/Unit</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sales.map((sale: any) => {
                const shopName = sale.delivery?.shops?.name || 'Unknown'
                return (
                  <tr key={sale.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{shopName}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{sale.product_name}</td>
                    <td className="px-6 py-4 text-sm text-blue-600 font-mono">{sale.batch_number}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {parseFloat(sale.quantity_sold).toFixed(1)} {sale.unit}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {parseFloat(sale.price_per_unit || 0).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-green-600">
                      {parseFloat(sale.total_amount || 0).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {(sale.created_at?.toDate?.() ?? new Date(sale.created_at)).toLocaleString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Timeline */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Timeline</h2>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-3 h-3 rounded-full bg-blue-500 mt-1.5"></div>
            <div>
              <p className="text-sm font-medium text-gray-900">Dispatch Created</p>
              <p className="text-xs text-gray-500">{(allocation.created_at?.toDate?.() ?? new Date(allocation.created_at)).toLocaleString()}</p>
            </div>
          </div>
          {allocation.picked_up_at && (
            <div className="flex items-start gap-3">
              <div className="w-3 h-3 rounded-full bg-green-500 mt-1.5"></div>
              <div>
                <p className="text-sm font-medium text-gray-900">Stock Picked Up by Agent</p>
                <p className="text-xs text-gray-500">{new Date(allocation.picked_up_at).toLocaleString()}</p>
              </div>
            </div>
          )}
          {allocation.in_delivery_at && (
            <div className="flex items-start gap-3">
              <div className="w-3 h-3 rounded-full bg-purple-500 mt-1.5"></div>
              <div>
                <p className="text-sm font-medium text-gray-900">Delivery Started</p>
                <p className="text-xs text-gray-500">{new Date(allocation.in_delivery_at).toLocaleString()}</p>
              </div>
            </div>
          )}
          {allocation.completed_at && (
            <div className="flex items-start gap-3">
              <div className="w-3 h-3 rounded-full bg-emerald-500 mt-1.5"></div>
              <div>
                <p className="text-sm font-medium text-gray-900">Delivery Completed</p>
                <p className="text-xs text-gray-500">{new Date(allocation.completed_at).toLocaleString()}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
