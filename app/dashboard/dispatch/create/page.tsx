'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface InventoryItem {
  id: string
  product_name: string
  batch_number: string
  packaging_type: string
  package_size: string
  quantity: number
  unit: string
}

interface SelectedItem extends InventoryItem {
  allocateQty: string
}

export default function CreateDispatchPage() {
  const supabase = createClient()
  const router = useRouter()

  const [agents, setAgents] = useState<any[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [selectedAgent, setSelectedAgent] = useState('')
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([])
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [step, setStep] = useState(1)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const [agentsRes, inventoryRes] = await Promise.all([
      supabase
        .from('app_users')
        .select('id, name, email, phone, role')
        .eq('role', 'delivery_agent')
        .order('name'),
      supabase
        .from('production_inventory')
        .select('*')
        .gt('quantity', 0)
        .order('product_name'),
    ])

    setAgents(agentsRes.data || [])
    setInventory(inventoryRes.data || [])
  }

  const addItem = (item: InventoryItem) => {
    if (selectedItems.find(s => s.id === item.id)) return
    setSelectedItems([...selectedItems, { ...item, allocateQty: '' }])
  }

  const removeItem = (itemId: string) => {
    setSelectedItems(selectedItems.filter(s => s.id !== itemId))
  }

  const updateQty = (itemId: string, qty: string) => {
    setSelectedItems(selectedItems.map(s =>
      s.id === itemId ? { ...s, allocateQty: qty } : s
    ))
  }

  const filteredInventory = inventory.filter(item => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      item.product_name?.toLowerCase().includes(q) ||
      item.batch_number?.toLowerCase().includes(q) ||
      item.packaging_type?.toLowerCase().includes(q)
    )
  })

  const validateStep2 = () => {
    if (selectedItems.length === 0) {
      setError('Please select at least one product')
      return false
    }
    for (const item of selectedItems) {
      const qty = parseFloat(item.allocateQty)
      if (!qty || qty <= 0) {
        setError(`Enter a valid quantity for ${item.product_name} (${item.batch_number})`)
        return false
      }
      if (qty > item.quantity) {
        setError(`Cannot allocate ${qty} of ${item.product_name} (${item.batch_number}). Available: ${item.quantity}`)
        return false
      }
    }
    setError(null)
    return true
  }

  const handleSubmit = async () => {
    if (!selectedAgent) {
      setError('Please select an agent')
      return
    }
    if (!validateStep2()) return

    setLoading(true)
    setError(null)

    try {
      // Get current admin user
      const { data: { user } } = await supabase.auth.getUser()
      let adminId = null
      if (user) {
        const { data: appUser } = await supabase
          .from('app_users')
          .select('id')
          .eq('auth_uid', user.id)
          .single()
        adminId = appUser?.id
      }

      // 1. Create allocation
      const { data: allocation, error: allocError } = await supabase
        .from('agent_stock_allocations')
        .insert({
          agent_id: selectedAgent,
          status: 'pending_pickup',
          notes: notes || null,
          created_by: adminId,
        })
        .select()
        .single()

      if (allocError) {
        console.error('Allocation insert error:', allocError)
        if (allocError.message?.includes('schema cache')) {
          setError('Database schema cache needs refresh. Please run this SQL in Supabase SQL Editor: NOTIFY pgrst, \'reload schema\'; Then try again.')
        } else {
          setError(`Failed to create allocation: ${allocError.message}`)
        }
        return
      }

      // 2. Create stock items
      const stockItems = selectedItems.map(item => ({
        allocation_id: allocation.id,
        inventory_item_id: item.id,
        product_name: item.product_name,
        batch_number: item.batch_number,
        packaging_type: item.packaging_type || null,
        package_size: item.package_size || null,
        quantity_allocated: parseFloat(item.allocateQty),
        unit: item.unit,
      }))

      const { error: itemsError } = await supabase
        .from('agent_stock_items')
        .insert(stockItems)

      if (itemsError) throw itemsError

      // 3. Deduct from production_inventory
      for (const item of selectedItems) {
        const newQty = item.quantity - parseFloat(item.allocateQty)
        const { error: deductError } = await supabase
          .from('production_inventory')
          .update({ quantity: newQty })
          .eq('id', item.id)

        if (deductError) {
          console.error('Failed to deduct inventory for', item.product_name, deductError)
        }
      }

      router.push('/dashboard/dispatch')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to create dispatch')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Create Stock Dispatch</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Step Indicator */}
      <div className="flex items-center mb-8">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}
            >
              {s}
            </div>
            <span className={`ml-2 text-sm font-medium ${step >= s ? 'text-gray-900' : 'text-gray-400'}`}>
              {s === 1 ? 'Select Agent' : s === 2 ? 'Select Products' : 'Review & Confirm'}
            </span>
            {s < 3 && <div className={`w-12 h-0.5 mx-3 ${step > s ? 'bg-blue-600' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Select Agent */}
      {step === 1 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Delivery Agent</h2>
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white text-lg"
          >
            <option value="">Choose an agent...</option>
            {agents.map(agent => (
              <option key={agent.id} value={agent.id}>
                {agent.name} ({agent.email}{agent.phone ? ` | ${agent.phone}` : ''})
              </option>
            ))}
          </select>

          {agents.length === 0 && (
            <p className="text-sm text-yellow-600 mt-3">
              No delivery agents found. Make sure agents have role &quot;delivery_agent&quot; in app_users.
            </p>
          )}

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special instructions..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              rows={2}
            />
          </div>

          <div className="flex justify-end mt-6">
            <button
              onClick={() => {
                if (!selectedAgent) {
                  setError('Please select an agent')
                  return
                }
                setError(null)
                setStep(2)
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium"
            >
              Next: Select Products
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Select Products */}
      {step === 2 && (
        <div className="space-y-6">
          {/* Available Inventory */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Available Inventory</h2>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by product, batch number, packaging..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 mb-4 text-gray-900 bg-white"
            />

            {filteredInventory.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No inventory available</p>
            ) : (
              <div className="max-h-80 overflow-y-auto border rounded-lg">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Packaging</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Available</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredInventory.map(item => {
                      const isSelected = selectedItems.some(s => s.id === item.id)
                      return (
                        <tr key={item.id} className={isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.product_name}</td>
                          <td className="px-4 py-3 text-sm text-blue-600 font-mono">{item.batch_number}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {item.packaging_type || '-'} {item.package_size ? `(${item.package_size})` : ''}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {isSelected ? (
                              <span className="text-xs text-green-600 font-semibold">Added</span>
                            ) : (
                              <button
                                onClick={() => addItem(item)}
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                              >
                                + Add
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Selected Items */}
          {selectedItems.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Selected Products ({selectedItems.length})
              </h2>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Available</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Allocate Qty</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {selectedItems.map(item => (
                      <tr key={item.id}>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">{item.product_name}</div>
                          <div className="text-xs text-gray-500">{item.packaging_type} {item.package_size ? `(${item.package_size})` : ''}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-blue-600 font-mono">{item.batch_number}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{item.quantity} {item.unit}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="0.1"
                              min="0.1"
                              max={item.quantity}
                              value={item.allocateQty}
                              onChange={(e) => updateQty(item.id, e.target.value)}
                              className="w-24 px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900 bg-white"
                              placeholder="0"
                            />
                            <span className="text-xs text-gray-500">{item.unit}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => removeItem(item.id)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button
              onClick={() => setStep(1)}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-2.5 rounded-lg font-medium"
            >
              Back
            </button>
            <button
              onClick={() => {
                if (validateStep2()) setStep(3)
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium"
            >
              Next: Review
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review & Confirm */}
      {step === 3 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Review Dispatch</h2>

          {/* Agent Info */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-gray-500 mb-1">Delivery Agent</p>
            <p className="text-lg font-semibold text-gray-900">
              {agents.find(a => a.id === selectedAgent)?.name || 'Unknown'}
            </p>
            <p className="text-sm text-gray-500">
              {agents.find(a => a.id === selectedAgent)?.email}
            </p>
          </div>

          {notes && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">Notes</p>
              <p className="text-gray-900">{notes}</p>
            </div>
          )}

          {/* Items Summary */}
          <div className="border rounded-lg overflow-hidden mb-6">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Packaging</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Qty to Dispatch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {selectedItems.map(item => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.product_name}</td>
                    <td className="px-4 py-3 text-sm text-blue-600 font-mono">{item.batch_number}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {item.packaging_type || '-'} {item.package_size ? `(${item.package_size})` : ''}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-gray-900">
                      {item.allocateQty} {item.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-4 bg-green-50 rounded-lg mb-6">
            <p className="text-sm font-medium text-green-800">
              Total: {selectedItems.length} product(s),{' '}
              {selectedItems.reduce((sum, i) => sum + (parseFloat(i.allocateQty) || 0), 0).toFixed(1)} units to dispatch
            </p>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep(2)}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-2.5 rounded-lg font-medium"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 text-white px-8 py-2.5 rounded-lg font-medium disabled:opacity-50"
            >
              {loading ? 'Creating Dispatch...' : 'Approve & Dispatch'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
