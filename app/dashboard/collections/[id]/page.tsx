'use client'

import { useEffect, useState } from 'react'
import { db } from '@/lib/firebase/client'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { useRouter, useParams } from 'next/navigation'

export default function CollectionDetailPage() {
  const router = useRouter()
  const params = useParams()
  const [collection, setCollection] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    const fetchCollection = async () => {
      try {
        const collectionDoc = await getDoc(doc(db, 'milk_collections', params.id as string))
        if (!collectionDoc.exists()) {
          setFetching(false)
          return
        }
        const data = { id: collectionDoc.id, ...collectionDoc.data() } as any

        // Fetch supplier and operator in parallel
        const [supplierData, operatorData] = await Promise.all([
          data.supplier_id
            ? getDoc(doc(db, 'suppliers', data.supplier_id)).then(d => d.exists() ? d.data() : null)
            : Promise.resolve(null),
          data.operator_id
            ? getDoc(doc(db, 'app_users', data.operator_id)).then(d => d.exists() ? d.data() : null)
            : Promise.resolve(null),
        ])

        setCollection({
          ...data,
          suppliers: supplierData,
          app_users: operatorData,
        })
      } catch (err) {
        console.error('Error fetching collection:', err)
      }
      setFetching(false)
    }
    fetchCollection()
  }, [params.id])

  const handleApprove = async () => {
    setLoading(true)
    try {
      await updateDoc(doc(db, 'milk_collections', params.id as string), {
        qc_status: 'approved',
      })
      router.push('/dashboard/collections')
    } catch (err) {
      console.error('Error approving collection:', err)
    }
    setLoading(false)
  }

  const handleReject = async () => {
    if (!confirm('Reject this collection?')) return
    setLoading(true)
    try {
      await updateDoc(doc(db, 'milk_collections', params.id as string), {
        qc_status: 'rejected',
      })
      router.push('/dashboard/collections')
    } catch (err) {
      console.error('Error rejecting collection:', err)
    }
    setLoading(false)
  }

  if (fetching) return <div className="text-center py-12">Loading...</div>
  if (!collection) return <div className="text-center py-12">Collection not found</div>

  return (
    <div className="max-w-4xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Collection Details</h1>
        <button onClick={() => router.back()} className="text-gray-600 hover:text-gray-900">
          ← Back
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Supplier</label>
            <div className="text-lg font-semibold text-gray-900">
              {collection.suppliers?.name || 'Unknown'}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Operator</label>
            <div className="text-lg font-semibold text-gray-900">
              {collection.app_users?.name || 'N/A'}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Quantity</label>
            <div className="text-lg font-semibold text-gray-900">{collection.qty_liters}L</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Fat %</label>
            <div className="text-lg font-semibold text-gray-900">{collection.fat || 'N/A'}%</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">SNF %</label>
            <div className="text-lg font-semibold text-gray-900">{collection.snf || 'N/A'}%</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Date/Time</label>
            <div className="text-lg font-semibold text-gray-900">
              {collection.created_at?.toDate?.()?.toLocaleString() ?? new Date(collection.created_at).toLocaleString()}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">QC Status</label>
            <span className={`inline-block px-3 py-1 text-sm rounded-full ${
              collection.qc_status === 'approved' ? 'bg-green-100 text-green-800' :
              collection.qc_status === 'rejected' ? 'bg-red-100 text-red-800' :
              'bg-yellow-100 text-yellow-800'
            }`}>
              {collection.qc_status}
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Status</label>
            <span className={`inline-block px-3 py-1 text-sm rounded-full ${
              collection.status === 'used_in_batch' ? 'bg-blue-100 text-blue-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {collection.status}
            </span>
          </div>
        </div>

        {collection.photo_url && (
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">Photo</label>
            <img src={collection.photo_url} alt="Collection" className="max-w-md rounded-lg" />
          </div>
        )}

        {collection.qc_status === 'pending' && (
          <div className="flex gap-4 pt-4 border-t">
            <button
              onClick={handleApprove}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              ✓ Approve
            </button>
            <button
              onClick={handleReject}
              disabled={loading}
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              ✗ Reject
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
