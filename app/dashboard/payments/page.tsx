'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

interface DashboardStats {
  todaySales: number
  monthSales: number
  totalCashCollected: number
  totalOutstanding: number
  agentPendingSubmission: number
  overduePayments: number
  overdueCount: number
}

interface Agent {
  id: string
  name: string
  email: string
}

interface Shop {
  id: string
  name: string
}

export default function PaymentsPage() {
  const supabase = createClient()
  const [activeView, setActiveView] = useState<'dashboard' | 'transactions' | 'shop-ledger' | 'agent-ledger' | 'add-payment'>('dashboard')
  const [stats, setStats] = useState<DashboardStats>({
    todaySales: 0,
    monthSales: 0,
    totalCashCollected: 0,
    totalOutstanding: 0,
    agentPendingSubmission: 0,
    overduePayments: 0,
    overdueCount: 0,
  })
  const [payments, setPayments] = useState<any[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [shops, setShops] = useState<Shop[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedShop, setSelectedShop] = useState<string | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    await Promise.all([
      fetchStats(),
      fetchRecentPayments(),
      fetchAgents(),
      fetchShops(),
    ])
    setLoading(false)
  }

  const fetchStats = async () => {
    try {
      // Get today's start
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      
      // Get month start
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

      // Fetch deliveries for sales data
      const { data: deliveries } = await supabase
        .from('deliveries')
        .select('expected_amount, collected_amount, status, created_at')
        .in('status', ['delivered', 'partial'])

      // Fetch ledger entries for cash tracking
      const { data: ledger } = await supabase
        .from('ledger_entries')
        .select('amount, cleared, created_at, created_by')

      // Fetch agent allocations for pending submissions
      const { data: allocations } = await supabase
        .from('agent_stock_allocations')
        .select('id, agent_id, status')
        .in('status', ['picked_up', 'in_delivery'])

      const deliveriesData = deliveries || []
      const ledgerData = ledger || []

      // Calculate today's sales
      const todaySales = deliveriesData
        .filter(d => new Date(d.created_at) >= today)
        .reduce((sum, d) => sum + parseFloat(String(d.expected_amount || 0)), 0)

      // Calculate month's sales
      const monthSales = deliveriesData
        .filter(d => new Date(d.created_at) >= monthStart)
        .reduce((sum, d) => sum + parseFloat(String(d.expected_amount || 0)), 0)

      // Calculate cash collected (cleared ledger entries)
      const totalCashCollected = ledgerData
        .filter(l => l.cleared)
        .reduce((sum, l) => sum + parseFloat(String(l.amount || 0)), 0)

      // Calculate outstanding (expected - collected from deliveries)
      const totalExpected = deliveriesData.reduce((sum, d) => sum + parseFloat(String(d.expected_amount || 0)), 0)
      const totalCollected = deliveriesData.reduce((sum, d) => sum + parseFloat(String(d.collected_amount || 0)), 0)
      const totalOutstanding = Math.max(0, totalExpected - totalCollected)

      // Agent pending submission (from allocations)
      const agentPendingSubmission = (allocations || []).length

      // Overdue payments (outstanding for more than 7 days)
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      const overdueDeliveries = deliveriesData.filter(d => {
        const outstanding = parseFloat(String(d.expected_amount || 0)) - parseFloat(String(d.collected_amount || 0))
        return outstanding > 0 && new Date(d.created_at) < sevenDaysAgo
      })
      const overduePayments = overdueDeliveries.reduce((sum, d) => {
        return sum + (parseFloat(String(d.expected_amount || 0)) - parseFloat(String(d.collected_amount || 0)))
      }, 0)

      setStats({
        todaySales,
        monthSales,
        totalCashCollected,
        totalOutstanding,
        agentPendingSubmission,
        overduePayments,
        overdueCount: overdueDeliveries.length,
      })
    } catch (err) {
      console.error('Error fetching stats:', err)
    }
  }

  const fetchRecentPayments = async () => {
    try {
      // Fetch ALL deliveries (the master transaction table)
      const { data: deliveriesData } = await supabase
        .from('deliveries')
        .select('id, route_id, shop_id, status, expected_amount, collected_amount, delivered_at, completed_at, created_at, payment_mode, shops(name), routes(name, agent_id)')
        .order('created_at', { ascending: false })

      // Fetch delivery_sales for product details
      const { data: salesData } = await supabase
        .from('delivery_sales')
        .select('id, delivery_id, product_name, batch_number, quantity_sold, unit, price_per_unit, total_amount')
        .order('created_at', { ascending: false })

      // Fetch ledger_entries (manual payments not tied to deliveries)
      const { data: ledgerData } = await supabase
        .from('ledger_entries')
        .select('*, creator:app_users!ledger_entries_created_by_fkey(name)')
        .order('created_at', { ascending: false })

      // Build a map of delivery_id -> sales items
      const salesByDelivery: Record<string, any[]> = {}
      for (const sale of (salesData || [])) {
        if (!salesByDelivery[sale.delivery_id]) salesByDelivery[sale.delivery_id] = []
        salesByDelivery[sale.delivery_id].push(sale)
      }

      // Build a set of delivery IDs referenced in ledger entries
      const ledgerDeliveryRefs = new Set(
        (ledgerData || []).filter(l => l.reference).map(l => l.reference)
      )

      // Map agent IDs to names
      const agentIds = [...new Set((deliveriesData || []).map(d => {
        const route = Array.isArray(d.routes) ? d.routes[0] : d.routes
        return route?.agent_id
      }).filter(Boolean))]
      
      let agentMap: Record<string, string> = {}
      if (agentIds.length > 0) {
        const { data: agentData } = await supabase
          .from('app_users')
          .select('id, name')
          .in('id', agentIds)
        for (const a of (agentData || [])) {
          agentMap[a.id] = a.name
        }
      }

      // Create unified transaction list
      const transactions: any[] = []

      // Add delivery transactions
      for (const d of (deliveriesData || [])) {
        const shop = Array.isArray(d.shops) ? d.shops[0] : d.shops
        const route = Array.isArray(d.routes) ? d.routes[0] : d.routes
        const products = salesByDelivery[d.id] || []
        const productSummary = products.map(p => `${p.product_name} (${parseFloat(p.quantity_sold).toFixed(1)} ${p.unit})`).join(', ')

        transactions.push({
          id: d.id,
          type: 'delivery',
          date: d.delivered_at || d.created_at,
          shop_name: shop?.name || 'Unknown',
          route_name: route?.name || '-',
          agent_name: route?.agent_id ? (agentMap[route.agent_id] || 'Unknown') : '-',
          agent_id: route?.agent_id || null,
          products: productSummary || '-',
          sale_amount: parseFloat(String(d.expected_amount || 0)),
          cash_collected: parseFloat(String(d.collected_amount || 0)),
          outstanding: Math.max(0, parseFloat(String(d.expected_amount || 0)) - parseFloat(String(d.collected_amount || 0))),
          status: d.status,
          payment_mode: d.payment_mode || 'cash',
          product_count: products.length,
        })
      }

      // Add manual ledger entries (ones NOT created by delivery trigger)
      for (const l of (ledgerData || [])) {
        if (l.reference && ledgerDeliveryRefs.has(l.reference)) {
          // This is a delivery-triggered entry, already covered above
          continue
        }
        transactions.push({
          id: l.id,
          type: 'manual_payment',
          date: l.created_at,
          shop_name: l.from_account || '-',
          route_name: '-',
          agent_name: l.creator?.name || 'System',
          agent_id: l.created_by,
          products: '-',
          sale_amount: 0,
          cash_collected: parseFloat(String(l.amount || 0)),
          outstanding: 0,
          status: l.cleared ? 'cleared' : 'pending',
          payment_mode: l.mode || 'cash',
          product_count: 0,
          is_ledger: true,
          ledger_id: l.id,
          cleared: l.cleared,
        })
      }

      // Sort by date descending
      transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      setPayments(transactions)
    } catch (err) {
      console.error('Error fetching transactions:', err)
    }
  }

  const fetchAgents = async () => {
    const { data } = await supabase
      .from('app_users')
      .select('id, name, email')
      .eq('role', 'delivery_agent')
      .eq('status', 'active')
      .order('name')
    setAgents(data || [])
  }

  const fetchShops = async () => {
    const { data } = await supabase
      .from('shops')
      .select('id, name')
      .eq('status', 'approved')
      .order('name')
    setShops(data || [])
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">💰 Payment & Ledger Management</h1>
          <p className="text-sm text-gray-600 mt-1">Professional ERP-level financial tracking system</p>
        </div>
        <button
          onClick={() => fetchData()}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          <span>{loading ? '⟳' : '↻'}</span>
          <span>Refresh</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 flex-wrap border-b border-gray-200">
        {[
          { id: 'dashboard', label: '📊 Dashboard', icon: '📊' },
          { id: 'transactions', label: '💳 Transactions', icon: '💳' },
          { id: 'shop-ledger', label: '🏪 Shop Ledgers', icon: '🏪' },
          { id: 'agent-ledger', label: '🚚 Agent Ledgers', icon: '🚚' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveView(tab.id as any)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeView === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Dashboard View */}
      {activeView === 'dashboard' && (
        <DashboardView stats={stats} />
      )}

      {/* Transactions View */}
      {activeView === 'transactions' && (
        <TransactionsView 
          payments={payments} 
          agents={agents}
          onRefresh={fetchData}
        />
      )}

      {/* Shop Ledger View */}
      {activeView === 'shop-ledger' && (
        <ShopLedgerView 
          shops={shops}
          selectedShop={selectedShop}
          onSelectShop={setSelectedShop}
        />
      )}

      {/* Agent Ledger View */}
      {activeView === 'agent-ledger' && (
        <AgentLedgerView 
          agents={agents}
          selectedAgent={selectedAgent}
          onSelectAgent={setSelectedAgent}
        />
      )}

    </div>
  )
}

// Dashboard View Component
function DashboardView({ stats }: { stats: DashboardStats }) {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg p-5 text-white">
          <p className="text-xs opacity-90 uppercase font-medium">Today&apos;s Sales</p>
          <p className="text-2xl font-bold mt-1">₹{stats.todaySales.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-lg p-5 text-white">
          <p className="text-xs opacity-90 uppercase font-medium">This Month</p>
          <p className="text-2xl font-bold mt-1">₹{stats.monthSales.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg p-5 text-white">
          <p className="text-xs opacity-90 uppercase font-medium">Cash Collected</p>
          <p className="text-2xl font-bold mt-1">₹{stats.totalCashCollected.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-5 text-white">
          <p className="text-xs opacity-90 uppercase font-medium">Outstanding Dues</p>
          <p className="text-2xl font-bold mt-1">₹{stats.totalOutstanding.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-lg shadow-lg p-5 text-white">
          <p className="text-xs opacity-90 uppercase font-medium">Agent Pending</p>
          <p className="text-2xl font-bold mt-1">{stats.agentPendingSubmission}</p>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-lg shadow-lg p-5 text-white">
          <p className="text-xs opacity-90 uppercase font-medium">Overdue Payments</p>
          <p className="text-2xl font-bold mt-1">₹{stats.overduePayments.toLocaleString()}</p>
          <p className="text-xs opacity-75 mt-1">{stats.overdueCount} invoices</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/dashboard/outstanding"
            className="p-4 border-2 border-orange-200 rounded-lg hover:border-orange-400 hover:bg-orange-50 transition-colors"
          >
            <div className="text-3xl mb-2">⚠️</div>
            <h4 className="font-semibold text-gray-900">View Outstanding</h4>
            <p className="text-sm text-gray-600 mt-1">Track pending shop payments</p>
          </Link>
          <Link
            href="/dashboard/dispatch"
            className="p-4 border-2 border-blue-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors"
          >
            <div className="text-3xl mb-2">📤</div>
            <h4 className="font-semibold text-gray-900">Stock Dispatch</h4>
            <p className="text-sm text-gray-600 mt-1">Manage agent allocations</p>
          </Link>
          <Link
            href="/dashboard/sales-history"
            className="p-4 border-2 border-green-200 rounded-lg hover:border-green-400 hover:bg-green-50 transition-colors"
          >
            <div className="text-3xl mb-2">📋</div>
            <h4 className="font-semibold text-gray-900">Sales History</h4>
            <p className="text-sm text-gray-600 mt-1">View all sales records</p>
          </Link>
        </div>
      </div>

      {/* Financial Health Indicators */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Financial Health</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Collection Efficiency</span>
              <span className="font-medium text-gray-900">
                {stats.monthSales > 0 
                  ? ((stats.totalCashCollected / stats.monthSales) * 100).toFixed(1) 
                  : 0}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{ 
                  width: `${stats.monthSales > 0 ? Math.min((stats.totalCashCollected / stats.monthSales) * 100, 100) : 0}%` 
                }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Outstanding Ratio</span>
              <span className="font-medium text-gray-900">
                {stats.monthSales > 0 
                  ? ((stats.totalOutstanding / stats.monthSales) * 100).toFixed(1) 
                  : 0}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-orange-500 h-2 rounded-full transition-all"
                style={{ 
                  width: `${stats.monthSales > 0 ? Math.min((stats.totalOutstanding / stats.monthSales) * 100, 100) : 0}%` 
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Transactions View Component
function TransactionsView({ 
  payments, 
  agents,
  onRefresh 
}: { 
  payments: any[]
  agents: Agent[]
  onRefresh: () => void
}) {
  const supabase = createClient()
  const [agentFilter, setAgentFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [filteredPayments, setFilteredPayments] = useState(payments)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  useEffect(() => {
    let result = [...payments]

    if (agentFilter) {
      result = result.filter(p => p.agent_id === agentFilter)
    }

    if (statusFilter) {
      result = result.filter(p => p.status === statusFilter)
    }

    if (typeFilter) {
      if (typeFilter === 'delivery') {
        result = result.filter(p => p.type === 'delivery')
      } else if (typeFilter === 'manual') {
        result = result.filter(p => p.type === 'manual_payment')
      }
    }

    if (dateFilter) {
      result = result.filter(p => {
        const txDate = new Date(p.date).toISOString().split('T')[0]
        return txDate === dateFilter
      })
    }

    setFilteredPayments(result)
  }, [payments, agentFilter, statusFilter, typeFilter, dateFilter])

  const handleClearPayment = async (ledgerId: string) => {
    const { error } = await supabase.from('ledger_entries').update({ cleared: true }).eq('id', ledgerId)
    if (!error) {
      onRefresh()
    }
  }

  const totalSales = filteredPayments.reduce((sum, p) => sum + (p.sale_amount || 0), 0)
  const totalCollected = filteredPayments.reduce((sum, p) => sum + (p.cash_collected || 0), 0)
  const totalOutstanding = filteredPayments.reduce((sum, p) => sum + (p.outstanding || 0), 0)

  const getStatusBadge = (tx: any) => {
    if (tx.type === 'manual_payment') {
      return tx.cleared 
        ? <span className="px-2 py-1 text-xs font-semibold rounded bg-green-100 text-green-800">Cleared</span>
        : <span className="px-2 py-1 text-xs font-semibold rounded bg-yellow-100 text-yellow-800">Pending</span>
    }
    switch (tx.status) {
      case 'delivered':
        return <span className="px-2 py-1 text-xs font-semibold rounded bg-green-100 text-green-800">Delivered</span>
      case 'partial':
        return <span className="px-2 py-1 text-xs font-semibold rounded bg-orange-100 text-orange-800">Partial</span>
      case 'pending':
        return <span className="px-2 py-1 text-xs font-semibold rounded bg-blue-100 text-blue-800">Pending</span>
      case 'confirmed':
        return <span className="px-2 py-1 text-xs font-semibold rounded bg-purple-100 text-purple-800">Confirmed</span>
      default:
        return <span className="px-2 py-1 text-xs font-semibold rounded bg-gray-100 text-gray-800 capitalize">{tx.status}</span>
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
          <p className="text-xs text-gray-500 uppercase">Total Records</p>
          <p className="text-2xl font-bold text-gray-900">{filteredPayments.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
          <p className="text-xs text-gray-500 uppercase">Total Sales</p>
          <p className="text-2xl font-bold text-green-700">₹{totalSales.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
          <p className="text-xs text-gray-500 uppercase">Cash Collected</p>
          <p className="text-2xl font-bold text-purple-700">₹{totalCollected.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-500">
          <p className="text-xs text-gray-500 uppercase">Outstanding</p>
          <p className="text-2xl font-bold text-orange-700">₹{totalOutstanding.toLocaleString()}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Agent</label>
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            >
              <option value="">All Agents</option>
              {agents.map(agent => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            >
              <option value="">All Types</option>
              <option value="delivery">Delivery Sales</option>
              <option value="manual">Manual Payments</option>
            </select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            >
              <option value="">All</option>
              <option value="delivered">Delivered</option>
              <option value="partial">Partial</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            />
          </div>
          {(agentFilter || statusFilter || typeFilter || dateFilter) && (
            <div className="flex items-end">
              <button
                onClick={() => {
                  setAgentFilter('')
                  setStatusFilter('')
                  setTypeFilter('')
                  setDateFilter('')
                }}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900">
            All Transactions ({filteredPayments.length})
          </h3>
          <div className="text-sm text-gray-500">
            Showing deliveries + manual payments
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shop</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Route</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sale Amt</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Collected</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Due</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredPayments.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                    No transactions found
                  </td>
                </tr>
              )}
              {filteredPayments.map((tx) => (
                <React.Fragment key={tx.id}>
                  <tr className={`hover:bg-gray-50 ${tx.type === 'manual_payment' ? 'bg-blue-50/30' : ''}`}>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {new Date(tx.date).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-4 py-3">
                      {tx.type === 'delivery' ? (
                        <span className="px-2 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded">Sale</span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium bg-teal-100 text-teal-700 rounded">Payment</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{tx.shop_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{tx.route_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{tx.agent_name}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                      {tx.sale_amount > 0 ? `₹${tx.sale_amount.toLocaleString()}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-green-700">
                      {tx.cash_collected > 0 ? `₹${tx.cash_collected.toLocaleString()}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold">
                      {tx.outstanding > 0 ? (
                        <span className="text-red-600">₹{tx.outstanding.toLocaleString()}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {getStatusBadge(tx)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {tx.type === 'delivery' && tx.products && tx.products !== '-' ? (
                        <button
                          onClick={() => setExpandedRow(expandedRow === tx.id ? null : tx.id)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          {expandedRow === tx.id ? 'Hide' : `${tx.product_count} items`}
                        </button>
                      ) : tx.type === 'manual_payment' && !tx.cleared ? (
                        <button
                          onClick={() => handleClearPayment(tx.ledger_id)}
                          className="text-green-600 hover:text-green-800 text-sm font-medium"
                        >
                          Clear
                        </button>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                  </tr>
                  {expandedRow === tx.id && tx.products && tx.products !== '-' && (
                    <tr className="bg-gray-50">
                      <td colSpan={10} className="px-8 py-3">
                        <div className="text-sm text-gray-700">
                          <span className="font-medium text-gray-500 uppercase text-xs">Products: </span>
                          {tx.products}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-gray-700 text-right">
                  Totals:
                </td>
                <td className="px-4 py-3 text-sm text-right font-bold text-gray-900">
                  ₹{totalSales.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm text-right font-bold text-green-700">
                  ₹{totalCollected.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm text-right font-bold text-red-600">
                  ₹{totalOutstanding.toLocaleString()}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

// Shop Ledger View - Professional ERP-level shop financial ledger
function ShopLedgerView({ 
  shops, 
  selectedShop, 
  onSelectShop 
}: { 
  shops: Shop[]
  selectedShop: string | null
  onSelectShop: (id: string | null) => void
}) {
  const supabase = createClient()
  const [shopInfo, setShopInfo] = useState<any>(null)
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalPaid: 0,
    totalOutstanding: 0,
    totalDeliveries: 0,
    lastPaymentDate: '',
  })

  useEffect(() => {
    if (selectedShop) {
      fetchShopLedger(selectedShop)
    } else {
      setShopInfo(null)
      setLedgerEntries([])
      setSummary({ totalSales: 0, totalPaid: 0, totalOutstanding: 0, totalDeliveries: 0, lastPaymentDate: '' })
    }
  }, [selectedShop, dateFrom, dateTo])

  const fetchShopLedger = async (shopId: string) => {
    setLoading(true)
    try {
      // 1. Fetch shop details with route info
      const { data: shop } = await supabase
        .from('shops')
        .select('id, name, owner_name, contact, address, city, payment_terms, credit_limit, route_id, routes(name, area)')
        .eq('id', shopId)
        .single()
      setShopInfo(shop)

      // 2. Fetch all deliveries for this shop
      let deliveryQuery = supabase
        .from('deliveries')
        .select('id, route_id, status, expected_amount, collected_amount, delivered_at, created_at, payment_mode, routes(name, agent_id)')
        .eq('shop_id', shopId)
        .order('created_at', { ascending: true })

      if (dateFrom) deliveryQuery = deliveryQuery.gte('created_at', dateFrom)
      if (dateTo) deliveryQuery = deliveryQuery.lte('created_at', dateTo + 'T23:59:59')

      const { data: deliveries } = await deliveryQuery

      // 3. Fetch delivery_sales for these deliveries
      const deliveryIds = (deliveries || []).map(d => d.id)
      let salesByDelivery: Record<string, any[]> = {}
      if (deliveryIds.length > 0) {
        const { data: salesData } = await supabase
          .from('delivery_sales')
          .select('delivery_id, product_name, batch_number, quantity_sold, unit, price_per_unit, total_amount')
          .in('delivery_id', deliveryIds)
        for (const s of (salesData || [])) {
          if (!salesByDelivery[s.delivery_id]) salesByDelivery[s.delivery_id] = []
          salesByDelivery[s.delivery_id].push(s)
        }
      }

      // 4. Fetch manual ledger entries (payments) for this shop
      const shopName = shop?.name || ''
      let ledgerQuery = supabase
        .from('ledger_entries')
        .select('id, amount, mode, reference, cleared, created_at, created_by, creator:app_users!ledger_entries_created_by_fkey(name)')
        .eq('from_account', shopName)
        .order('created_at', { ascending: true })

      if (dateFrom) ledgerQuery = ledgerQuery.gte('created_at', dateFrom)
      if (dateTo) ledgerQuery = ledgerQuery.lte('created_at', dateTo + 'T23:59:59')

      const { data: ledgerData } = await ledgerQuery

      // 5. Get agent names for deliveries
      const agentIds = [...new Set((deliveries || []).map(d => {
        const route = Array.isArray(d.routes) ? d.routes[0] : d.routes
        return route?.agent_id
      }).filter(Boolean))]
      
      let agentMap: Record<string, string> = {}
      if (agentIds.length > 0) {
        const { data: agentData } = await supabase
          .from('app_users')
          .select('id, name')
          .in('id', agentIds)
        for (const a of (agentData || [])) agentMap[a.id] = a.name
      }

      // 6. Build delivery-triggered ledger reference set
      const deliveryLedgerRefs = new Set(
        (ledgerData || []).filter(l => l.reference && deliveryIds.includes(l.reference)).map(l => l.reference)
      )

      // 7. Build unified ledger entries
      const entries: any[] = []

      for (const d of (deliveries || [])) {
        const route = Array.isArray(d.routes) ? d.routes[0] : d.routes
        const products = salesByDelivery[d.id] || []
        const batchNos = [...new Set(products.map(p => p.batch_number))].join(', ')
        const productSummary = products.map(p => `${p.product_name} x${parseFloat(p.quantity_sold).toFixed(1)}`).join(', ')

        entries.push({
          id: d.id,
          type: 'sale',
          date: d.delivered_at || d.created_at,
          ref: d.id.slice(0, 8).toUpperCase(),
          route_name: route?.name || '-',
          agent_name: route?.agent_id ? (agentMap[route.agent_id] || '-') : '-',
          batch_numbers: batchNos || '-',
          products: productSummary || '-',
          product_count: products.length,
          sale_amount: parseFloat(String(d.expected_amount || 0)),
          paid_amount: parseFloat(String(d.collected_amount || 0)),
          payment_mode: d.payment_mode || 'cash',
          status: d.status,
        })
      }

      // Add manual payments (not tied to deliveries)
      for (const l of (ledgerData || [])) {
        if (l.reference && deliveryLedgerRefs.has(l.reference)) continue
        entries.push({
          id: l.id,
          type: 'payment',
          date: l.created_at,
          ref: l.reference || l.id.slice(0, 8).toUpperCase(),
          route_name: '-',
          agent_name: ((l as any).creator?.name) || (Array.isArray((l as any).creator) ? (l as any).creator[0]?.name : 'System'),
          batch_numbers: '-',
          products: 'Manual Payment',
          product_count: 0,
          sale_amount: 0,
          paid_amount: parseFloat(String(l.amount || 0)),
          payment_mode: l.mode || 'cash',
          status: l.cleared ? 'cleared' : 'pending',
        })
      }

      // Sort by date ascending for running balance
      entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

      // Calculate running balance
      let runningBalance = 0
      for (const entry of entries) {
        runningBalance += entry.sale_amount - entry.paid_amount
        entry.running_balance = runningBalance
      }

      // Reverse for display (newest first)
      entries.reverse()
      setLedgerEntries(entries)

      // Calculate summary
      const totalSales = entries.reduce((s, e) => s + e.sale_amount, 0)
      const totalPaid = entries.reduce((s, e) => s + e.paid_amount, 0)
      const lastPayment = entries.find(e => e.paid_amount > 0)
      setSummary({
        totalSales,
        totalPaid,
        totalOutstanding: Math.max(0, totalSales - totalPaid),
        totalDeliveries: entries.filter(e => e.type === 'sale').length,
        lastPaymentDate: lastPayment ? new Date(lastPayment.date).toLocaleDateString('en-IN') : 'N/A',
      })
    } catch (err) {
      console.error('Error fetching shop ledger:', err)
    }
    setLoading(false)
  }

  const generatePDF = () => {
    if (!shopInfo || ledgerEntries.length === 0) return

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()

    // --- Title ---
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('Shop Ledger Statement', pageWidth / 2, 15, { align: 'center' })

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100)
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, pageWidth / 2, 21, { align: 'center' })
    doc.setTextColor(0)

    // --- Shop Info ---
    let y = 28
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(shopInfo.name, 14, y)
    y += 6

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    const routeName = Array.isArray(shopInfo.routes) ? shopInfo.routes[0]?.name : shopInfo.routes?.name
    const infoLines: string[] = []
    if (shopInfo.owner_name) infoLines.push(`Owner: ${shopInfo.owner_name}`)
    if (shopInfo.contact) infoLines.push(`Contact: ${shopInfo.contact}`)
    if (shopInfo.address) infoLines.push(`Address: ${shopInfo.address}${shopInfo.city ? ', ' + shopInfo.city : ''}`)
    if (routeName) infoLines.push(`Route: ${routeName}`)
    if (shopInfo.payment_terms) infoLines.push(`Payment Terms: ${shopInfo.payment_terms}`)
    if (dateFrom || dateTo) infoLines.push(`Period: ${dateFrom || '...'} to ${dateTo || '...'}`)

    for (const line of infoLines) {
      doc.text(line, 14, y)
      y += 4.5
    }
    y += 2

    // --- Summary Box ---
    doc.setFillColor(245, 245, 250)
    doc.roundedRect(14, y, pageWidth - 28, 14, 2, 2, 'F')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    const summaryItems = [
      `Deliveries: ${summary.totalDeliveries}`,
      `Total Sales: Rs ${summary.totalSales.toLocaleString()}`,
      `Total Paid: Rs ${summary.totalPaid.toLocaleString()}`,
      `Outstanding: Rs ${summary.totalOutstanding.toLocaleString()}`,
    ]
    const spacing = (pageWidth - 28) / summaryItems.length
    summaryItems.forEach((item, i) => {
      doc.text(item, 14 + spacing * i + spacing / 2, y + 9, { align: 'center' })
    })
    y += 20

    // --- Ledger Table ---
    const tableData = ledgerEntries.map(entry => [
      new Date(entry.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      entry.type === 'sale' ? 'Sale' : 'Payment',
      entry.ref,
      entry.route_name,
      entry.batch_numbers !== '-' ? entry.batch_numbers : (entry.type === 'payment' ? 'Manual Payment' : '-'),
      entry.agent_name,
      entry.sale_amount > 0 ? `Rs ${entry.sale_amount.toLocaleString()}` : '-',
      entry.paid_amount > 0 ? `Rs ${entry.paid_amount.toLocaleString()}` : '-',
      entry.running_balance > 0 ? `Rs ${entry.running_balance.toLocaleString()}` : (entry.running_balance < 0 ? `-Rs ${Math.abs(entry.running_balance).toLocaleString()}` : 'Rs 0'),
      entry.payment_mode,
      entry.status,
    ])

    autoTable(doc, {
      startY: y,
      head: [['Date', 'Type', 'Ref', 'Route', 'Batch/Products', 'Agent', 'Sale Amt', 'Paid', 'Balance', 'Mode', 'Status']],
      body: tableData,
      foot: [[
        '', '', '', '', '', 'TOTALS',
        `Rs ${summary.totalSales.toLocaleString()}`,
        `Rs ${summary.totalPaid.toLocaleString()}`,
        `Rs ${summary.totalOutstanding.toLocaleString()}`,
        '', '',
      ]],
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      footStyles: { fillColor: [243, 244, 246], textColor: [31, 41, 55], fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 16 },
        2: { cellWidth: 20 },
        6: { halign: 'right' },
        7: { halign: 'right' },
        8: { halign: 'right' },
      },
    })

    // --- Footer on each page ---
    const totalPages = (doc as any).getNumberOfPages()
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i)
      doc.setFontSize(7)
      doc.setTextColor(150)
      doc.text(
        `Page ${i} of ${totalPages} | Dairy Admin - Shop Ledger`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 5,
        { align: 'center' }
      )
    }

    const fileName = `${shopInfo.name.replace(/[^a-zA-Z0-9]/g, '_')}_Ledger_${new Date().toISOString().split('T')[0]}.pdf`
    doc.save(fileName)
  }

  const generateExcel = () => {
    if (!shopInfo || ledgerEntries.length === 0) return

    const routeName = Array.isArray(shopInfo.routes) ? shopInfo.routes[0]?.name : shopInfo.routes?.name

    // Info rows
    const infoRows: any[][] = [
      ['Shop Ledger Statement'],
      [`Generated: ${new Date().toLocaleString('en-IN')}`],
      [],
      ['Shop', shopInfo.name],
      ['Owner', shopInfo.owner_name || '-'],
      ['Contact', shopInfo.contact || '-'],
      ['Address', `${shopInfo.address || ''}${shopInfo.city ? ', ' + shopInfo.city : ''}`],
      ['Route', routeName || '-'],
      ['Payment Terms', shopInfo.payment_terms || 'Immediate'],
      ...(dateFrom || dateTo ? [['Period', `${dateFrom || '...'} to ${dateTo || '...'}`]] : []),
      [],
      ['Summary'],
      ['Total Deliveries', summary.totalDeliveries],
      ['Total Sales', summary.totalSales],
      ['Total Paid', summary.totalPaid],
      ['Outstanding', summary.totalOutstanding],
      [],
    ]

    // Header
    const header = ['Date', 'Type', 'Ref', 'Route', 'Batch/Products', 'Agent', 'Sale Amt', 'Paid', 'Balance', 'Mode', 'Status']

    // Data rows
    const dataRows = ledgerEntries.map(entry => [
      new Date(entry.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      entry.type === 'sale' ? 'Sale' : 'Payment',
      entry.ref,
      entry.route_name,
      entry.batch_numbers !== '-' ? entry.batch_numbers : (entry.type === 'payment' ? 'Manual Payment' : '-'),
      entry.agent_name,
      entry.sale_amount > 0 ? entry.sale_amount : '',
      entry.paid_amount > 0 ? entry.paid_amount : '',
      entry.running_balance,
      entry.payment_mode,
      entry.status,
    ])

    // Totals row
    const totalsRow = ['', '', '', '', '', 'TOTALS',
      summary.totalSales, summary.totalPaid, summary.totalOutstanding, '', '']

    const ws = XLSX.utils.aoa_to_sheet([...infoRows, header, ...dataRows, totalsRow])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Shop Ledger')

    const xlsxName = `${shopInfo.name.replace(/[^a-zA-Z0-9]/g, '_')}_Ledger_${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(wb, xlsxName)
  }

  return (
    <div className="space-y-4">
      {/* Shop Selector */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[250px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Shop</label>
            <select
              value={selectedShop || ''}
              onChange={(e) => onSelectShop(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            >
              <option value="">Choose a shop...</option>
              {shops.map(shop => (
                <option key={shop.id} value={shop.id}>{shop.name}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[160px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            />
          </div>
          <div className="min-w-[160px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo('') }}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Clear Dates
            </button>
          )}
        </div>
      </div>

      {!selectedShop ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="text-5xl mb-4">🏪</div>
          <p className="text-lg font-medium text-gray-600">Select a shop to view its ledger</p>
          <p className="text-sm text-gray-400 mt-1">Choose from the dropdown above to see complete financial history</p>
        </div>
      ) : loading ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="animate-spin text-4xl mb-3">⟳</div>
          <p className="text-gray-500">Loading ledger...</p>
        </div>
      ) : (
        <>
          {/* Shop Info Header */}
          {shopInfo && (
            <div className="bg-white rounded-lg shadow p-5">
              <div className="flex flex-wrap justify-between items-start gap-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{shopInfo.name}</h3>
                  <div className="text-sm text-gray-600 mt-1 space-y-0.5">
                    {shopInfo.owner_name && <p>Owner: <span className="font-medium text-gray-800">{shopInfo.owner_name}</span></p>}
                    {shopInfo.contact && <p>Contact: <span className="font-medium text-gray-800">{shopInfo.contact}</span></p>}
                    {shopInfo.address && <p>Address: {shopInfo.address}{shopInfo.city ? `, ${shopInfo.city}` : ''}</p>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <div className="text-right text-sm space-y-0.5">
                    {shopInfo.routes && (
                      <p className="text-gray-600">Route: <span className="font-medium text-gray-800">
                        {Array.isArray(shopInfo.routes) ? shopInfo.routes[0]?.name : shopInfo.routes?.name}
                      </span></p>
                    )}
                    <p className="text-gray-600">Payment Terms: <span className="font-medium text-gray-800 capitalize">{shopInfo.payment_terms || 'Immediate'}</span></p>
                    {shopInfo.credit_limit && <p className="text-gray-600">Credit Limit: <span className="font-medium text-gray-800">₹{shopInfo.credit_limit}</span></p>}
                  </div>
                  {ledgerEntries.length > 0 && (
                    <div className="flex gap-2">
                    <button
                      onClick={generatePDF}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Save PDF
                    </button>
                    <button
                      onClick={generateExcel}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Save Excel
                    </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
              <p className="text-xs text-gray-500 uppercase">Total Deliveries</p>
              <p className="text-2xl font-bold text-gray-900">{summary.totalDeliveries}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4 border-l-4 border-indigo-500">
              <p className="text-xs text-gray-500 uppercase">Total Sales</p>
              <p className="text-2xl font-bold text-indigo-700">₹{summary.totalSales.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
              <p className="text-xs text-gray-500 uppercase">Total Paid</p>
              <p className="text-2xl font-bold text-green-700">₹{summary.totalPaid.toLocaleString()}</p>
            </div>
            <div className={`bg-white rounded-lg shadow p-4 border-l-4 ${summary.totalOutstanding > 0 ? 'border-red-500' : 'border-gray-300'}`}>
              <p className="text-xs text-gray-500 uppercase">Outstanding</p>
              <p className={`text-2xl font-bold ${summary.totalOutstanding > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                ₹{summary.totalOutstanding.toLocaleString()}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
              <p className="text-xs text-gray-500 uppercase">Last Payment</p>
              <p className="text-lg font-bold text-purple-700">{summary.lastPaymentDate}</p>
            </div>
          </div>

          {/* Collection Progress */}
          {summary.totalSales > 0 && (
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600 font-medium">Collection Progress</span>
                <span className="font-semibold text-gray-900">
                  {((summary.totalPaid / summary.totalSales) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${
                    summary.totalPaid >= summary.totalSales ? 'bg-green-500' :
                    summary.totalPaid >= summary.totalSales * 0.7 ? 'bg-blue-500' :
                    summary.totalPaid >= summary.totalSales * 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min((summary.totalPaid / summary.totalSales) * 100, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>₹{summary.totalPaid.toLocaleString()} paid</span>
                <span>₹{summary.totalSales.toLocaleString()} total</span>
              </div>
            </div>
          )}

          {/* Ledger Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">
                Ledger Entries ({ledgerEntries.length})
              </h3>
              <div className="text-xs text-gray-400">
                {dateFrom || dateTo ? `Filtered: ${dateFrom || '...'} to ${dateTo || '...'}` : 'All time'}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ref</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Route</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch/Products</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sale Amt</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mode</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {ledgerEntries.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                        No ledger entries found for this shop
                      </td>
                    </tr>
                  )}
                  {ledgerEntries.map((entry) => (
                    <tr key={entry.id} className={`hover:bg-gray-50 ${entry.type === 'payment' ? 'bg-green-50/40' : ''}`}>
                      <td className="px-3 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {new Date(entry.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-xs font-mono text-gray-500">{entry.ref}</span>
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-700">{entry.route_name}</td>
                      <td className="px-3 py-3 text-sm">
                        {entry.type === 'sale' ? (
                          <div>
                            {entry.batch_numbers !== '-' && (
                              <span className="text-xs font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{entry.batch_numbers}</span>
                            )}
                            <p className="text-xs text-gray-500 mt-0.5 max-w-[200px] truncate" title={entry.products}>
                              {entry.products}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded">Manual Payment</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-600">{entry.agent_name}</td>
                      <td className="px-3 py-3 text-sm text-right font-semibold text-gray-900">
                        {entry.sale_amount > 0 ? `₹${entry.sale_amount.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-3 py-3 text-sm text-right font-semibold text-green-700">
                        {entry.paid_amount > 0 ? `₹${entry.paid_amount.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-3 py-3 text-sm text-right font-bold">
                        {entry.running_balance > 0 ? (
                          <span className="text-red-600">₹{entry.running_balance.toLocaleString()}</span>
                        ) : entry.running_balance < 0 ? (
                          <span className="text-green-600">-₹{Math.abs(entry.running_balance).toLocaleString()}</span>
                        ) : (
                          <span className="text-gray-400">₹0</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded capitalize">
                          {entry.payment_mode}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {entry.type === 'sale' ? (
                          entry.status === 'delivered' ? (
                            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-green-100 text-green-800">Paid</span>
                          ) : entry.status === 'partial' ? (
                            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-orange-100 text-orange-800">Partial</span>
                          ) : (
                            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-gray-100 text-gray-800 capitalize">{entry.status}</span>
                          )
                        ) : (
                          entry.status === 'cleared' ? (
                            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-green-100 text-green-800">Cleared</span>
                          ) : (
                            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-yellow-100 text-yellow-800">Pending</span>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {ledgerEntries.length > 0 && (
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr>
                      <td colSpan={5} className="px-3 py-3 text-sm font-semibold text-gray-700 text-right">
                        Totals:
                      </td>
                      <td className="px-3 py-3 text-sm text-right font-bold text-gray-900">
                        ₹{summary.totalSales.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-sm text-right font-bold text-green-700">
                        ₹{summary.totalPaid.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-sm text-right font-bold text-red-600">
                        ₹{summary.totalOutstanding.toLocaleString()}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Agent Ledger View - Professional ERP-level agent financial ledger
function AgentLedgerView({ 
  agents, 
  selectedAgent, 
  onSelectAgent 
}: { 
  agents: Agent[]
  selectedAgent: string | null
  onSelectAgent: (id: string | null) => void
}) {
  const supabase = createClient()
  const [agentInfo, setAgentInfo] = useState<any>(null)
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [summary, setSummary] = useState({
    totalDispatches: 0,
    totalSales: 0,
    totalCashCollected: 0,
    totalOutstanding: 0,
    totalStockAllocated: 0,
    totalStockSold: 0,
    totalStockReturned: 0,
    activeRoutes: 0,
  })

  useEffect(() => {
    if (selectedAgent) {
      fetchAgentLedger(selectedAgent)
    } else {
      setAgentInfo(null)
      setLedgerEntries([])
      setSummary({ totalDispatches: 0, totalSales: 0, totalCashCollected: 0, totalOutstanding: 0, totalStockAllocated: 0, totalStockSold: 0, totalStockReturned: 0, activeRoutes: 0 })
    }
  }, [selectedAgent, dateFrom, dateTo])

  const fetchAgentLedger = async (agentId: string) => {
    setLoading(true)
    try {
      // 1. Agent info
      const { data: agent } = await supabase
        .from('app_users')
        .select('id, name, email, phone, role, status, created_at')
        .eq('id', agentId)
        .single()
      setAgentInfo(agent)

      // 2. Routes assigned to this agent
      const { data: routes } = await supabase
        .from('routes')
        .select('id, name, area, is_active')
        .eq('agent_id', agentId)
      const routeMap: Record<string, string> = {}
      for (const r of (routes || [])) routeMap[r.id] = r.name
      const routeIds = (routes || []).map(r => r.id)

      // 3. Stock allocations
      let allocQuery = supabase
        .from('agent_stock_allocations')
        .select('id, status, notes, created_at, approved_at, completed_at')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: true })
      if (dateFrom) allocQuery = allocQuery.gte('created_at', dateFrom)
      if (dateTo) allocQuery = allocQuery.lte('created_at', dateTo + 'T23:59:59')
      const { data: allocations } = await allocQuery

      // 4. Stock items for each allocation (with their IDs for delivery_sales linking)
      const allocIds = (allocations || []).map(a => a.id)
      let itemsByAlloc: Record<string, any[]> = {}
      let allStockItemIds: string[] = []
      if (allocIds.length > 0) {
        const { data: items } = await supabase
          .from('agent_stock_items')
          .select('id, allocation_id, product_name, batch_number, quantity_allocated, quantity_sold, quantity_returned, unit')
          .in('allocation_id', allocIds)
        for (const item of (items || [])) {
          if (!itemsByAlloc[item.allocation_id]) itemsByAlloc[item.allocation_id] = []
          itemsByAlloc[item.allocation_id].push(item)
          allStockItemIds.push(item.id)
        }
      }

      // 5. Trace deliveries via: agent_stock_items -> delivery_sales -> deliveries
      // This is the accurate chain (no date-range heuristic)
      let salesByItemId: Record<string, any[]> = {}
      let allDeliveryIds = new Set<string>()
      if (allStockItemIds.length > 0) {
        const { data: salesData } = await supabase
          .from('delivery_sales')
          .select('id, delivery_id, allocation_item_id, product_name, batch_number, quantity_sold, total_amount')
          .in('allocation_item_id', allStockItemIds)
        for (const sale of (salesData || [])) {
          if (!salesByItemId[sale.allocation_item_id]) salesByItemId[sale.allocation_item_id] = []
          salesByItemId[sale.allocation_item_id].push(sale)
          if (sale.delivery_id) allDeliveryIds.add(sale.delivery_id)
        }
      }

      // Fetch full delivery records for all linked deliveries
      let deliveryMap: Record<string, any> = {}
      if (allDeliveryIds.size > 0) {
        const { data: deliveries } = await supabase
          .from('deliveries')
          .select('id, route_id, shop_id, status, expected_amount, collected_amount, delivered_at, created_at, shops(name)')
          .in('id', Array.from(allDeliveryIds))
        for (const d of (deliveries || [])) {
          deliveryMap[d.id] = d
        }
      }

      // Build item->allocation mapping for quick lookup
      let itemToAlloc: Record<string, string> = {}
      for (const allocId of Object.keys(itemsByAlloc)) {
        for (const item of itemsByAlloc[allocId]) {
          itemToAlloc[item.id] = allocId
        }
      }

      // Map delivery_ids to allocation_ids via delivery_sales -> allocation_item_id -> allocation_id
      let deliveriesByAlloc: Record<string, Set<string>> = {}
      for (const itemId of Object.keys(salesByItemId)) {
        const allocId = itemToAlloc[itemId]
        if (!allocId) continue
        if (!deliveriesByAlloc[allocId]) deliveriesByAlloc[allocId] = new Set()
        for (const sale of salesByItemId[itemId]) {
          if (sale.delivery_id) deliveriesByAlloc[allocId].add(sale.delivery_id)
        }
      }

      // 6. Build ledger entries per allocation/dispatch
      const entries: any[] = []
      let grandTotalAllocated = 0, grandTotalSold = 0, grandTotalReturned = 0

      for (const alloc of (allocations || [])) {
        const items = itemsByAlloc[alloc.id] || []
        const stockAllocated = items.reduce((s: number, i: any) => s + parseFloat(String(i.quantity_allocated || 0)), 0)
        const stockSold = items.reduce((s: number, i: any) => s + parseFloat(String(i.quantity_sold || 0)), 0)
        const stockReturned = items.reduce((s: number, i: any) => s + parseFloat(String(i.quantity_returned || 0)), 0)
        const productSummary = items.map((i: any) => `${i.product_name} x${parseFloat(i.quantity_allocated).toFixed(1)}`).join(', ')

        grandTotalAllocated += stockAllocated
        grandTotalSold += stockSold
        grandTotalReturned += stockReturned

        // Get deliveries linked to this allocation via delivery_sales chain
        const linkedDeliveryIds = deliveriesByAlloc[alloc.id] || new Set()
        const allocDeliveries = Array.from(linkedDeliveryIds).map(did => deliveryMap[did]).filter(Boolean)

        const saleAmount = allocDeliveries.reduce((s: number, d: any) => s + parseFloat(String(d.expected_amount || 0)), 0)
        const cashCollected = allocDeliveries.reduce((s: number, d: any) => s + parseFloat(String(d.collected_amount || 0)), 0)
        const shopsServed = new Set(allocDeliveries.map((d: any) => d.shop_id)).size
        const routeNames = [...new Set(allocDeliveries.map((d: any) => routeMap[d.route_id]).filter(Boolean))].join(', ')

        entries.push({
          id: alloc.id,
          date: alloc.created_at,
          dispatch_ref: alloc.id.slice(0, 8).toUpperCase(),
          route_names: routeNames || '-',
          status: alloc.status,
          stock_allocated: stockAllocated,
          stock_sold: stockSold,
          stock_returned: stockReturned,
          products: productSummary || '-',
          shops_served: shopsServed,
          sale_amount: saleAmount,
          cash_collected: cashCollected,
          outstanding: Math.max(0, saleAmount - cashCollected),
          delivery_count: allocDeliveries.length,
        })
      }

      // Sort by date descending
      entries.reverse()
      setLedgerEntries(entries)

      // Calculate overall summary from all linked deliveries
      const allDeliveries = Object.values(deliveryMap)
      const totalSales = allDeliveries.reduce((s, d) => s + parseFloat(String(d.expected_amount || 0)), 0)
      const totalCash = allDeliveries.reduce((s, d) => s + parseFloat(String(d.collected_amount || 0)), 0)

      setSummary({
        totalDispatches: (allocations || []).length,
        totalSales,
        totalCashCollected: totalCash,
        totalOutstanding: Math.max(0, totalSales - totalCash),
        totalStockAllocated: grandTotalAllocated,
        totalStockSold: grandTotalSold,
        totalStockReturned: grandTotalReturned,
        activeRoutes: (routes || []).filter(r => r.is_active).length,
      })
    } catch (err) {
      console.error('Error fetching agent ledger:', err)
    }
    setLoading(false)
  }

  const generateAgentPDF = () => {
    if (!agentInfo || ledgerEntries.length === 0) return

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pw = doc.internal.pageSize.getWidth()

    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('Agent Ledger Statement', pw / 2, 15, { align: 'center' })
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100)
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, pw / 2, 21, { align: 'center' })
    doc.setTextColor(0)

    let y = 28
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(agentInfo.name || 'Agent', 14, y); y += 6
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    if (agentInfo.email) { doc.text(`Email: ${agentInfo.email}`, 14, y); y += 4.5 }
    if (agentInfo.phone) { doc.text(`Phone: ${agentInfo.phone}`, 14, y); y += 4.5 }
    doc.text(`Active Routes: ${summary.activeRoutes}`, 14, y); y += 4.5
    if (dateFrom || dateTo) { doc.text(`Period: ${dateFrom || '...'} to ${dateTo || '...'}`, 14, y); y += 4.5 }
    y += 2

    doc.setFillColor(245, 245, 250)
    doc.roundedRect(14, y, pw - 28, 14, 2, 2, 'F')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    const items = [
      `Dispatches: ${summary.totalDispatches}`,
      `Total Sales: Rs ${summary.totalSales.toLocaleString()}`,
      `Cash Collected: Rs ${summary.totalCashCollected.toLocaleString()}`,
      `Outstanding: Rs ${summary.totalOutstanding.toLocaleString()}`,
    ]
    const sp = (pw - 28) / items.length
    items.forEach((item, i) => doc.text(item, 14 + sp * i + sp / 2, y + 9, { align: 'center' }))
    y += 20

    const tableData = ledgerEntries.map(e => [
      new Date(e.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      e.dispatch_ref,
      e.route_names,
      `${e.stock_allocated.toFixed(1)} / ${e.stock_sold.toFixed(1)} / ${e.stock_returned.toFixed(1)}`,
      String(e.shops_served),
      e.sale_amount > 0 ? `Rs ${e.sale_amount.toLocaleString()}` : '-',
      e.cash_collected > 0 ? `Rs ${e.cash_collected.toLocaleString()}` : '-',
      e.outstanding > 0 ? `Rs ${e.outstanding.toLocaleString()}` : '-',
      e.status,
    ])

    autoTable(doc, {
      startY: y,
      head: [['Date', 'Dispatch', 'Route', 'Stock (Alloc/Sold/Ret)', 'Shops', 'Sale Amt', 'Collected', 'Due', 'Status']],
      body: tableData,
      foot: [[
        '', '', '', '', 'TOTALS',
        `Rs ${summary.totalSales.toLocaleString()}`,
        `Rs ${summary.totalCashCollected.toLocaleString()}`,
        `Rs ${summary.totalOutstanding.toLocaleString()}`,
        '',
      ]],
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      footStyles: { fillColor: [243, 244, 246], textColor: [31, 41, 55], fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: { 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
    })

    const totalPages = (doc as any).getNumberOfPages()
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i)
      doc.setFontSize(7)
      doc.setTextColor(150)
      doc.text(`Page ${i} of ${totalPages} | Dairy Admin - Agent Ledger`, pw / 2, doc.internal.pageSize.getHeight() - 5, { align: 'center' })
    }

    doc.save(`${(agentInfo.name || 'Agent').replace(/[^a-zA-Z0-9]/g, '_')}_Ledger_${new Date().toISOString().split('T')[0]}.pdf`)
  }

  const generateAgentExcel = () => {
    if (!agentInfo || ledgerEntries.length === 0) return

    const infoRows: any[][] = [
      ['Agent Ledger Statement'],
      [`Generated: ${new Date().toLocaleString('en-IN')}`],
      [],
      ['Agent', agentInfo.name || 'Agent'],
      ['Email', agentInfo.email || '-'],
      ['Phone', agentInfo.phone || '-'],
      ['Active Routes', summary.activeRoutes],
      ...(dateFrom || dateTo ? [['Period', `${dateFrom || '...'} to ${dateTo || '...'}`]] : []),
      [],
      ['Summary'],
      ['Total Dispatches', summary.totalDispatches],
      ['Total Sales', summary.totalSales],
      ['Cash Collected', summary.totalCashCollected],
      ['Outstanding', summary.totalOutstanding],
      ['Stock Allocated', summary.totalStockAllocated],
      ['Stock Sold', summary.totalStockSold],
      ['Stock Returned', summary.totalStockReturned],
      [],
    ]

    const header = ['Date', 'Dispatch', 'Route', 'Stock Allocated', 'Stock Sold', 'Stock Returned', 'Shops', 'Sale Amt', 'Collected', 'Due', 'Status']

    const dataRows = ledgerEntries.map(e => [
      new Date(e.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      e.dispatch_ref,
      e.route_names,
      e.stock_allocated,
      e.stock_sold,
      e.stock_returned,
      e.shops_served,
      e.sale_amount > 0 ? e.sale_amount : '',
      e.cash_collected > 0 ? e.cash_collected : '',
      e.outstanding > 0 ? e.outstanding : '',
      e.status,
    ])

    const totalsRow = ['', '', '', '', '', '', 'TOTALS',
      summary.totalSales, summary.totalCashCollected, summary.totalOutstanding, '']

    const ws = XLSX.utils.aoa_to_sheet([...infoRows, header, ...dataRows, totalsRow])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Agent Ledger')

    const xlsxName = `${(agentInfo.name || 'Agent').replace(/[^a-zA-Z0-9]/g, '_')}_Ledger_${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(wb, xlsxName)
  }

  return (
    <div className="space-y-4">
      {/* Agent Selector + Date Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[250px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Agent</label>
            <select
              value={selectedAgent || ''}
              onChange={(e) => onSelectAgent(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            >
              <option value="">Choose an agent...</option>
              {agents.map(agent => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[160px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white" />
          </div>
          <div className="min-w-[160px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white" />
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo('') }}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
              Clear Dates
            </button>
          )}
        </div>
      </div>

      {!selectedAgent ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="text-5xl mb-4">🚚</div>
          <p className="text-lg font-medium text-gray-600">Select an agent to view their ledger</p>
          <p className="text-sm text-gray-400 mt-1">Choose from the dropdown above to see dispatch and sales history</p>
        </div>
      ) : loading ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="animate-spin text-4xl mb-3">&#x27F3;</div>
          <p className="text-gray-500">Loading agent ledger...</p>
        </div>
      ) : (
        <>
          {/* Agent Info Header */}
          {agentInfo && (
            <div className="bg-white rounded-lg shadow p-5">
              <div className="flex flex-wrap justify-between items-start gap-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{agentInfo.name}</h3>
                  <div className="text-sm text-gray-600 mt-1 space-y-0.5">
                    {agentInfo.email && <p>Email: <span className="font-medium text-gray-800">{agentInfo.email}</span></p>}
                    {agentInfo.phone && <p>Phone: <span className="font-medium text-gray-800">{agentInfo.phone}</span></p>}
                    <p>Status: <span className={`font-medium ${agentInfo.status === 'active' ? 'text-green-700' : 'text-gray-500'} capitalize`}>{agentInfo.status}</span></p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <div className="text-right text-sm space-y-0.5">
                    <p className="text-gray-600">Active Routes: <span className="font-medium text-gray-800">{summary.activeRoutes}</span></p>
                    <p className="text-gray-600">Total Dispatches: <span className="font-medium text-gray-800">{summary.totalDispatches}</span></p>
                    <p className="text-gray-600">Since: <span className="font-medium text-gray-800">
                      {new Date(agentInfo.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span></p>
                  </div>
                  {ledgerEntries.length > 0 && (
                    <div className="flex gap-2">
                    <button onClick={generateAgentPDF}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Save PDF
                    </button>
                    <button onClick={generateAgentExcel}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Save Excel
                    </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <div className="bg-white rounded-lg shadow p-3 border-l-4 border-blue-500">
              <p className="text-[10px] text-gray-500 uppercase">Dispatches</p>
              <p className="text-xl font-bold text-gray-900">{summary.totalDispatches}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-3 border-l-4 border-indigo-500">
              <p className="text-[10px] text-gray-500 uppercase">Total Sales</p>
              <p className="text-xl font-bold text-indigo-700">₹{summary.totalSales.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-3 border-l-4 border-green-500">
              <p className="text-[10px] text-gray-500 uppercase">Cash Collected</p>
              <p className="text-xl font-bold text-green-700">₹{summary.totalCashCollected.toLocaleString()}</p>
            </div>
            <div className={`bg-white rounded-lg shadow p-3 border-l-4 ${summary.totalOutstanding > 0 ? 'border-red-500' : 'border-gray-300'}`}>
              <p className="text-[10px] text-gray-500 uppercase">Outstanding</p>
              <p className={`text-xl font-bold ${summary.totalOutstanding > 0 ? 'text-red-600' : 'text-gray-400'}`}>₹{summary.totalOutstanding.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-3 border-l-4 border-cyan-500">
              <p className="text-[10px] text-gray-500 uppercase">Stock Given</p>
              <p className="text-xl font-bold text-cyan-700">{summary.totalStockAllocated.toFixed(1)}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-3 border-l-4 border-purple-500">
              <p className="text-[10px] text-gray-500 uppercase">Stock Sold</p>
              <p className="text-xl font-bold text-purple-700">{summary.totalStockSold.toFixed(1)}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-3 border-l-4 border-orange-500">
              <p className="text-[10px] text-gray-500 uppercase">Returned</p>
              <p className="text-xl font-bold text-orange-700">{summary.totalStockReturned.toFixed(1)}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-3 border-l-4 border-teal-500">
              <p className="text-[10px] text-gray-500 uppercase">Routes</p>
              <p className="text-xl font-bold text-teal-700">{summary.activeRoutes}</p>
            </div>
          </div>

          {/* Collection Progress */}
          {summary.totalSales > 0 && (
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600 font-medium">Cash Collection Rate</span>
                <span className="font-semibold text-gray-900">
                  {((summary.totalCashCollected / summary.totalSales) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div className={`h-3 rounded-full transition-all ${
                  summary.totalCashCollected >= summary.totalSales ? 'bg-green-500' :
                  summary.totalCashCollected >= summary.totalSales * 0.7 ? 'bg-blue-500' :
                  summary.totalCashCollected >= summary.totalSales * 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                }`} style={{ width: `${Math.min((summary.totalCashCollected / summary.totalSales) * 100, 100)}%` }} />
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>₹{summary.totalCashCollected.toLocaleString()} collected</span>
                <span>₹{summary.totalSales.toLocaleString()} total sales</span>
              </div>
            </div>
          )}

          {/* Stock Utilization */}
          {summary.totalStockAllocated > 0 && (
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600 font-medium">Stock Utilization</span>
                <span className="font-semibold text-gray-900">
                  {((summary.totalStockSold / summary.totalStockAllocated) * 100).toFixed(1)}% sold
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 flex overflow-hidden">
                <div className="bg-green-500 h-3 transition-all" style={{ width: `${(summary.totalStockSold / summary.totalStockAllocated) * 100}%` }} />
                <div className="bg-orange-400 h-3 transition-all" style={{ width: `${(summary.totalStockReturned / summary.totalStockAllocated) * 100}%` }} />
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span className="text-green-600">Sold: {summary.totalStockSold.toFixed(1)}</span>
                <span className="text-orange-600">Returned: {summary.totalStockReturned.toFixed(1)}</span>
                <span>Allocated: {summary.totalStockAllocated.toFixed(1)}</span>
              </div>
            </div>
          )}

          {/* Dispatch Ledger Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">Dispatch Ledger ({ledgerEntries.length})</h3>
              <div className="text-xs text-gray-400">
                {dateFrom || dateTo ? `Filtered: ${dateFrom || '...'} to ${dateTo || '...'}` : 'All time'}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dispatch</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Route</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Products</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Shops</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sale Amt</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Collected</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Due</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Stock</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {ledgerEntries.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-gray-500">No dispatch records found for this agent</td>
                    </tr>
                  )}
                  {ledgerEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-3 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {new Date(entry.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-xs font-mono text-gray-500">{entry.dispatch_ref}</span>
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-700">{entry.route_names}</td>
                      <td className="px-3 py-3 text-sm">
                        <p className="text-xs text-gray-500 max-w-[180px] truncate" title={entry.products}>{entry.products}</p>
                      </td>
                      <td className="px-3 py-3 text-sm text-center font-medium text-gray-700">{entry.shops_served}</td>
                      <td className="px-3 py-3 text-sm text-right font-semibold text-gray-900">
                        {entry.sale_amount > 0 ? `₹${entry.sale_amount.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-3 py-3 text-sm text-right font-semibold text-green-700">
                        {entry.cash_collected > 0 ? `₹${entry.cash_collected.toLocaleString()}` : '-'}
                      </td>
                      <td className="px-3 py-3 text-sm text-right font-semibold">
                        {entry.outstanding > 0 ? (
                          <span className="text-red-600">₹{entry.outstanding.toLocaleString()}</span>
                        ) : <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="text-xs leading-tight">
                          <span className="text-cyan-600">{entry.stock_allocated.toFixed(1)}</span>
                          <span className="text-gray-400"> / </span>
                          <span className="text-green-600">{entry.stock_sold.toFixed(1)}</span>
                          <span className="text-gray-400"> / </span>
                          <span className="text-orange-600">{entry.stock_returned.toFixed(1)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {entry.status === 'completed' ? (
                          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-green-100 text-green-800">Done</span>
                        ) : entry.status === 'in_delivery' ? (
                          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-100 text-blue-800">Active</span>
                        ) : entry.status === 'picked_up' ? (
                          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-yellow-100 text-yellow-800">Picked</span>
                        ) : entry.status === 'returned' ? (
                          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-orange-100 text-orange-800">Returned</span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-gray-100 text-gray-800 capitalize">{entry.status}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {ledgerEntries.length > 0 && (
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr>
                      <td colSpan={5} className="px-3 py-3 text-sm font-semibold text-gray-700 text-right">Totals:</td>
                      <td className="px-3 py-3 text-sm text-right font-bold text-gray-900">₹{summary.totalSales.toLocaleString()}</td>
                      <td className="px-3 py-3 text-sm text-right font-bold text-green-700">₹{summary.totalCashCollected.toLocaleString()}</td>
                      <td className="px-3 py-3 text-sm text-right font-bold text-red-600">₹{summary.totalOutstanding.toLocaleString()}</td>
                      <td className="px-3 py-3 text-center text-xs font-bold">
                        <span className="text-cyan-600">{summary.totalStockAllocated.toFixed(1)}</span>
                        <span className="text-gray-400"> / </span>
                        <span className="text-green-600">{summary.totalStockSold.toFixed(1)}</span>
                        <span className="text-gray-400"> / </span>
                        <span className="text-orange-600">{summary.totalStockReturned.toFixed(1)}</span>
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Add Payment View Component
function AddPaymentView({ 
  shops, 
  agents, 
  onSuccess 
}: { 
  shops: Shop[]
  agents: Agent[]
  onSuccess: () => void
}) {
  const supabase = createClient()
  const [formData, setFormData] = useState({
    shop_id: '',
    agent_id: '',
    amount: '',
    mode: 'cash',
    reference: '',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.shop_id || !formData.amount || parseFloat(formData.amount) <= 0) {
      setError('Please select a shop and enter a valid amount')
      return
    }

    setSubmitting(true)
    try {
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

      const shopData = shops.find(s => s.id === formData.shop_id)

      const { error: insertError } = await supabase
        .from('ledger_entries')
        .insert({
          from_account: shopData?.name || 'Unknown Shop',
          to_account: 'company_cash',
          amount: parseFloat(formData.amount),
          mode: formData.mode,
          reference: formData.reference || null,
          cleared: false,
          created_by: adminId,
        })

      if (insertError) throw insertError

      alert('Payment recorded successfully!')
      onSuccess()
    } catch (err: any) {
      setError(err.message || 'Failed to record payment')
    }
    setSubmitting(false)
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 max-w-2xl">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">➕ Add New Payment</h3>
      
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Shop Name *</label>
          <select
            value={formData.shop_id}
            onChange={(e) => setFormData({ ...formData, shop_id: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            required
          >
            <option value="">Select shop...</option>
            {shops.map(shop => (
              <option key={shop.id} value={shop.id}>{shop.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Agent (Optional)</label>
          <select
            value={formData.agent_id}
            onChange={(e) => setFormData({ ...formData, agent_id: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
          >
            <option value="">Select agent...</option>
            {agents.map(agent => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Amount Received *</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={formData.amount}
            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            placeholder="0.00"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode *</label>
          <select
            value={formData.mode}
            onChange={(e) => setFormData({ ...formData, mode: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            required
          >
            <option value="cash">Cash (Offline)</option>
            <option value="upi">UPI</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="adjustment">Adjustment</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reference Number (Optional)</label>
          <input
            type="text"
            value={formData.reference}
            onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            placeholder="Transaction ID, check number, etc."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            rows={3}
            placeholder="Additional information..."
          />
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {submitting ? 'Recording...' : 'Record Payment'}
          </button>
        </div>
      </form>
    </div>
  )
}
