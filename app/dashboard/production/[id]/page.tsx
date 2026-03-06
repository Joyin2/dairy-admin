'use client'

import { useState, useEffect, use } from 'react'
import { db, auth } from '@/lib/firebase/client'
import { collection, query, where, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isProductionEnvironment, logProductionOnlySkip, getAppEnvironment } from '@/lib/environment'

export default function ProductionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { id } = use(params)

  const [production, setProduction] = useState<any>(null)
  const [creatorName, setCreatorName] = useState<string | null>(null)
  const [batch, setBatch] = useState<any>(null)
  const [finalProducts, setFinalProducts] = useState<any[]>([])
  const [packaging, setPackaging] = useState<any[]>([])
  const [rawMaterials, setRawMaterials] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedProductForQC, setSelectedProductForQC] = useState<any>(null)
  const [selectedProductForPackaging, setSelectedProductForPackaging] = useState<any>(null)

  // QC Modal
  const [showQCModal, setShowQCModal] = useState(false)
  const [qcDecision, setQCDecision] = useState<'approved' | 'rejected'>('approved')
  const [rejectionReason, setRejectionReason] = useState('')

  // Final Product Form
  const [showFinalProductForm, setShowFinalProductForm] = useState(false)
  const [productEntries, setProductEntries] = useState([
    { product_name: '', bulk_quantity: '', unit: 'L' }
  ])

  // Packaging Form
  const [showPackagingForm, setShowPackagingForm] = useState(false)
  const [packagingEntries, setPackagingEntries] = useState([
    { packaging_type: '', packaging_type_other: '', size_value: '', size_unit: 'kg', number_of_packages: '', unit: 'pieces' }
  ])

  // Resume / Cancel (for draft productions)
  const [showResumeForm, setShowResumeForm] = useState(false)
  const [resumeRawMaterials, setResumeRawMaterials] = useState<{ id: string; material_id: string; quantity: string; unit: string }[]>([
    { id: '1', material_id: '', quantity: '', unit: '' }
  ])
  const [resumeProcessingData, setResumeProcessingData] = useState({
    product_type: '',
    temperature: '',
    processing_time: '',
    culture_details: '',
    final_fat_percent: '',
    final_snf_percent: ''
  })
  const [availableMaterials, setAvailableMaterials] = useState<any[]>([])

  useEffect(() => {
    loadData()
  }, [id])

  const loadAvailableMaterials = async () => {
    const snap = await getDocs(
      query(collection(db, 'raw_materials'), where('is_active', '==', true))
    )
    const materials = snap.docs.map(d => ({ id: d.id, ...d.data() } as any)).sort((a: any, b: any) => a.name.localeCompare(b.name))
    setAvailableMaterials(materials)
  }

  const loadData = async () => {
    setLoading(true)

    // Load production document
    const prodDoc = await getDoc(doc(db, 'production', id))

    if (!prodDoc.exists()) {
      console.log('Production not found for id:', id)
      setProduction(null)
      setLoading(false)
      return
    }

    const prodData = { id: prodDoc.id, ...prodDoc.data() } as any
    setProduction(prodData)

    // Load creator name from app_users
    if (prodData.created_by) {
      try {
        const creatorDoc = await getDoc(doc(db, 'app_users', prodData.created_by))
        if (creatorDoc.exists()) {
          setCreatorName((creatorDoc.data() as any).name || null)
        }
      } catch {
        // ignore
      }
    }

    // Load processing batch
    const batchSnap = await getDocs(
      query(collection(db, 'processing_batches'), where('production_id', '==', id))
    )
    const batchData = batchSnap.empty ? null : { id: batchSnap.docs[0].id, ...batchSnap.docs[0].data() } as any
    setBatch(batchData)

    // Load final products
    if (batchData) {
      const fpSnap = await getDocs(
        query(collection(db, 'final_products'), where('processing_batch_id', '==', batchData.id))
      )
      const fpData = fpSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setFinalProducts(fpData)

      // Load packaging for approved products
      if (fpData.length > 0) {
        const approvedProductIds = fpData
          .filter((fp: any) => fp.qc_status === 'approved')
          .map((fp: any) => fp.id)
        if (approvedProductIds.length > 0) {
          const packSnaps = await Promise.all(
            approvedProductIds.map((fpId: string) =>
              getDocs(query(collection(db, 'packaging'), where('final_product_id', '==', fpId)))
            )
          )
          const allPacks = packSnaps.flatMap(snap =>
            snap.docs.map(d => ({ id: d.id, ...d.data() }))
          )
          setPackaging(allPacks)
        }
      }
    }

    // Load raw materials with material names
    const materialsSnap = await getDocs(
      query(collection(db, 'production_raw_materials'), where('production_id', '==', id))
    )
    const materialsRaw = materialsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    // Fetch raw material names
    const enrichedMaterials = await Promise.all(
      materialsRaw.map(async (m: any) => {
        if (m.material_id) {
          try {
            const matDoc = await getDoc(doc(db, 'raw_materials', m.material_id))
            if (matDoc.exists()) {
              return { ...m, raw_materials: { name: (matDoc.data() as any).name } }
            }
          } catch {
            // ignore
          }
        }
        return { ...m, raw_materials: null }
      })
    )
    setRawMaterials(enrichedMaterials)

    setLoading(false)
  }

  const getAppUserId = async (): Promise<string | null> => {
    const user = auth.currentUser
    if (!user) return null
    const q = query(collection(db, 'app_users'), where('auth_uid', '==', user.uid))
    const snap = await getDocs(q)
    return snap.empty ? null : snap.docs[0].id
  }

  const handleCompleteBatch = async () => {
    // Validate all product entries
    for (let i = 0; i < productEntries.length; i++) {
      const entry = productEntries[i]
      if (!entry.product_name?.trim()) {
        setError(`Product #${i + 1}: Please enter product name`)
        return
      }
      if (!entry.bulk_quantity || parseFloat(entry.bulk_quantity) <= 0) {
        setError(`Product #${i + 1} (${entry.product_name}): Please enter valid quantity`)
        return
      }
    }

    setActionLoading(true)
    setError(null)

    try {
      const appUserId = await getAppUserId()

      // Update batch status
      await updateDoc(doc(db, 'processing_batches', batch.id), {
        status: 'completed',
        updated_at: new Date().toISOString(),
      })

      // Create all final products
      const createdProducts: any[] = []
      for (const entry of productEntries) {
        const fpRef = await addDoc(collection(db, 'final_products'), {
          processing_batch_id: batch.id,
          batch_number: batch.batch_number,
          product_name: entry.product_name.trim(),
          bulk_quantity: parseFloat(entry.bulk_quantity),
          unit: entry.unit,
          qc_status: 'pending',
          created_by: appUserId,
          created_at: new Date().toISOString(),
        })
        createdProducts.push({
          id: fpRef.id,
          processing_batch_id: batch.id,
          batch_number: batch.batch_number,
          product_name: entry.product_name.trim(),
          bulk_quantity: parseFloat(entry.bulk_quantity),
          unit: entry.unit,
          qc_status: 'pending',
          created_by: appUserId,
          created_at: new Date().toISOString(),
        })
      }

      // Log production event
      if (isProductionEnvironment()) {
        console.log(`[Production Event] Batch ${batch.batch_number} completed with ${productEntries.length} product(s). Push notification will be sent.`)
      } else {
        logProductionOnlySkip(`Batch completion notification for ${batch.batch_number}`)
      }

      setFinalProducts(prev => [...prev, ...createdProducts])
      setShowFinalProductForm(false)
      setProductEntries([{ product_name: '', bulk_quantity: '', unit: 'L' }])
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleQCSubmit = async () => {
    if (!selectedProductForQC) {
      setError('No product selected for QC')
      return
    }
    if (qcDecision === 'rejected' && !rejectionReason.trim()) {
      setError('Please provide rejection reason')
      return
    }

    setActionLoading(true)
    setError(null)

    try {
      const appUserId = await getAppUserId()

      await updateDoc(doc(db, 'final_products', selectedProductForQC.id), {
        qc_status: qcDecision,
        qc_checked_by: appUserId,
        qc_checked_at: new Date().toISOString(),
        rejection_reason: qcDecision === 'rejected' ? rejectionReason : null,
      })

      // Log QC event
      if (isProductionEnvironment()) {
        console.log(`[QC Event] Product "${selectedProductForQC.product_name}" ${qcDecision}. Push notification will be sent.`)
      } else {
        logProductionOnlySkip(`QC ${qcDecision} notification for ${selectedProductForQC.product_name}`)
      }

      setShowQCModal(false)
      setSelectedProductForQC(null)
      setQCDecision('approved')
      setRejectionReason('')
      await loadData()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  const convertToUnit = (value: number, fromUnit: string, toUnit: string): number => {
    if (fromUnit === toUnit) return value
    const table: Record<string, Record<string, number>> = {
      'L':  { 'mL': 0.001 },
      'mL': { 'L': 1000 },
      'kg': { 'g': 0.001 },
      'g':  { 'kg': 1000 },
    }
    return value * (table[toUnit]?.[fromUnit] ?? 1)
  }

  const parsePackageSize = (packageSize: string): { value: number; unit: string } => {
    const match = packageSize.match(/^([\d.]+)(.+)$/)
    if (!match) return { value: 0, unit: '' }
    return { value: parseFloat(match[1]), unit: match[2] }
  }

  const getSizeUnits = (bulkUnit: string): string[] => {
    if (bulkUnit === 'L' || bulkUnit === 'mL') return ['mL', 'L']
    if (bulkUnit === 'kg' || bulkUnit === 'g') return ['g', 'kg']
    return [bulkUnit || 'pieces']
  }

  const handleAddPackaging = async () => {
    if (!selectedProductForPackaging) {
      setError('No product selected for packaging')
      return
    }

    // Validate all packaging entries
    for (let i = 0; i < packagingEntries.length; i++) {
      const entry = packagingEntries[i]
      const resolvedType = entry.packaging_type === 'other' ? entry.packaging_type_other.trim() : entry.packaging_type.trim()
      if (!resolvedType) {
        setError(`Package #${i + 1}: Please enter packaging type`)
        return
      }
      if (!entry.size_value || parseFloat(entry.size_value) <= 0) {
        setError(`Package #${i + 1}: Please enter a valid package size`)
        return
      }
      if (!entry.number_of_packages || parseInt(entry.number_of_packages) <= 0) {
        setError(`Package #${i + 1}: Please enter valid number of packages`)
        return
      }
    }

    // Validate total packaged quantity doesn't exceed bulk
    const bulkQty = parseFloat(selectedProductForPackaging.bulk_quantity) || 0
    const bulkUnit = selectedProductForPackaging.unit || ''
    const alreadyPackaged = packaging
      .filter(p => p.final_product_id === selectedProductForPackaging.id)
      .reduce((sum, pack) => {
        const { value, unit } = parsePackageSize(pack.package_size)
        return sum + convertToUnit(value, unit, bulkUnit) * (pack.number_of_packages || 0)
      }, 0)
    const newUsed = packagingEntries.reduce((sum, e) => {
      const sv = parseFloat(e.size_value) || 0
      const np = parseInt(e.number_of_packages) || 0
      return sum + convertToUnit(sv, e.size_unit, bulkUnit) * np
    }, 0)
    const totalUsed = alreadyPackaged + newUsed
    if (totalUsed > bulkQty + 0.0001) {
      setError(`Total packaged quantity (${totalUsed.toFixed(3)} ${bulkUnit}) exceeds bulk quantity (${bulkQty} ${bulkUnit})`)
      return
    }

    setActionLoading(true)
    setError(null)

    try {
      const appUserId = await getAppUserId()

      // Create all packaging entries
      for (const entry of packagingEntries) {
        const packageSize = `${entry.size_value}${entry.size_unit}`
        const resolvedPackagingType = entry.packaging_type === 'other' ? entry.packaging_type_other.trim() : entry.packaging_type.trim()
        await addDoc(collection(db, 'packaging'), {
          final_product_id: selectedProductForPackaging.id,
          batch_number: batch.batch_number,
          packaging_type: resolvedPackagingType,
          package_size: packageSize,
          number_of_packages: parseInt(entry.number_of_packages),
          unit: entry.unit,
          packaged_quantity_total: parseInt(entry.number_of_packages),
          status: 'completed',
          created_by: appUserId,
          created_at: new Date().toISOString(),
        })
      }

      // Create inventory entries for each package type
      let invError: string | null = null
      for (const entry of packagingEntries) {
        try {
          const resolvedPackagingType2 = entry.packaging_type === 'other' ? entry.packaging_type_other.trim() : entry.packaging_type.trim()
          await addDoc(collection(db, 'production_inventory'), {
            production_id: production.id,
            product_name: selectedProductForPackaging.product_name,
            packaging_type: resolvedPackagingType2,
            package_size: `${entry.size_value}${entry.size_unit}`,
            quantity: parseInt(entry.number_of_packages),
            unit: entry.unit,
            batch_number: batch.batch_number,
            created_at: new Date().toISOString(),
          })
        } catch (err: any) {
          console.error('Inventory insert error:', err)
          invError = err.message
        }
      }

      if (invError) {
        setError(`Packaging saved but inventory creation failed: ${invError}`)
      } else {
        // Log packaging event
        if (isProductionEnvironment()) {
          console.log(`[Packaging Event] ${packagingEntries.length} package type(s) created for ${selectedProductForPackaging.product_name}. Push notification will be sent.`)
        } else {
          logProductionOnlySkip(`Packaging completion notification for ${selectedProductForPackaging.product_name}`)
        }
      }

      setShowPackagingForm(false)
      setSelectedProductForPackaging(null)
      setPackagingEntries([{ packaging_type: '', packaging_type_other: '', size_value: '', size_unit: 'kg', number_of_packages: '', unit: 'pieces' }])
      await loadData()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  const isDraftIncomplete = production?.status === 'draft' && !batch

  const handleCancelProduction = async () => {
    if (!production || production.status !== 'draft') return
    if (!confirm('Cancel this production? Milk will be returned to the pool and any reserved raw materials will be released.')) return

    setActionLoading(true)
    setError(null)
    try {
      // Restore milk to pool
      const milkUsageSnap = await getDoc(doc(db, 'milk_usage_log', production.milk_usage_log_id))
      if (milkUsageSnap.exists()) {
        const milkData = milkUsageSnap.data() as any
        const poolDoc = await getDoc(doc(db, 'milk_pool', production.milk_pool_id))
        if (poolDoc.exists()) {
          const p = poolDoc.data() as any
          await updateDoc(doc(db, 'milk_pool', production.milk_pool_id), {
            remaining_milk_liters: (p.remaining_milk_liters ?? 0) + (milkData.used_liters ?? 0),
            remaining_fat_units: (p.remaining_fat_units ?? 0) + (milkData.used_fat_units ?? 0),
            remaining_snf_units: (p.remaining_snf_units ?? 0) + (milkData.used_snf_units ?? 0),
            updated_at: new Date().toISOString(),
          })
        }
        await deleteDoc(doc(db, 'milk_usage_log', production.milk_usage_log_id))
      }

      // Delete production_raw_materials and restore stock
      const prmSnap = await getDocs(
        query(collection(db, 'production_raw_materials'), where('production_id', '==', id))
      )
      for (const d of prmSnap.docs) {
        const data = d.data() as any
        const matDoc = await getDoc(doc(db, 'raw_materials', data.material_id))
        if (matDoc.exists()) {
          const mat = matDoc.data() as any
          const current = parseFloat(mat.current_stock ?? 0)
          await updateDoc(doc(db, 'raw_materials', data.material_id), {
            current_stock: current + (data.quantity_used ?? 0),
            updated_at: new Date().toISOString(),
          })
        }
        await deleteDoc(doc(db, 'production_raw_materials', d.id))
      }

      // Delete processing batches
      const batchSnap = await getDocs(
        query(collection(db, 'processing_batches'), where('production_id', '==', id))
      )
      for (const d of batchSnap.docs) {
        await deleteDoc(doc(db, 'processing_batches', d.id))
      }

      await deleteDoc(doc(db, 'production', id))
      router.push('/dashboard/production')
    } catch (err: any) {
      setError(err.message || 'Failed to cancel production')
    } finally {
      setActionLoading(false)
    }
  }

  const handleResumeProduction = async () => {
    const validMaterials = resumeRawMaterials.filter(m => m.material_id && parseFloat(m.quantity) > 0)
    if (rawMaterials.length === 0 && validMaterials.length === 0) {
      setError('Please add at least one raw material')
      return
    }
    if (!resumeProcessingData.product_type.trim()) {
      setError('Please enter product type')
      return
    }

    setActionLoading(true)
    setError(null)
    try {
      const appUserId = await getAppUserId()
      const materialsToAdd = rawMaterials.length > 0 ? [] : validMaterials

      if (materialsToAdd.length > 0) {
        const materialsSnap = await getDocs(
          query(collection(db, 'raw_materials'), where('is_active', '==', true))
        )
        const latestMaterials = Object.fromEntries(
          materialsSnap.docs.map(d => [d.id, { ...d.data(), id: d.id } as any])
        )

        const shortages: { name: string; available: number; required: number; unit: string }[] = []
        for (const m of materialsToAdd) {
          const mat = latestMaterials[m.material_id]
          const required = parseFloat(m.quantity)
          const available = parseFloat(mat?.current_stock ?? 0)
          if (available < required) {
            shortages.push({
              name: mat?.name ?? 'Unknown',
              available,
              required,
              unit: m.unit || (mat?.unit ?? ''),
            })
          }
        }
        if (shortages.length > 0) {
          const list = shortages.map(s => `• ${s.name}: available ${s.available} ${s.unit}, required ${s.required} ${s.unit}`).join('\n')
          setError(`Insufficient raw material:\n${list}`)
          setActionLoading(false)
          return
        }

        for (const m of materialsToAdd) {
          const qty = parseFloat(m.quantity)
          await addDoc(collection(db, 'production_raw_materials'), {
            production_id: id,
            material_id: m.material_id,
            quantity_used: qty,
            unit: m.unit,
            consumed_by: appUserId,
            created_at: new Date().toISOString(),
          })
          const matDoc = await getDoc(doc(db, 'raw_materials', m.material_id))
          if (matDoc.exists()) {
            const mat = matDoc.data() as any
            const current = parseFloat(mat.current_stock ?? 0)
            await updateDoc(doc(db, 'raw_materials', m.material_id), {
              current_stock: current - qty,
              updated_at: new Date().toISOString(),
            })
          }
        }
      }

      const productPrefix = resumeProcessingData.product_type.substring(0, 4).toUpperCase()
      const now = new Date()
      const dateStr = now.getFullYear().toString() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0')
      const batchNumber = `${productPrefix}-${dateStr}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`

      await addDoc(collection(db, 'processing_batches'), {
        production_id: id,
        batch_number: batchNumber,
        product_type: resumeProcessingData.product_type,
        input_milk_liters: production.milk_used_liters,
        input_fat_percent: production.milk_used_fat_percent,
        input_snf_percent: production.milk_used_snf_percent,
        final_fat_percent: resumeProcessingData.final_fat_percent ? parseFloat(resumeProcessingData.final_fat_percent) : null,
        final_snf_percent: resumeProcessingData.final_snf_percent ? parseFloat(resumeProcessingData.final_snf_percent) : null,
        temperature: resumeProcessingData.temperature,
        processing_time: resumeProcessingData.processing_time,
        culture_details: resumeProcessingData.culture_details,
        status: 'processing',
        created_by: appUserId,
        created_at: new Date().toISOString(),
      })

      await updateDoc(doc(db, 'production', id), {
        status: 'ready',
        updated_at: new Date().toISOString(),
      })

      setShowResumeForm(false)
      await loadData()
    } catch (err: any) {
      setError(err.message || 'Failed to resume production')
    } finally {
      setActionLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      ready: 'bg-blue-100 text-blue-800',
      processing: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
      pending: 'bg-orange-100 text-orange-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    }
    return colors[status] || colors.draft
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading...</div>
  }

  if (!production) {
    return (
      <div className="p-8 text-center">
        <div className="text-red-500 text-lg mb-4">Production not found</div>
        <p className="text-gray-600 mb-4">ID: {id}</p>
        <Link href="/dashboard/production" className="text-blue-600 hover:underline">
          ← Back to Production List
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-900">{production.production_code}</h1>
            {!isProductionEnvironment() && (
              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300">
                {getAppEnvironment().toUpperCase()} - Notifications Off
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-1">Created by {creatorName}</p>
        </div>
        <Link
          href="/dashboard/production"
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
        >
          Back to List
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg whitespace-pre-line">
          {error}
        </div>
      )}

      {/* Draft Incomplete - Resume or Cancel */}
      {isDraftIncomplete && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
          <h2 className="text-lg font-bold text-amber-900 mb-2">Production Incomplete</h2>
          <p className="text-sm text-amber-800 mb-4">
            This production was started but could not be completed (e.g. insufficient raw material). Refill raw materials, then resume with the same ID, or cancel to release milk and materials.
          </p>
          {!showResumeForm ? (
            <div className="flex gap-3">
              <button
                onClick={async () => { await loadAvailableMaterials(); setShowResumeForm(true) }}
                disabled={actionLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Resume Production
              </button>
              <button
                onClick={handleCancelProduction}
                disabled={actionLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Cancel & Release Resources
              </button>
            </div>
          ) : (
            <div className="space-y-4 pt-4 border-t border-amber-200">
              <h3 className="font-semibold text-amber-900">Resume: Add Raw Materials & Processing Details</h3>
              {rawMaterials.length === 0 ? (
                <>
                  <div className="space-y-3">
                    {resumeRawMaterials.map((m, idx) => (
                      <div key={m.id} className="flex gap-3 items-end">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Material</label>
                          <select
                            value={m.material_id}
                            onChange={(e) => {
                              const up = [...resumeRawMaterials]
                              up[idx] = { ...up[idx], material_id: e.target.value }
                              const mat = availableMaterials.find(a => a.id === e.target.value)
                              if (mat) up[idx].unit = mat.unit || ''
                              setResumeRawMaterials(up)
                            }}
                            className="w-full px-3 py-2 border rounded-lg"
                          >
                            <option value="">Select</option>
                            {availableMaterials.map(mat => (
                              <option key={mat.id} value={mat.id}>{mat.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="w-28">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Qty</label>
                          <input
                            type="number"
                            step="0.001"
                            value={m.quantity}
                            onChange={(e) => {
                              const up = [...resumeRawMaterials]
                              up[idx] = { ...up[idx], quantity: e.target.value }
                              setResumeRawMaterials(up)
                            }}
                            className="w-full px-3 py-2 border rounded-lg"
                          />
                        </div>
                        <div className="w-20">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Unit</label>
                          <input
                            value={m.unit}
                            onChange={(e) => {
                              const up = [...resumeRawMaterials]
                              up[idx] = { ...up[idx], unit: e.target.value }
                              setResumeRawMaterials(up)
                            }}
                            className="w-full px-3 py-2 border rounded-lg"
                          />
                        </div>
                        {resumeRawMaterials.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setResumeRawMaterials(prev => prev.filter((_, i) => i !== idx))}
                            className="text-red-600 hover:bg-red-50 px-2 py-2 rounded"
                          >Remove</button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setResumeRawMaterials(prev => [...prev, { id: Date.now().toString(), material_id: '', quantity: '', unit: '' }])}
                      className="text-blue-600 hover:underline text-sm"
                    >+ Add Material</button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-600">Raw materials already added for this production.</p>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Product Type *</label>
                <input
                  value={resumeProcessingData.product_type}
                  onChange={(e) => setResumeProcessingData({ ...resumeProcessingData, product_type: e.target.value })}
                  placeholder="e.g. Curd, Paneer"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Temperature</label>
                  <input
                    value={resumeProcessingData.temperature}
                    onChange={(e) => setResumeProcessingData({ ...resumeProcessingData, temperature: e.target.value })}
                    placeholder="e.g. 42°C"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Processing Time</label>
                  <input
                    value={resumeProcessingData.processing_time}
                    onChange={(e) => setResumeProcessingData({ ...resumeProcessingData, processing_time: e.target.value })}
                    placeholder="e.g. 8 hours"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleResumeProduction}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {actionLoading ? 'Resuming...' : 'Complete Setup'}
                </button>
                <button
                  onClick={() => setShowResumeForm(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Production Info */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Production Details</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <span className="text-sm text-gray-600">Status</span>
            <div className="mt-1">
              <span className={`px-3 py-1 text-xs font-semibold rounded-full ${getStatusBadge(production.status)}`}>
                {production.status}
              </span>
            </div>
          </div>
          <div>
            <span className="text-sm text-gray-600">Milk Used</span>
            <div className="font-semibold text-gray-900">{production.milk_used_liters} L</div>
          </div>
          <div>
            <span className="text-sm text-gray-600">Fat %</span>
            <div className="font-semibold text-gray-900">{production.milk_used_fat_percent?.toFixed(2)}%</div>
          </div>
          <div>
            <span className="text-sm text-gray-600">SNF %</span>
            <div className="font-semibold text-gray-900">{production.milk_used_snf_percent?.toFixed(2)}%</div>
          </div>
        </div>

        {production.notes && (
          <div className="mt-4 pt-4 border-t">
            <span className="text-sm text-gray-600">Notes:</span>
            <p className="text-sm text-gray-900 mt-1">{production.notes}</p>
          </div>
        )}
      </div>

      {/* Raw Materials */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Raw Materials Consumed</h2>
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {rawMaterials.map((material) => (
              <tr key={material.id}>
                <td className="px-4 py-2 text-sm text-gray-900">{material.raw_materials?.name}</td>
                <td className="px-4 py-2 text-sm text-gray-900">{material.quantity_used}</td>
                <td className="px-4 py-2 text-sm text-gray-900">{material.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Processing Batch */}
      {batch && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">Processing Batch</h2>
            <span className={`px-3 py-1 text-xs font-semibold rounded-full ${getStatusBadge(batch.status)}`}>
              {batch.status}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Batch Number:</span>
              <div className="font-bold text-gray-900">{batch.batch_number}</div>
            </div>
            <div>
              <span className="text-gray-600">Product Type:</span>
              <div className="font-bold text-gray-900">{batch.product_type}</div>
            </div>
            <div>
              <span className="text-gray-600">Input Milk:</span>
              <div className="font-bold text-gray-900">{batch.input_milk_liters} L</div>
            </div>
            {batch.temperature && (
              <div>
                <span className="text-gray-600">Temperature:</span>
                <div className="font-bold text-gray-900">{batch.temperature}</div>
              </div>
            )}
            {batch.processing_time && (
              <div>
                <span className="text-gray-600">Processing Time:</span>
                <div className="font-bold text-gray-900">{batch.processing_time}</div>
              </div>
            )}
            {batch.final_fat_percent && (
              <div>
                <span className="text-gray-600">Final Fat:</span>
                <div className="font-bold text-gray-900">{batch.final_fat_percent}%</div>
              </div>
            )}
          </div>

          {batch.status === 'processing' && (
            <div className="mt-6 pt-4 border-t">
              {!showFinalProductForm ? (
                <button
                  onClick={() => setShowFinalProductForm(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Complete Processing
                </button>
              ) : (
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900">Add Products from this Batch</h3>

                  {productEntries.map((entry, index) => (
                    <div key={index} className="relative border border-gray-200 rounded-lg p-4 bg-gray-50">
                      {/* Product number badge */}
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded">
                          Product #{index + 1}
                        </span>
                        {productEntries.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setProductEntries(prev => prev.filter((_, i) => i !== index))
                            }}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full w-7 h-7 flex items-center justify-center text-lg font-bold"
                            title="Remove product"
                          >
                            x
                          </button>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Product Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            placeholder="e.g., Full Cream Milk, Paneer, Butter, Ghee, Yogurt"
                            value={entry.product_name}
                            onChange={(e) => {
                              const updated = [...productEntries]
                              updated[index] = { ...updated[index], product_name: e.target.value }
                              setProductEntries(updated)
                            }}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Bulk Quantity <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              step="0.001"
                              value={entry.bulk_quantity}
                              onChange={(e) => {
                                const updated = [...productEntries]
                                updated[index] = { ...updated[index], bulk_quantity: e.target.value }
                                setProductEntries(updated)
                              }}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                            <select
                              value={entry.unit}
                              onChange={(e) => {
                                const updated = [...productEntries]
                                updated[index] = { ...updated[index], unit: e.target.value }
                                setProductEntries(updated)
                              }}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            >
                              <optgroup label="Volume">
                                <option value="L">Liters (L)</option>
                                <option value="ml">Milliliters (ml)</option>
                              </optgroup>
                              <optgroup label="Weight">
                                <option value="kg">Kilograms (kg)</option>
                                <option value="g">Grams (g)</option>
                                <option value="ton">Tons</option>
                              </optgroup>
                              <optgroup label="Count">
                                <option value="pieces">Pieces</option>
                                <option value="packs">Packs</option>
                                <option value="boxes">Boxes</option>
                                <option value="bags">Bags</option>
                                <option value="containers">Containers</option>
                              </optgroup>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Add another product button */}
                  <button
                    type="button"
                    onClick={() => setProductEntries(prev => [...prev, { product_name: '', bulk_quantity: '', unit: 'L' }])}
                    className="w-full py-3 border-2 border-dashed border-blue-300 rounded-lg text-blue-600 hover:bg-blue-50 hover:border-blue-400 flex items-center justify-center gap-2 font-medium transition-colors"
                  >
                    <span className="text-xl leading-none">+</span> Add Another Product
                  </button>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handleCompleteBatch}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {actionLoading ? 'Saving...' : `Create ${productEntries.length} Product${productEntries.length > 1 ? 's' : ''}`}
                    </button>
                    <button
                      onClick={() => {
                        setShowFinalProductForm(false)
                        setProductEntries([{ product_name: '', bulk_quantity: '', unit: 'L' }])
                      }}
                      className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Final Products List */}
      {finalProducts.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">Final Products ({finalProducts.length})</h2>
          </div>

          <div className="space-y-4">
            {finalProducts.map((fp) => (
              <div key={fp.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-bold text-gray-900">{fp.product_name}</h3>
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(fp.qc_status)}`}>
                        QC: {fp.qc_status}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Quantity:</span>
                        <span className="ml-2 font-medium">{fp.bulk_quantity} {fp.unit}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Batch:</span>
                        <span className="ml-2 font-medium">{fp.batch_number}</span>
                      </div>
                    </div>
                    {fp.qc_status === 'rejected' && fp.rejection_reason && (
                      <div className="mt-2 text-sm text-red-600">
                        Rejection: {fp.rejection_reason}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {fp.qc_status === 'pending' && (
                      <button
                        onClick={() => {
                          setSelectedProductForQC(fp)
                          setShowQCModal(true)
                        }}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        QC Check
                      </button>
                    )}
                    {fp.qc_status === 'approved' && (
                      <button
                        onClick={() => {
                          setSelectedProductForPackaging(fp)
                          setPackagingEntries([{ packaging_type: '', packaging_type_other: '', size_value: '', size_unit: fp.unit || 'kg', number_of_packages: '', unit: 'pieces' }])
                          setShowPackagingForm(true)
                        }}
                        className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        + Package
                      </button>
                    )}
                  </div>
                </div>

                {/* Show packaging for this product */}
                {packaging.filter(p => p.final_product_id === fp.id).length > 0 && (() => {
                  const productPacks = packaging.filter(p => p.final_product_id === fp.id)
                  const bulkQty = parseFloat(fp.bulk_quantity) || 0
                  const bulkUnit = fp.unit || ''
                  const totalPackaged = productPacks.reduce((sum, pack) => {
                    const { value, unit } = parsePackageSize(pack.package_size)
                    return sum + convertToUnit(value, unit, bulkUnit) * (pack.number_of_packages || 0)
                  }, 0)
                  const remaining = bulkQty - totalPackaged
                  const pct = bulkQty > 0 ? Math.min(100, (totalPackaged / bulkQty) * 100) : 0
                  return (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      <div className="text-sm font-medium text-gray-700">Packaging:</div>
                      <div className="flex flex-wrap gap-2">
                        {productPacks.map(pack => (
                          <span key={pack.id} className="px-2 py-1 bg-gray-100 rounded text-sm">
                            {pack.number_of_packages}x {pack.package_size} ({pack.packaging_type})
                          </span>
                        ))}
                      </div>
                      <div className="mt-2">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-500">Packaged: <strong className="text-gray-800">{totalPackaged.toFixed(3)} {bulkUnit}</strong></span>
                          <span className={remaining < 0 ? 'text-red-600 font-semibold' : remaining === 0 ? 'text-green-700 font-semibold' : 'text-orange-600 font-semibold'}>
                            Remaining: <strong>{remaining.toFixed(3)} {bulkUnit}</strong>
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all ${remaining < 0 ? 'bg-red-500' : remaining === 0 ? 'bg-green-500' : 'bg-orange-400'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Packaging Form Modal */}
      {showPackagingForm && selectedProductForPackaging && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              Add Packaging for {selectedProductForPackaging.product_name}
            </h3>
            {(() => {
              const bulkQty = parseFloat(selectedProductForPackaging.bulk_quantity) || 0
              const bulkUnit = selectedProductForPackaging.unit || ''
              const alreadyPackaged = packaging
                .filter(p => p.final_product_id === selectedProductForPackaging.id)
                .reduce((sum, pack) => {
                  const { value, unit } = parsePackageSize(pack.package_size)
                  return sum + convertToUnit(value, unit, bulkUnit) * (pack.number_of_packages || 0)
                }, 0)
              const newUsed = packagingEntries.reduce((sum, e) => {
                const sv = parseFloat(e.size_value) || 0
                const np = parseInt(e.number_of_packages) || 0
                return sum + convertToUnit(sv, e.size_unit, bulkUnit) * np
              }, 0)
              const totalUsed = alreadyPackaged + newUsed
              const remaining = bulkQty - totalUsed
              const pct = bulkQty > 0 ? Math.min(100, (totalUsed / bulkQty) * 100) : 0
              return (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Total: <strong>{bulkQty} {bulkUnit}</strong></span>
                    <span className={remaining < 0 ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                      Used: <strong>{totalUsed.toFixed(3)} {bulkUnit}</strong>
                      {alreadyPackaged > 0 && <span className="text-gray-400 ml-1">({alreadyPackaged.toFixed(3)} existing)</span>}
                      {' · '}
                      <span className={remaining < 0 ? 'text-red-600 font-semibold' : 'text-green-700 font-semibold'}>
                        Remaining: <strong>{remaining.toFixed(3)} {bulkUnit}</strong>
                      </span>
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${remaining < 0 ? 'bg-red-500' : 'bg-green-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })()}

            <div className="space-y-4">
              {packagingEntries.map((entry, index) => (
                <div key={index} className="relative border border-gray-200 rounded-lg p-4 bg-gray-50">
                  {/* Package number badge */}
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-semibold text-purple-700 bg-purple-50 px-2 py-1 rounded">
                      Package Type #{index + 1}
                    </span>
                    {packagingEntries.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setPackagingEntries(prev => prev.filter((_, i) => i !== index))
                        }}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full w-7 h-7 flex items-center justify-center text-lg font-bold"
                        title="Remove package type"
                      >
                        x
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Packaging Type <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={entry.packaging_type}
                        onChange={(e) => {
                          const updated = [...packagingEntries]
                          updated[index] = { ...updated[index], packaging_type: e.target.value }
                          setPackagingEntries(updated)
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="">Select type...</option>
                        {['Pouch', 'Bottle', 'Cup', 'Box', 'Can', 'Jar', 'Sachet', 'Bag', 'Container'].map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                        <option value="other">Other</option>
                      </select>
                      {entry.packaging_type === 'other' && (
                        <input
                          type="text"
                          value={entry.packaging_type_other}
                          onChange={(e) => {
                            const updated = [...packagingEntries]
                            updated[index] = { ...updated[index], packaging_type_other: e.target.value }
                            setPackagingEntries(updated)
                          }}
                          placeholder="Specify packaging type"
                          className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          required
                        />
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Package Size <span className="text-red-500">*</span>
                        </label>
                        <div className="flex gap-1">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={entry.size_value}
                            onChange={(e) => {
                              const updated = [...packagingEntries]
                              updated[index] = { ...updated[index], size_value: e.target.value }
                              setPackagingEntries(updated)
                            }}
                            placeholder="e.g., 500"
                            className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                          <select
                            value={entry.size_unit}
                            onChange={(e) => {
                              const updated = [...packagingEntries]
                              updated[index] = { ...updated[index], size_unit: e.target.value }
                              setPackagingEntries(updated)
                            }}
                            className="w-20 px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                          >
                            {getSizeUnits(selectedProductForPackaging?.unit || '').map(u => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </div>
                        {entry.size_value && entry.number_of_packages && (() => {
                          const sv = parseFloat(entry.size_value) || 0
                          const np = parseInt(entry.number_of_packages) || 0
                          const bulkUnit = selectedProductForPackaging?.unit || ''
                          const used = convertToUnit(sv, entry.size_unit, bulkUnit) * np
                          return (
                            <p className="text-xs text-blue-600 mt-1">
                              = {used.toFixed(3)} {bulkUnit} total
                            </p>
                          )
                        })()}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Number of Packages <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={entry.number_of_packages}
                          onChange={(e) => {
                            const updated = [...packagingEntries]
                            updated[index] = { ...updated[index], number_of_packages: e.target.value }
                            setPackagingEntries(updated)
                          }}
                          placeholder="e.g., 100"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-xs text-gray-400 mt-1">Count of packages</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Add another package type button */}
              <button
                type="button"
                onClick={() => setPackagingEntries(prev => [...prev, { packaging_type: '', packaging_type_other: '', size_value: '', size_unit: selectedProductForPackaging?.unit || 'kg', number_of_packages: '', unit: 'pieces' }])}
                className="w-full py-3 border-2 border-dashed border-purple-300 rounded-lg text-purple-600 hover:bg-purple-50 hover:border-purple-400 flex items-center justify-center gap-2 font-medium transition-colors"
              >
                <span className="text-xl leading-none">+</span> Add Another Package Type
              </button>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleAddPackaging}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {actionLoading ? 'Saving...' : `Add ${packagingEntries.length} Package Type${packagingEntries.length > 1 ? 's' : ''}`}
                </button>
                <button
                  onClick={() => {
                    setShowPackagingForm(false)
                    setSelectedProductForPackaging(null)
                    setPackagingEntries([{ packaging_type: '', packaging_type_other: '', size_value: '', size_unit: 'kg', number_of_packages: '', unit: 'pieces' }])
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QC Modal */}
      {showQCModal && selectedProductForQC && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Quality Control Check</h3>
            <p className="text-sm text-gray-600 mb-4">
              Product: <span className="font-semibold">{selectedProductForQC.product_name}</span> ({selectedProductForQC.bulk_quantity} {selectedProductForQC.unit})
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Decision</label>
                <div className="flex gap-4">
                  <button
                    onClick={() => setQCDecision('approved')}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium ${
                      qcDecision === 'approved'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setQCDecision('rejected')}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium ${
                      qcDecision === 'rejected'
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    Reject
                  </button>
                </div>
              </div>

              {qcDecision === 'rejected' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rejection Reason <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleQCSubmit}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {actionLoading ? 'Submitting...' : 'Submit QC'}
              </button>
              <button
                onClick={() => {
                  setShowQCModal(false)
                  setSelectedProductForQC(null)
                  setQCDecision('approved')
                  setRejectionReason('')
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
