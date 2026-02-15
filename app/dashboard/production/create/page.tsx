'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface RawMaterial {
  id: string
  material_id: string
  quantity: string
  unit: string
  materials?: { name: string; unit: string }
}

export default function CreateProductionPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Step 1: Milk Usage
  const [pool, setPool] = useState<any>(null)
  const [milkData, setMilkData] = useState({
    liters: '',
    fat_percent: '',
    snf_percent: ''
  })
  
  // Step 2: Raw Materials
  const [availableMaterials, setAvailableMaterials] = useState<any[]>([])
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([
    { id: '1', material_id: '', quantity: '', unit: '' }
  ])
  
  // Step 3: Processing Details
  const [processingData, setProcessingData] = useState({
    product_type: '',
    temperature: '',
    processing_time: '',
    culture_details: '',
    final_fat_percent: '',
    final_snf_percent: ''
  })
  
  const [notes, setNotes] = useState('')

  useEffect(() => {
    loadInitialData()
  }, [])

  const loadInitialData = async () => {
    // Load active milk pool
    const { data: poolData } = await supabase
      .from('milk_pool')
      .select('*')
      .eq('status', 'active')
      .single()
    
    if (poolData) {
      setPool(poolData)
      // Pre-fill with current pool averages
      setMilkData(prev => ({
        ...prev,
        fat_percent: poolData.current_avg_fat?.toFixed(2) || '',
        snf_percent: poolData.current_avg_snf?.toFixed(2) || ''
      }))
    }
    
    // Load raw materials
    const { data: materials } = await supabase
      .from('raw_materials')
      .select('id, name, unit')
      .eq('is_active', true)
      .order('name')
    
    setAvailableMaterials(materials || [])
  }

  const validateStep1 = () => {
    const liters = parseFloat(milkData.liters)
    const fatPercent = parseFloat(milkData.fat_percent)
    const snfPercent = parseFloat(milkData.snf_percent)
    
    if (!liters || liters <= 0) {
      setError('Please enter valid liters')
      return false
    }
    
    if (!pool || liters > pool.remaining_milk_liters) {
      setError(`Only ${pool?.remaining_milk_liters || 0}L available in pool`)
      return false
    }
    
    if (!fatPercent || fatPercent <= 0 || fatPercent > 10) {
      setError('Fat % must be between 0 and 10')
      return false
    }
    
    if (!snfPercent || snfPercent <= 0 || snfPercent > 15) {
      setError('SNF % must be between 0 and 15')
      return false
    }
    
    const maxFat = pool.remaining_fat_units / liters
    if (fatPercent > maxFat + 0.1) {
      setError(`Fat % cannot exceed ${maxFat.toFixed(2)}% for ${liters}L`)
      return false
    }
    
    return true
  }

  const validateStep2 = () => {
    const validMaterials = rawMaterials.filter(m => m.material_id && parseFloat(m.quantity) > 0)
    
    if (validMaterials.length === 0) {
      setError('Please add at least one raw material')
      return false
    }
    
    return true
  }

  const validateStep3 = () => {
    if (!processingData.product_type.trim()) {
      setError('Please enter product type')
      return false
    }
    
    return true
  }

  const handleNext = () => {
    setError(null)
    
    if (step === 1 && !validateStep1()) return
    if (step === 2 && !validateStep2()) return
    if (step === 3 && !validateStep3()) return
    
    setStep(step + 1)
  }

  const addRawMaterial = () => {
    setRawMaterials([
      ...rawMaterials,
      { id: Date.now().toString(), material_id: '', quantity: '', unit: '' }
    ])
  }

  const removeRawMaterial = (id: string) => {
    setRawMaterials(rawMaterials.filter(m => m.id !== id))
  }

  const updateRawMaterial = (id: string, field: string, value: string) => {
    setRawMaterials(rawMaterials.map(m => {
      if (m.id === id) {
        const updated = { ...m, [field]: value }
        // Auto-fill unit when material selected
        if (field === 'material_id') {
          const material = availableMaterials.find(mat => mat.id === value)
          if (material?.unit) {
            updated.unit = material.unit
          }
        }
        return updated
      }
      return m
    }))
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: appUser } = await supabase
        .from('app_users')
        .select('id')
        .eq('auth_uid', user?.id)
        .single()

      // Step 1: Create Milk Usage
      const liters = parseFloat(milkData.liters)
      const fatPercent = parseFloat(milkData.fat_percent)
      const snfPercent = parseFloat(milkData.snf_percent)
      const fatUnits = (liters * fatPercent) / 100
      const snfUnits = (liters * snfPercent) / 100

      const newRemainingLiters = pool.remaining_milk_liters - liters
      const newRemainingFatUnits = pool.remaining_fat_units - fatUnits
      const newRemainingSnfUnits = (pool.remaining_snf_units || 0) - snfUnits
      const newAvgFat = newRemainingLiters > 0 ? (newRemainingFatUnits / newRemainingLiters) : 0
      const newAvgSnf = newRemainingLiters > 0 ? (newRemainingSnfUnits / newRemainingLiters) : 0

      const { data: milkUsage, error: usageError } = await supabase
        .from('milk_usage_log')
        .insert({
          milk_pool_id: pool.id,
          used_liters: liters,
          manual_fat_percent: fatPercent,
          manual_snf_percent: snfPercent,
          used_fat_units: fatUnits,
          used_snf_units: snfUnits,
          remaining_liters_after: newRemainingLiters,
          remaining_fat_units_after: newRemainingFatUnits,
          remaining_avg_fat_after: newAvgFat,
          remaining_avg_snf_after: newAvgSnf,
          purpose: `Production - ${processingData.product_type}`
        })
        .select()
        .single()

      if (usageError) throw usageError

      // Update pool
      await supabase
        .from('milk_pool')
        .update({
          remaining_milk_liters: newRemainingLiters,
          remaining_fat_units: newRemainingFatUnits,
          remaining_snf_units: newRemainingSnfUnits,
          current_avg_fat: newAvgFat,
          current_avg_snf: newAvgSnf
        })
        .eq('id', pool.id)

      // Step 2: Create Production
      const { data: productionCodeData } = await supabase.rpc('generate_production_code')
      
      const { data: production, error: prodError } = await supabase
        .from('production')
        .insert({
          production_code: productionCodeData,
          milk_pool_id: pool.id,
          milk_usage_log_id: milkUsage.id,
          milk_used_liters: liters,
          milk_used_fat_percent: fatPercent,
          milk_used_snf_percent: snfPercent,
          milk_used_fat_units: fatUnits,
          milk_used_snf_units: snfUnits,
          status: 'draft',
          notes: notes,
          created_by: appUser?.id
        })
        .select()
        .single()

      if (prodError) throw prodError

      // Step 3: Add Raw Materials
      const validMaterials = rawMaterials.filter(m => m.material_id && parseFloat(m.quantity) > 0)
      
      for (const material of validMaterials) {
        const { error: matError } = await supabase
          .from('production_raw_materials')
          .insert({
            production_id: production.id,
            material_id: material.material_id,
            quantity_used: parseFloat(material.quantity),
            unit: material.unit,
            consumed_by: appUser?.id
          })
        
        if (matError) throw matError
      }

      // Update production status to ready
      await supabase
        .from('production')
        .update({ status: 'ready' })
        .eq('id', production.id)

      // Step 4: Create Processing Batch
      const productPrefix = processingData.product_type.substring(0, 4).toUpperCase()
      const { data: batchNumber } = await supabase.rpc('generate_batch_number', { product_prefix: productPrefix })
      
      const { data: batch, error: batchError } = await supabase
        .from('processing_batches')
        .insert({
          production_id: production.id,
          batch_number: batchNumber,
          product_type: processingData.product_type,
          input_milk_liters: liters,
          input_fat_percent: fatPercent,
          input_snf_percent: snfPercent,
          final_fat_percent: processingData.final_fat_percent ? parseFloat(processingData.final_fat_percent) : null,
          final_snf_percent: processingData.final_snf_percent ? parseFloat(processingData.final_snf_percent) : null,
          temperature: processingData.temperature,
          processing_time: processingData.processing_time,
          culture_details: processingData.culture_details,
          status: 'processing',
          created_by: appUser?.id
        })
        .select()
        .single()

      if (batchError) throw batchError

      router.push(`/dashboard/production/${production.id}`)
    } catch (err: any) {
      setError(err.message || 'Failed to create production')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Create New Production</h1>

      {/* Progress Steps */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {s}
              </div>
              {s < 4 && <div className={`w-24 h-1 ${step > s ? 'bg-blue-600' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-sm">
          <span className={step >= 1 ? 'text-blue-600 font-medium' : 'text-gray-500'}>Milk Usage</span>
          <span className={step >= 2 ? 'text-blue-600 font-medium' : 'text-gray-500'}>Raw Materials</span>
          <span className={step >= 3 ? 'text-blue-600 font-medium' : 'text-gray-500'}>Processing</span>
          <span className={step >= 4 ? 'text-blue-600 font-medium' : 'text-gray-500'}>Review</span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Step 1: Milk Usage */}
      {step === 1 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Step 1: Milk Usage</h2>
          
          {pool && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Available Milk:</span>
                  <span className="font-bold text-blue-900 ml-2">{pool.remaining_milk_liters?.toFixed(2)} L</span>
                </div>
                <div>
                  <span className="text-gray-600">Current Fat:</span>
                  <span className="font-bold text-blue-900 ml-2">{pool.current_avg_fat?.toFixed(2)}%</span>
                </div>
                <div>
                  <span className="text-gray-600">Current SNF:</span>
                  <span className="font-bold text-blue-900 ml-2">{pool.current_avg_snf?.toFixed(2)}%</span>
                </div>
              </div>
            </div>
          )}
          
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Liters to Use <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.001"
                value={milkData.liters}
                onChange={(e) => setMilkData({ ...milkData, liters: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fat % <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                value={milkData.fat_percent}
                onChange={(e) => setMilkData({ ...milkData, fat_percent: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SNF % <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                value={milkData.snf_percent}
                onChange={(e) => setMilkData({ ...milkData, snf_percent: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Raw Materials */}
      {step === 2 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Step 2: Raw Materials Consumption</h2>
          
          <div className="space-y-4">
            {rawMaterials.map((material, index) => (
              <div key={material.id} className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Material <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={material.material_id}
                    onChange={(e) => updateRawMaterial(material.id, 'material_id', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Material</option>
                    {availableMaterials.map((mat) => (
                      <option key={mat.id} value={mat.id}>{mat.name}</option>
                    ))}
                  </select>
                </div>
                
                <div className="w-32">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quantity <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={material.quantity}
                    onChange={(e) => updateRawMaterial(material.id, 'quantity', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div className="w-24">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Unit</label>
                  <input
                    type="text"
                    value={material.unit}
                    onChange={(e) => updateRawMaterial(material.id, 'unit', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                {rawMaterials.length > 1 && (
                  <button
                    onClick={() => removeRawMaterial(material.id)}
                    className="px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          
          <button
            onClick={addRawMaterial}
            className="mt-4 text-blue-600 hover:text-blue-800 font-medium"
          >
            + Add Another Material
          </button>
        </div>
      )}

      {/* Step 3: Processing Details */}
      {step === 3 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Step 3: Processing Details</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Product Type <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={processingData.product_type}
                onChange={(e) => setProcessingData({ ...processingData, product_type: e.target.value })}
                placeholder="e.g., Curd, Paneer, Butter"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Temperature</label>
                <input
                  type="text"
                  value={processingData.temperature}
                  onChange={(e) => setProcessingData({ ...processingData, temperature: e.target.value })}
                  placeholder="e.g., 42°C"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Processing Time</label>
                <input
                  type="text"
                  value={processingData.processing_time}
                  onChange={(e) => setProcessingData({ ...processingData, processing_time: e.target.value })}
                  placeholder="e.g., 8 hours"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Final Fat %</label>
                <input
                  type="number"
                  step="0.01"
                  value={processingData.final_fat_percent}
                  onChange={(e) => setProcessingData({ ...processingData, final_fat_percent: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Final SNF %</label>
                <input
                  type="number"
                  step="0.01"
                  value={processingData.final_snf_percent}
                  onChange={(e) => setProcessingData({ ...processingData, final_snf_percent: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Culture Details</label>
              <textarea
                value={processingData.culture_details}
                onChange={(e) => setProcessingData({ ...processingData, culture_details: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Production Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Review */}
      {step === 4 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Step 4: Review & Submit</h2>
          
          <div className="space-y-4">
            <div className="border-b pb-4">
              <h3 className="font-semibold text-gray-900 mb-2">Milk Usage</h3>
              <p className="text-sm text-gray-700">
                {milkData.liters}L @ {milkData.fat_percent}% Fat, {milkData.snf_percent}% SNF
              </p>
            </div>
            
            <div className="border-b pb-4">
              <h3 className="font-semibold text-gray-900 mb-2">Raw Materials</h3>
              {rawMaterials.filter(m => m.material_id).map((material) => {
                const mat = availableMaterials.find(m => m.id === material.material_id)
                return (
                  <p key={material.id} className="text-sm text-gray-700">
                    {mat?.name}: {material.quantity} {material.unit}
                  </p>
                )
              })}
            </div>
            
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Processing</h3>
              <p className="text-sm text-gray-700">Product: {processingData.product_type}</p>
              {processingData.temperature && <p className="text-sm text-gray-700">Temperature: {processingData.temperature}</p>}
              {processingData.processing_time && <p className="text-sm text-gray-700">Time: {processingData.processing_time}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex gap-4 mt-6">
        {step > 1 && (
          <button
            onClick={() => setStep(step - 1)}
            className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300"
          >
            Previous
          </button>
        )}
        
        {step < 4 ? (
          <button
            onClick={handleNext}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Production'}
          </button>
        )}
        
        <button
          onClick={() => router.back()}
          className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
