'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function OutstandingBalancesPage() {
  const supabase = createClient()
  const [balances, setBalances] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [totalOutstanding, setTotalOutstanding] = useState(0)

  useEffect(() => {
    fetchOutstandingBalances()

    // Set up real-time subscription for delivery updates
    const channel = supabase
      .channel('outstanding-deliveries')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deliveries',
        },
        () => {
          // Refetch when any delivery is updated
          fetchOutstandingBalances()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const fetchOutstandingBalances = async () => {
    setLoading(true)
    
    // Get all deliveries with status delivered or partial
    const { data: deliveries } = await supabase
      .from('deliveries')
      .select('*, shops(id, name, contact, city, owner_name)')
      .in('status', ['delivered', 'partial'])

    if (deliveries) {
      // Group by shop and calculate balance
      const shopBalances = deliveries.reduce((acc: any, delivery: any) => {
        const shopId = delivery.shop_id
        const expected = delivery.expected_amount || 0
        const collected = delivery.collected_amount || 0
        const balance = expected - collected

        if (balance > 0) {
          if (!acc[shopId]) {
            acc[shopId] = {
              shop_id: shopId,
              shop_name: delivery.shops?.name || 'Unknown',
              owner_name: delivery.shops?.owner_name || '',
              contact: delivery.shops?.contact || '',
              city: delivery.shops?.city || '',
              total_expected: 0,
              total_collected: 0,
              outstanding: 0,
              delivery_count: 0,
            }
          }
          acc[shopId].total_expected += expected
          acc[shopId].total_collected += collected
          acc[shopId].outstanding += balance
          acc[shopId].delivery_count += 1
        }
        return acc
      }, {})

      const balanceArray = Object.values(shopBalances).sort((a: any, b: any) => b.outstanding - a.outstanding)
      setBalances(balanceArray)
      
      const total = balanceArray.reduce((sum: number, b: any) => sum + b.outstanding, 0)
      setTotalOutstanding(total)
    }
    
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Outstanding Balances</h1>
          <p className="text-sm text-gray-600 mt-1">Track pending payments from shops</p>
        </div>
        <button
          onClick={() => fetchOutstandingBalances()}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          <span>{loading ? '⟳' : '↻'}</span>
          <span>Refresh</span>
        </button>
      </div>

      {/* Total Summary */}
      <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-lg shadow p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm opacity-90">Total Outstanding</p>
            <p className="text-4xl font-bold mt-1">₹{totalOutstanding.toFixed(2)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm opacity-90">Shops with Dues</p>
            <p className="text-4xl font-bold mt-1">{balances.length}</p>
          </div>
        </div>
      </div>

      {/* Outstanding List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : balances.length > 0 ? (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shop</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">City</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Expected</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Collected</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Outstanding</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Deliveries</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {balances.map((balance) => (
                <tr key={balance.shop_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{balance.shop_name}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{balance.owner_name || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{balance.contact || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{balance.city || '-'}</td>
                  <td className="px-6 py-4 text-right text-sm text-gray-600">₹{balance.total_expected.toFixed(2)}</td>
                  <td className="px-6 py-4 text-right text-sm text-gray-600">₹{balance.total_collected.toFixed(2)}</td>
                  <td className="px-6 py-4 text-right">
                    <span className="px-3 py-1 text-sm font-semibold rounded-full bg-red-100 text-red-800">
                      ₹{balance.outstanding.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-gray-600">{balance.delivery_count}</td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/dashboard/shops/${balance.shop_id}`}
                      className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                    >
                      View Shop
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-gray-500">
            <p className="text-lg font-medium">No outstanding balances! 🎉</p>
            <p className="text-sm mt-2">All shops have paid their dues.</p>
          </div>
        )}
      </div>
    </div>
  )
}
