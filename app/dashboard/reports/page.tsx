'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ReportsPage() {
  const supabase = createClient()
  const [stats, setStats] = useState({
    totalCollections: 0,
    totalMilk: 0,
    totalDeliveries: 0,
    totalRevenue: 0,
    avgFat: 0,
    avgSnf: 0,
  })
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(1)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true)
      
      const [collectionsRes, deliveriesRes, paymentsRes] = await Promise.all([
        supabase
          .from('milk_collections')
          .select('qty_liters, fat, snf')
          .gte('created_at', dateRange.start)
          .lte('created_at', dateRange.end + 'T23:59:59'),
        supabase
          .from('deliveries')
          .select('delivered_qty, collected_amount')
          .gte('created_at', dateRange.start)
          .lte('created_at', dateRange.end + 'T23:59:59'),
        supabase
          .from('ledger_entries')
          .select('amount')
          .gte('created_at', dateRange.start)
          .lte('created_at', dateRange.end + 'T23:59:59'),
      ])

      const collections = collectionsRes.data || []
      const deliveries = deliveriesRes.data || []
      const payments = paymentsRes.data || []

      const totalMilk = collections.reduce((sum, c) => sum + (parseFloat(c.qty_liters) || 0), 0)
      const avgFat = collections.length > 0 
        ? collections.reduce((sum, c) => sum + (parseFloat(c.fat) || 0), 0) / collections.length 
        : 0
      const avgSnf = collections.length > 0 
        ? collections.reduce((sum, c) => sum + (parseFloat(c.snf) || 0), 0) / collections.length 
        : 0
      const totalRevenue = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)

      setStats({
        totalCollections: collections.length,
        totalMilk,
        totalDeliveries: deliveries.length,
        totalRevenue,
        avgFat,
        avgSnf,
      })
      setLoading(false)
    }
    fetchStats()
  }, [supabase, dateRange])

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
      </div>

      {/* Date Range Filter */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={() => setDateRange({
              start: new Date(new Date().setDate(1)).toISOString().split('T')[0],
              end: new Date().toISOString().split('T')[0],
            })}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            This Month
          </button>
          <button
            onClick={() => {
              const today = new Date()
              const weekAgo = new Date(today.setDate(today.getDate() - 7))
              setDateRange({
                start: weekAgo.toISOString().split('T')[0],
                end: new Date().toISOString().split('T')[0],
              })
            }}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            Last 7 Days
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-500">Loading reports...</div>
      ) : (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">Collections</p>
              <p className="text-2xl font-bold text-blue-600">{stats.totalCollections}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">Total Milk</p>
              <p className="text-2xl font-bold text-green-600">{stats.totalMilk.toFixed(1)}L</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">Deliveries</p>
              <p className="text-2xl font-bold text-purple-600">{stats.totalDeliveries}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">Revenue</p>
              <p className="text-2xl font-bold text-indigo-600">₹{stats.totalRevenue.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">Avg Fat %</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.avgFat.toFixed(2)}%</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">Avg SNF %</p>
              <p className="text-2xl font-bold text-pink-600">{stats.avgSnf.toFixed(2)}%</p>
            </div>
          </div>

          {/* Report Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Collection Summary</h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-gray-600">Total Collections</span>
                  <span className="font-semibold text-gray-900">{stats.totalCollections}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-gray-600">Total Quantity</span>
                  <span className="font-semibold text-gray-900">{stats.totalMilk.toFixed(2)} Liters</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-gray-600">Average Fat</span>
                  <span className="font-semibold text-gray-900">{stats.avgFat.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-600">Average SNF</span>
                  <span className="font-semibold text-gray-900">{stats.avgSnf.toFixed(2)}%</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Delivery Summary</h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-gray-600">Total Deliveries</span>
                  <span className="font-semibold text-gray-900">{stats.totalDeliveries}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-gray-600">Total Revenue</span>
                  <span className="font-semibold text-gray-900">₹{stats.totalRevenue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-gray-600">Avg per Delivery</span>
                  <span className="font-semibold text-gray-900">
                    ₹{stats.totalDeliveries > 0 ? (stats.totalRevenue / stats.totalDeliveries).toFixed(2) : 0}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-600">Period</span>
                  <span className="font-semibold text-gray-900">
                    {new Date(dateRange.start).toLocaleDateString()} - {new Date(dateRange.end).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Export Section */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Export Reports</h2>
            <div className="flex flex-wrap gap-3">
              <button className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors">
                Export Collections (CSV)
              </button>
              <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
                Export Deliveries (CSV)
              </button>
              <button className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors">
                Export Payments (CSV)
              </button>
              <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors">
                Full Report (PDF)
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
