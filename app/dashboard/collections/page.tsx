'use client'

import { db } from '@/lib/firebase/client'
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  doc,
  deleteDoc,
  updateDoc,
} from 'firebase/firestore'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CollectionsPage() {
  const router = useRouter()
  const [collections, setCollections] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    loadCollections()
  }, [])

  const loadCollections = async () => {
    const q = query(
      collection(db, 'milk_collections'),
      orderBy('created_at', 'desc'),
      limit(50)
    )
    const snap = await getDocs(q)

    const data = await Promise.all(
      snap.docs.map(async (d) => {
        const item: any = { id: d.id, ...d.data() }

        if (item.supplier_id) {
          const supplierSnap = await getDocs(
            query(collection(db, 'suppliers'), where('__name__', '==', item.supplier_id), limit(1))
          )
          if (!supplierSnap.empty) {
            item.suppliers = supplierSnap.docs[0].data()
          }
        }

        if (item.operator_user_id) {
          const userSnap = await getDocs(
            query(collection(db, 'app_users'), where('__name__', '==', item.operator_user_id), limit(1))
          )
          if (!userSnap.empty) {
            item.app_users = userSnap.docs[0].data()
          }
        }

        return item
      })
    )

    setCollections(data)
    setLoading(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this collection?')) return

    setDeleting(id)
    try {
      // First delete from pool_collections if it references this collection
      const poolSnap = await getDocs(
        query(collection(db, 'pool_collections'), where('collection_id', '==', id))
      )
      await Promise.all(poolSnap.docs.map((d) => deleteDoc(doc(db, 'pool_collections', d.id))))

      // Then delete the collection
      await deleteDoc(doc(db, 'milk_collections', id))
      setCollections(collections.filter((c) => c.id !== id))
    } catch (err: any) {
      alert('Failed to delete: ' + err.message)
    } finally {
      setDeleting(null)
    }
  }

  const handleApprove = async (id: string) => {
    try {
      await updateDoc(doc(db, 'milk_collections', id), { qc_status: 'approved' })
      setCollections(collections.map((c) => (c.id === id ? { ...c, qc_status: 'approved' } : c)))
    } catch (err: any) {
      alert('Failed to approve: ' + err.message)
    }
  }

  const handleReject = async (id: string) => {
    if (!confirm('Reject this collection?')) return
    try {
      await updateDoc(doc(db, 'milk_collections', id), { qc_status: 'rejected' })
      setCollections(collections.map((c) => (c.id === id ? { ...c, qc_status: 'rejected' } : c)))
    } catch (err: any) {
      alert('Failed to reject: ' + err.message)
    }
  }

  if (loading) return <div className="text-center py-12">Loading...</div>

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Milk Collections</h1>
          <p className="text-gray-600 mt-1">Record and approve milk collections from suppliers</p>
        </div>
        <Link
          href="/dashboard/collections/create"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
        >
          + New Collection
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Total Today</div>
          <div className="text-2xl font-bold text-blue-600">
            {collections?.filter(c => new Date(c.created_at).toDateString() === new Date().toDateString()).length || 0}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Pending QC</div>
          <div className="text-2xl font-bold text-yellow-600">
            {collections?.filter(c => c.qc_status === 'pending').length || 0}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Approved</div>
          <div className="text-2xl font-bold text-green-600">
            {collections?.filter(c => c.qc_status === 'approved').length || 0}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Total Liters</div>
          <div className="text-2xl font-bold text-gray-900">
            {collections?.reduce((sum, c) => sum + parseFloat(c.qty_liters || 0), 0).toFixed(2) || 0}L
          </div>
        </div>
      </div>

      {/* Collections Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date/Time</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fat %</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SNF %</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Operator</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">QC Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {collections && collections.length > 0 ? (
              collections.map((collection: any) => (
                <tr key={collection.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(collection.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                    {collection.suppliers?.name || 'Unknown'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {collection.qty_liters}L
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {collection.fat || 'N/A'}%
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {collection.snf || 'N/A'}%
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {collection.app_users?.name || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      collection.qc_status === 'approved' ? 'bg-green-100 text-green-800' :
                      collection.qc_status === 'rejected' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {collection.qc_status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      collection.status === 'used_in_batch' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {collection.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <div className="flex justify-end gap-2">
                      {collection.qc_status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleApprove(collection.id)}
                            className="text-green-600 hover:text-green-900 font-medium"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleReject(collection.id)}
                            className="text-yellow-600 hover:text-yellow-900 font-medium"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      <Link
                        href={`/dashboard/collections/${collection.id}`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => handleDelete(collection.id)}
                        disabled={deleting === collection.id}
                        className="text-red-600 hover:text-red-900 disabled:opacity-50"
                      >
                        {deleting === collection.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="px-6 py-4 text-center text-gray-500">
                  No collections found. Record your first collection.
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
