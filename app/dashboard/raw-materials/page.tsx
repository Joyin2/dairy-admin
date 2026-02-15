'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function RawMaterialsPage() {
  const supabase = createClient()
  const [materials, setMaterials] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showPurchaseModal, setShowPurchaseModal] = useState(false)
  const [selectedMaterial, setSelectedMaterial] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  
  const [materialForm, setMaterialForm] = useState({
    name: '',
    sku: '',
    category: '',
    unit: '',
    cost_per_unit: ''
  })
  
  const [purchaseForm, setPurchaseForm] = useState({
    quantity: '',
    unit: '',
    rate_per_unit: '',
    supplier: '',
    invoice_number: '',
    purchase_date: new Date().toISOString().split('T')[0]
  })

  useEffect(() => {
    loadMaterials()
  }, [])

  const loadMaterials = async () => {
    setLoading(true)
    
    const { data: materialsData } = await supabase
      .from('raw_materials')
      .select('*')
      .eq('is_active', true)
      .order('name')
    
    setMaterials(materialsData || [])
    setLoading(false)
  }

  const handleAddMaterial = async () => {
    if (!materialForm.name.trim() || !materialForm.unit.trim()) {
      setError('Name and unit are required')
      return
    }
    
    setActionLoading(true)
    setError(null)
    
    try {
      const { data, error: matError } = await supabase
        .from('raw_materials')
        .insert({
          name: materialForm.name.trim(),
          sku: materialForm.sku?.trim() || null,
          category: materialForm.category?.trim() || null,
          unit: materialForm.unit.trim(),
          cost_per_unit: materialForm.cost_per_unit ? parseFloat(materialForm.cost_per_unit) : null,
          current_stock: 0,
          is_active: true
        })
        .select()
      
      if (matError) {
        console.error('Supabase error:', JSON.stringify(matError))
        throw new Error(matError.message || matError.details || matError.hint || JSON.stringify(matError))
      }
      
      setShowAddModal(false)
      setMaterialForm({ name: '', sku: '', category: '', unit: '', cost_per_unit: '' })
      await loadMaterials()
    } catch (err: any) {
      console.error('Error:', String(err))
      setError(err?.message || String(err))
    } finally {
      setActionLoading(false)
    }
  }

  const handleAddPurchase = async () => {
    if (!purchaseForm.quantity || parseFloat(purchaseForm.quantity) <= 0 || !purchaseForm.unit) {
      setError('Quantity and unit are required')
      return
    }
    
    setActionLoading(true)
    setError(null)
    
    try {
      const quantity = parseFloat(purchaseForm.quantity)
      
      // Update current_stock directly on raw_materials
      const newStock = parseFloat(selectedMaterial.current_stock || 0) + quantity
      
      const { error: updateError } = await supabase
        .from('raw_materials')
        .update({
          current_stock: newStock,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedMaterial.id)
      
      if (updateError) {
        console.error('Stock update error:', JSON.stringify(updateError))
        throw new Error(updateError.message || JSON.stringify(updateError))
      }
      
      setShowPurchaseModal(false)
      setSelectedMaterial(null)
      setPurchaseForm({
        quantity: '',
        unit: '',
        rate_per_unit: '',
        supplier: '',
        invoice_number: '',
        purchase_date: new Date().toISOString().split('T')[0]
      })
      await loadMaterials()
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setActionLoading(false)
    }
  }

  const openPurchaseModal = (material: any) => {
    setSelectedMaterial(material)
    setPurchaseForm({
      ...purchaseForm,
      unit: material.unit || ''
    })
    setShowPurchaseModal(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Raw Materials</h1>
          <p className="text-sm text-gray-600 mt-1">Manage raw materials and stock</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium"
        >
          + Add Material
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Materials List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : materials.length > 0 ? (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Material
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  SKU
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Current Stock
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Unit
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {materials.map((material) => (
                <tr key={material.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{material.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {material.sku || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {material.category || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-sm font-semibold ${
                      (material.current_stock || 0) <= 0
                        ? 'text-red-600'
                        : 'text-gray-900'
                    }`}>
                      {parseFloat(material.current_stock || 0).toFixed(2)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {material.unit}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <button
                      onClick={() => openPurchaseModal(material)}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Add Stock
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-gray-500">
            <p className="text-lg font-medium">No materials found</p>
            <p className="text-sm mt-2">Add your first raw material to get started</p>
          </div>
        )}
      </div>

      {/* Add Material Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Add New Material</h3>
            
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                {error}
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={materialForm.name}
                  onChange={(e) => setMaterialForm({ ...materialForm, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">SKU</label>
                <input
                  type="text"
                  value={materialForm.sku}
                  onChange={(e) => setMaterialForm({ ...materialForm, sku: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <input
                  type="text"
                  value={materialForm.category}
                  onChange={(e) => setMaterialForm({ ...materialForm, category: e.target.value })}
                  placeholder="e.g., Culture, Packaging, Additives"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Unit <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={materialForm.unit}
                  onChange={(e) => setMaterialForm({ ...materialForm, unit: e.target.value })}
                  placeholder="e.g., kg, g, pieces, L"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cost per Unit (optional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={materialForm.cost_per_unit}
                  onChange={(e) => setMaterialForm({ ...materialForm, cost_per_unit: e.target.value })}
                  placeholder="e.g., 50.00"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div className="flex gap-2 mt-6">
              <button
                onClick={handleAddMaterial}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? 'Adding...' : 'Add Material'}
              </button>
              <button
                onClick={() => {
                  setShowAddModal(false)
                  setMaterialForm({ name: '', sku: '', category: '', unit: '', cost_per_unit: '' })
                  setError(null)
                }}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Purchase Modal */}
      {showPurchaseModal && selectedMaterial && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Add Stock: {selectedMaterial.name}
            </h3>
            
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                {error}
              </div>
            )}
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quantity <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={purchaseForm.quantity}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, quantity: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Unit <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={purchaseForm.unit}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, unit: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Rate per Unit</label>
                <input
                  type="number"
                  step="0.01"
                  value={purchaseForm.rate_per_unit}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, rate_per_unit: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Supplier</label>
                <input
                  type="text"
                  value={purchaseForm.supplier}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, supplier: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Invoice Number</label>
                <input
                  type="text"
                  value={purchaseForm.invoice_number}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, invoice_number: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Purchase Date</label>
                <input
                  type="date"
                  value={purchaseForm.purchase_date}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, purchase_date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div className="flex gap-2 mt-6">
              <button
                onClick={handleAddPurchase}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? 'Adding...' : 'Add Stock'}
              </button>
              <button
                onClick={() => {
                  setShowPurchaseModal(false)
                  setSelectedMaterial(null)
                  setError(null)
                }}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
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
