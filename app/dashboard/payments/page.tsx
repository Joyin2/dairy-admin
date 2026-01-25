'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function PaymentsPage() {
  const supabase = createClient()
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, cleared: 0, pending: 0 })

  useEffect(() => {
    const fetchPayments = async () => {
      const { data, error } = await supabase
        .from('ledger_entries')
        .select('*, app_users(name)')
        .order('created_at', { ascending: false })
        .limit(100)
      
      if (!error && data) {
        setPayments(data)
        const total = data.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
        const cleared = data.filter(p => p.cleared).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
        setStats({ total, cleared, pending: total - cleared })
      }
      setLoading(false)
    }
    fetchPayments()
  }, [supabase])

  const handleClearPayment = async (id: string) => {
    const { error } = await supabase.from('ledger_entries').update({ cleared: true }).eq('id', id)
    if (!error) {
      setPayments(payments.map(p => p.id === id ? { ...p, cleared: true } : p))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Payments & Ledger</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-500">Total Collections</p>
          <p className="text-3xl font-bold text-gray-900">₹{stats.total.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-500">Cleared</p>
          <p className="text-3xl font-bold text-green-600">₹{stats.cleared.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-500">Pending Clearance</p>
          <p className="text-3xl font-bold text-yellow-600">₹{stats.pending.toLocaleString()}</p>
        </div>
      </div>

      {/* Payments List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Transactions</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : payments.length > 0 ? (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">From</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">To</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mode</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {payments.map((payment) => (
                <tr key={payment.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-gray-900">{payment.from_account || '-'}</td>
                  <td className="px-6 py-4 text-gray-900">{payment.to_account || '-'}</td>
                  <td className="px-6 py-4 font-medium text-gray-900">₹{payment.amount}</td>
                  <td className="px-6 py-4 text-gray-600 capitalize">{payment.mode || 'cash'}</td>
                  <td className="px-6 py-4 text-gray-600">
                    {new Date(payment.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 text-xs rounded-full ${payment.cleared ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {payment.cleared ? 'Cleared' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {!payment.cleared && (
                      <button
                        onClick={() => handleClearPayment(payment.id)}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Clear
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-gray-500">
            No payment records found. Payments will appear here when deliveries are completed.
          </div>
        )}
      </div>
    </div>
  )
}
