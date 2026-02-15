'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ProductionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const supabase = createClient()
  const { id } = use(params)
  
  const [production, setProduction] = useState<any>(null)
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
    { packaging_type: '', package_size: '', number_of_packages: '', unit: 'pieces' }
  ])

  useEffect(() => {
    loadData()
  }, [id])

  const loadData = async () => {
    setLoading(true)
    
    // Load production - simple query first
    const { data: prodData, error: prodError } = await supabase
      .from('production')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    
    console.log('Production query result:', { data: prodData, error: prodError ? JSON.stringify(prodError) : null, id })
    
    if (prodError) {
      console.error('Production load error:', JSON.stringify(prodError))
      setError(prodError.message || 'Failed to load production')
    }
    
    setProduction(prodData)
    
    if (!prodData) {
      setLoading(false)
      return
    }
    
    // Load processing batch
    const { data: batchData } = await supabase
      .from('processing_batches')
      .select('*')
      .eq('production_id', id)
      .maybeSingle()
    
    setBatch(batchData)
    
    // Load final products
    if (batchData) {
      const { data: fpData } = await supabase
        .from('final_products')
        .select('*')
        .eq('processing_batch_id', batchData.id)
        .order('created_at', { ascending: false })
      
      setFinalProducts(fpData || [])
      
      // Load packaging for all approved products
      if (fpData && fpData.length > 0) {
        const approvedProductIds = fpData.filter((fp: any) => fp.qc_status === 'approved').map((fp: any) => fp.id)
        if (approvedProductIds.length > 0) {
          const { data: packData } = await supabase
            .from('packaging')
            .select('*')
            .in('final_product_id', approvedProductIds)
          
          setPackaging(packData || [])
        }
      }
    }
    
    // Load raw materials
    const { data: materialsData } = await supabase
      .from('production_raw_materials')
      .select('*, raw_materials(name)')
      .eq('production_id', id)
    
    setRawMaterials(materialsData || [])
    
    setLoading(false)
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
      const { data: { user } } = await supabase.auth.getUser()
      const { data: appUser } = await supabase
        .from('app_users')
        .select('id')
        .eq('auth_uid', user?.id)
        .single()
      
      // Update batch status
      await supabase
        .from('processing_batches')
        .update({ status: 'completed' })
        .eq('id', batch.id)
      
      // Create all final products
      const insertRows = productEntries.map(entry => ({
        processing_batch_id: batch.id,
        batch_number: batch.batch_number,
        product_name: entry.product_name.trim(),
        bulk_quantity: parseFloat(entry.bulk_quantity),
        unit: entry.unit,
        qc_status: 'pending'
      }))
      
      const { data: fps, error: fpError } = await supabase
        .from('final_products')
        .insert(insertRows)
        .select()
      
      if (fpError) throw fpError
      
      setFinalProducts(prev => [...prev, ...(fps || [])])
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
      const { data: { user } } = await supabase.auth.getUser()
      const { data: appUser } = await supabase
        .from('app_users')
        .select('id')
        .eq('auth_uid', user?.id)
        .single()
      
      const { error: qcError } = await supabase
        .from('final_products')
        .update({
          qc_status: qcDecision,
          qc_checked_by: appUser?.id,
          qc_checked_at: new Date().toISOString(),
          rejection_reason: qcDecision === 'rejected' ? rejectionReason : null
        })
        .eq('id', selectedProductForQC.id)
      
      if (qcError) {
        console.error('QC update error:', JSON.stringify(qcError))
        throw qcError
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

  const handleAddPackaging = async () => {
    if (!selectedProductForPackaging) {
      setError('No product selected for packaging')
      return
    }
    
    // Validate all packaging entries
    for (let i = 0; i < packagingEntries.length; i++) {
      const entry = packagingEntries[i]
      if (!entry.packaging_type?.trim()) {
        setError(`Package #${i + 1}: Please enter packaging type`)
        return
      }
      if (!entry.package_size?.trim()) {
        setError(`Package #${i + 1}: Please enter package size`)
        return
      }
      if (!entry.number_of_packages || parseInt(entry.number_of_packages) <= 0) {
        setError(`Package #${i + 1}: Please enter valid number of packages`)
        return
      }
    }
    
    setActionLoading(true)
    setError(null)
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: appUser } = await supabase
        .from('app_users')
        .select('id')
        .eq('auth_uid', user?.id)
        .single()
      
      // Create all packaging entries
      const insertRows = packagingEntries.map(entry => ({
        final_product_id: selectedProductForPackaging.id,
        batch_number: batch.batch_number,
        packaging_type: entry.packaging_type.trim(),
        package_size: entry.package_size.trim(),
        number_of_packages: parseInt(entry.number_of_packages),
        unit: entry.unit,
        packaged_quantity_total: parseInt(entry.number_of_packages),
        status: 'completed',
        created_by: appUser?.id
      }))
      
      const { error: packError } = await supabase
        .from('packaging')
        .insert(insertRows)
      
      if (packError) {
        console.error('Packaging insert error:', JSON.stringify(packError))
        throw packError
      }
      
      // Create inventory entries for each package type
      const inventoryRows = packagingEntries.map(entry => ({
        production_id: production.id,
        product_name: selectedProductForPackaging.product_name,
        packaging_type: entry.packaging_type.trim(),
        package_size: entry.package_size.trim(),
        quantity: parseInt(entry.number_of_packages),
        unit: entry.unit,
        batch_number: batch.batch_number
      }))
      
      console.log('Creating inventory entries:', inventoryRows)
      
      const { data: invData, error: invError } = await supabase
        .from('production_inventory')
        .insert(inventoryRows)
        .select()
      
      console.log('Inventory insert result:', { data: invData, error: invError ? JSON.stringify(invError) : null })
      
      if (invError) {
        console.error('Inventory insert error:', JSON.stringify(invError))
        // Don't throw - packaging already saved, just log the error
        setError(`Packaging saved but inventory creation failed: ${invError.message}`)
      } else {
        console.log('Successfully created inventory entries:', invData)
      }
      
      setShowPackagingForm(false)
      setSelectedProductForPackaging(null)
      setPackagingEntries([{ packaging_type: '', package_size: '', number_of_packages: '', unit: 'pieces' }])
      await loadData()
    } catch (err: any) {
      setError(err.message)
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
          <h1 className="text-3xl font-bold text-gray-900">{production.production_code}</h1>
          <p className="text-sm text-gray-600 mt-1">Created by {production.app_users?.name}</p>
        </div>
        <Link
          href="/dashboard/production"
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
        >
          Back to List
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
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
                {packaging.filter(p => p.final_product_id === fp.id).length > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="text-sm font-medium text-gray-700 mb-2">Packaging:</div>
                    <div className="flex flex-wrap gap-2">
                      {packaging.filter(p => p.final_product_id === fp.id).map(pack => (
                        <span key={pack.id} className="px-2 py-1 bg-gray-100 rounded text-sm">
                          {pack.number_of_packages}x {pack.package_size} ({pack.packaging_type})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
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
            <p className="text-sm text-gray-600 mb-4">
              Bulk Quantity: {selectedProductForPackaging.bulk_quantity} {selectedProductForPackaging.unit}
            </p>
            
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
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Packaging Type <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={entry.packaging_type}
                          onChange={(e) => {
                            const updated = [...packagingEntries]
                            updated[index] = { ...updated[index], packaging_type: e.target.value }
                            setPackagingEntries(updated)
                          }}
                          placeholder="e.g., Bottle, Pouch, Cup"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Package Size <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={entry.package_size}
                          onChange={(e) => {
                            const updated = [...packagingEntries]
                            updated[index] = { ...updated[index], package_size: e.target.value }
                            setPackagingEntries(updated)
                          }}
                          placeholder="e.g., 20ml, 500ml, 1L"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Number of Packages <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          value={entry.number_of_packages}
                          onChange={(e) => {
                            const updated = [...packagingEntries]
                            updated[index] = { ...updated[index], number_of_packages: e.target.value }
                            setPackagingEntries(updated)
                          }}
                          placeholder="e.g., 100"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                        <select
                          value={entry.unit}
                          onChange={(e) => {
                            const updated = [...packagingEntries]
                            updated[index] = { ...updated[index], unit: e.target.value }
                            setPackagingEntries(updated)
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="pieces">Pieces</option>
                          <option value="boxes">Boxes</option>
                          <option value="packs">Packs</option>
                          <option value="bags">Bags</option>
                          <option value="containers">Containers</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Add another package type button */}
              <button
                type="button"
                onClick={() => setPackagingEntries(prev => [...prev, { packaging_type: '', package_size: '', number_of_packages: '', unit: 'pieces' }])}
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
                    setPackagingEntries([{ packaging_type: '', package_size: '', number_of_packages: '', unit: 'pieces' }])
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
