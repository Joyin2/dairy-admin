'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

// ==================== INTERFACES ====================
interface Employee {
  id: string
  employee_code: string
  name: string
  role: string
  phone: string
  email: string
  address: string
  joining_date: string
  salary_type: string
  basic_salary: number
  incentive_structure: string
  status: string
  created_at: string
  updated_at: string
}

interface SalaryPayment {
  id: string
  employee_id: string
  month: string
  basic_amount: number
  incentive_amount: number
  overtime_amount: number
  deduction_advance: number
  deduction_penalty: number
  deduction_leave: number
  net_payable: number
  amount_paid: number
  payment_date: string
  payment_mode: string
  notes: string
  status: string
  created_at: string
}

interface MiscExpense {
  id: string
  category: string
  description: string
  amount: number
  expense_date: string
  paid_to: string
  payment_mode: string
  notes: string
  created_at: string
}

interface Professional {
  id: string
  name: string
  service_type: string
  contract_type: string
  agreed_fee: number
  contact_phone: string
  contact_email: string
  status: string
  created_at: string
}

interface ProfPayment {
  id: string
  professional_id: string
  service_description: string
  invoice_number: string
  amount: number
  tds_deduction: number
  net_amount: number
  payment_date: string
  payment_mode: string
  notes: string
  created_at: string
}

type TabId = 'dashboard' | 'employees' | 'salary' | 'misc-expenses' | 'professionals' | 'expense-ledger'

// ==================== MAIN PAGE ====================
export default function EmployeesPage() {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
  const [loading, setLoading] = useState(true)

  const [employees, setEmployees] = useState<Employee[]>([])
  const [salaryPayments, setSalaryPayments] = useState<SalaryPayment[]>([])
  const [miscExpenses, setMiscExpenses] = useState<MiscExpense[]>([])
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [profPayments, setProfPayments] = useState<ProfPayment[]>([])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [empRes, salRes, miscRes, profRes, profPayRes] = await Promise.all([
        supabase.from('employees').select('*').order('created_at', { ascending: false }),
        supabase.from('salary_payments').select('*').order('created_at', { ascending: false }),
        supabase.from('misc_expenses').select('*').order('expense_date', { ascending: false }),
        supabase.from('professionals').select('*').order('created_at', { ascending: false }),
        supabase.from('professional_payments').select('*').order('payment_date', { ascending: false }),
      ])
      setEmployees(empRes.data || [])
      setSalaryPayments(salRes.data || [])
      setMiscExpenses(miscRes.data || [])
      setProfessionals(profRes.data || [])
      setProfPayments(profPayRes.data || [])
    } catch (err) {
      console.error('Error fetching data:', err)
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const tabs: { id: TabId; label: string }[] = [
    { id: 'dashboard', label: '📊 Dashboard' },
    { id: 'employees', label: '👥 Employees' },
    { id: 'salary', label: '💰 Salary & Payments' },
    { id: 'misc-expenses', label: '🧾 Misc Expenses' },
    { id: 'professionals', label: '🧑‍💼 Professional Services' },
    { id: 'expense-ledger', label: '📒 Expense Ledger' },
  ]

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🏢 Employee & Expense Management</h1>
          <p className="text-sm text-gray-500 mt-1">Professional HR, Payroll & Expense tracking system</p>
        </div>
        <button onClick={fetchData} disabled={loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
          ↻ Refresh
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
              activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading && activeTab === 'dashboard' ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <>
          {activeTab === 'dashboard' && (
            <HRDashboardView employees={employees} salaryPayments={salaryPayments} miscExpenses={miscExpenses} professionals={professionals} profPayments={profPayments} />
          )}
          {activeTab === 'employees' && (
            <EmployeesView employees={employees} onRefresh={fetchData} />
          )}
          {activeTab === 'salary' && (
            <SalaryView employees={employees} salaryPayments={salaryPayments} onRefresh={fetchData} />
          )}
          {activeTab === 'misc-expenses' && (
            <MiscExpensesView expenses={miscExpenses} onRefresh={fetchData} />
          )}
          {activeTab === 'professionals' && (
            <ProfessionalServicesView professionals={professionals} profPayments={profPayments} onRefresh={fetchData} />
          )}
          {activeTab === 'expense-ledger' && (
            <ExpenseLedgerView salaryPayments={salaryPayments} miscExpenses={miscExpenses} profPayments={profPayments} employees={employees} professionals={professionals} />
          )}
        </>
      )}
    </div>
  )
}

// ==================== DASHBOARD VIEW ====================
function HRDashboardView({ employees, salaryPayments, miscExpenses, professionals, profPayments }: {
  employees: Employee[]; salaryPayments: SalaryPayment[]; miscExpenses: MiscExpense[]; professionals: Professional[]; profPayments: ProfPayment[]
}) {
  const currentMonth = new Date().toISOString().slice(0, 7)
  const activeEmployees = employees.filter(e => e.status === 'active')
  const thisMonthSalaries = salaryPayments.filter(s => s.month === currentMonth)
  const salaryPayable = activeEmployees.reduce((s, e) => s + parseFloat(String(e.basic_salary || 0)), 0)
  const totalPaid = thisMonthSalaries.reduce((s, p) => s + parseFloat(String(p.amount_paid || 0)), 0)
  const pendingSalary = Math.max(0, salaryPayable - totalPaid)
  const totalMiscExpenses = miscExpenses.reduce((s, e) => s + parseFloat(String(e.amount || 0)), 0)
  const totalProfFees = profPayments.reduce((s, p) => s + parseFloat(String(p.net_amount || 0)), 0)

  const cards = [
    { label: 'Total Employees', value: activeEmployees.length, color: 'blue', prefix: '' },
    { label: 'Salary Payable (This Month)', value: salaryPayable, color: 'indigo', prefix: '₹' },
    { label: 'Total Paid (This Month)', value: totalPaid, color: 'green', prefix: '₹' },
    { label: 'Pending Salary', value: pendingSalary, color: pendingSalary > 0 ? 'red' : 'gray', prefix: '₹' },
    { label: 'Total Other Expenses', value: totalMiscExpenses, color: 'orange', prefix: '₹' },
    { label: 'Total Professional Fees', value: totalProfFees, color: 'purple', prefix: '₹' },
  ]

  const colorMap: Record<string, string> = {
    blue: 'border-blue-500 text-blue-700',
    indigo: 'border-indigo-500 text-indigo-700',
    green: 'border-green-500 text-green-700',
    red: 'border-red-500 text-red-600',
    gray: 'border-gray-300 text-gray-400',
    orange: 'border-orange-500 text-orange-700',
    purple: 'border-purple-500 text-purple-700',
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {cards.map((card) => (
          <div key={card.label} className={`bg-white rounded-lg shadow p-4 border-l-4 ${colorMap[card.color]}`}>
            <p className="text-[10px] text-gray-500 uppercase font-medium">{card.label}</p>
            <p className={`text-xl font-bold mt-1 ${colorMap[card.color].split(' ')[1]}`}>
              {card.prefix}{typeof card.value === 'number' && card.prefix ? card.value.toLocaleString() : card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Employees by Role</h3>
          {Object.entries(employees.reduce((acc: Record<string, number>, e) => {
            acc[e.role] = (acc[e.role] || 0) + 1; return acc
          }, {})).map(([role, count]) => (
            <div key={role} className="flex justify-between items-center py-1.5 border-b border-gray-100 last:border-0">
              <span className="text-sm text-gray-700 capitalize">{role}</span>
              <span className="text-sm font-semibold text-gray-900">{count}</span>
            </div>
          ))}
          {employees.length === 0 && <p className="text-sm text-gray-400">No employees yet</p>}
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Expenses</h3>
          {miscExpenses.slice(0, 5).map((exp) => (
            <div key={exp.id} className="flex justify-between items-center py-1.5 border-b border-gray-100 last:border-0">
              <div>
                <span className="text-sm text-gray-700 capitalize">{exp.category.replace('_', ' ')}</span>
                {exp.description && <span className="text-xs text-gray-400 ml-2">- {exp.description}</span>}
              </div>
              <span className="text-sm font-semibold text-gray-900">₹{parseFloat(String(exp.amount)).toLocaleString()}</span>
            </div>
          ))}
          {miscExpenses.length === 0 && <p className="text-sm text-gray-400">No expenses recorded</p>}
        </div>
      </div>
    </div>
  )
}

// ==================== EMPLOYEES VIEW ====================
function EmployeesView({ employees, onRefresh }: { employees: Employee[]; onRefresh: () => void }) {
  const supabase = createClient()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    name: '', role: 'General', phone: '', email: '', address: '',
    joining_date: new Date().toISOString().split('T')[0],
    salary_type: 'fixed_monthly', basic_salary: '', incentive_structure: '', status: 'active',
  })

  const resetForm = () => {
    setForm({ name: '', role: 'General', phone: '', email: '', address: '',
      joining_date: new Date().toISOString().split('T')[0],
      salary_type: 'fixed_monthly', basic_salary: '', incentive_structure: '', status: 'active' })
    setEditingId(null)
  }

  const handleEdit = (emp: Employee) => {
    setForm({
      name: emp.name, role: emp.role, phone: emp.phone || '', email: emp.email || '',
      address: emp.address || '', joining_date: emp.joining_date || '',
      salary_type: emp.salary_type, basic_salary: String(emp.basic_salary || ''),
      incentive_structure: emp.incentive_structure || '', status: emp.status,
    })
    setEditingId(emp.id)
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return alert('Employee name is required')
    setSubmitting(true)
    try {
      const payload = {
        name: form.name.trim(), role: form.role, phone: form.phone || null, email: form.email || null,
        address: form.address || null, joining_date: form.joining_date || null,
        salary_type: form.salary_type, basic_salary: parseFloat(form.basic_salary) || 0,
        incentive_structure: form.incentive_structure || null, status: form.status,
      }
      if (editingId) {
        const { error } = await supabase.from('employees').update(payload).eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('employees').insert(payload)
        if (error) throw error
      }
      resetForm()
      setShowForm(false)
      onRefresh()
    } catch (err: any) {
      alert(err.message || 'Error saving employee')
    }
    setSubmitting(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Employees ({employees.length})</h3>
        <button onClick={() => { resetForm(); setShowForm(!showForm) }}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${showForm ? 'bg-gray-200 text-gray-700' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
          {showForm ? 'Cancel' : '+ Add Employee'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-5 space-y-4">
          <h4 className="font-semibold text-gray-900">{editingId ? 'Edit Employee' : 'Add New Employee'}</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Employee Name *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500">
                {['General', 'Sales', 'Delivery Agent', 'Accountant', 'Manager', 'Supervisor', 'Factory Worker', 'Driver', 'Other'].map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input type="text" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
              <input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Joining Date</label>
              <input type="date" value={form.joining_date} onChange={e => setForm({ ...form, joining_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Salary Type</label>
              <select value={form.salary_type} onChange={e => setForm({ ...form, salary_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500">
                <option value="fixed_monthly">Fixed Monthly</option>
                <option value="daily_wage">Daily Wage</option>
                <option value="commission_based">Commission Based</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Basic Salary (₹)</label>
              <input type="number" step="0.01" value={form.basic_salary} onChange={e => setForm({ ...form, basic_salary: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Incentive Structure</label>
            <textarea value={form.incentive_structure} onChange={e => setForm({ ...form, incentive_structure: e.target.value })}
              rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500" placeholder="Describe incentive rules..." />
          </div>
          <button type="submit" disabled={submitting}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
            {submitting ? 'Saving...' : editingId ? 'Update Employee' : 'Add Employee'}
          </button>
        </form>
      )}

      {/* Employee Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Salary Type</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Basic Salary</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joined</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {employees.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">No employees added yet</td></tr>
              )}
              {employees.map(emp => (
                <tr key={emp.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3 text-sm font-mono text-gray-500">{emp.employee_code}</td>
                  <td className="px-3 py-3 text-sm font-medium text-gray-900">{emp.name}</td>
                  <td className="px-3 py-3 text-sm text-gray-700">{emp.role}</td>
                  <td className="px-3 py-3 text-sm text-gray-600">{emp.phone || '-'}</td>
                  <td className="px-3 py-3 text-sm text-gray-600 capitalize">{emp.salary_type.replace('_', ' ')}</td>
                  <td className="px-3 py-3 text-sm text-right font-semibold text-gray-900">₹{parseFloat(String(emp.basic_salary)).toLocaleString()}</td>
                  <td className="px-3 py-3 text-center">
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded ${emp.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {emp.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-600">
                    {emp.joining_date ? new Date(emp.joining_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button onClick={() => handleEdit(emp)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ==================== SALARY & PAYMENTS VIEW ====================
function SalaryView({ employees, salaryPayments, onRefresh }: {
  employees: Employee[]; salaryPayments: SalaryPayment[]; onRefresh: () => void
}) {
  const supabase = createClient()
  const [selectedEmp, setSelectedEmp] = useState<string>('')
  const [showPayForm, setShowPayForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const currentMonth = new Date().toISOString().slice(0, 7)
  const [payForm, setPayForm] = useState({
    month: currentMonth, basic_amount: '', incentive_amount: '', overtime_amount: '',
    deduction_advance: '', deduction_penalty: '', deduction_leave: '',
    amount_paid: '', payment_date: new Date().toISOString().split('T')[0],
    payment_mode: 'cash', notes: '',
  })

  const emp = employees.find(e => e.id === selectedEmp)
  const empPayments = salaryPayments.filter(s => s.employee_id === selectedEmp).sort((a, b) => b.month.localeCompare(a.month))

  const handleAutoFill = () => {
    if (emp) {
      setPayForm(prev => ({ ...prev, basic_amount: String(emp.basic_salary || 0) }))
    }
  }

  useEffect(() => {
    if (emp) handleAutoFill()
  }, [selectedEmp])

  const calcNet = () => {
    const basic = parseFloat(payForm.basic_amount) || 0
    const incentive = parseFloat(payForm.incentive_amount) || 0
    const overtime = parseFloat(payForm.overtime_amount) || 0
    const dedAdv = parseFloat(payForm.deduction_advance) || 0
    const dedPen = parseFloat(payForm.deduction_penalty) || 0
    const dedLeave = parseFloat(payForm.deduction_leave) || 0
    return basic + incentive + overtime - dedAdv - dedPen - dedLeave
  }

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEmp) return alert('Select an employee')
    const netPayable = calcNet()
    const amtPaid = parseFloat(payForm.amount_paid) || 0
    if (amtPaid <= 0) return alert('Enter amount paid')
    setSubmitting(true)
    try {
      const status = amtPaid >= netPayable ? 'paid' : amtPaid > 0 ? 'partial' : 'pending'
      const { error } = await supabase.from('salary_payments').insert({
        employee_id: selectedEmp,
        month: payForm.month,
        basic_amount: parseFloat(payForm.basic_amount) || 0,
        incentive_amount: parseFloat(payForm.incentive_amount) || 0,
        overtime_amount: parseFloat(payForm.overtime_amount) || 0,
        deduction_advance: parseFloat(payForm.deduction_advance) || 0,
        deduction_penalty: parseFloat(payForm.deduction_penalty) || 0,
        deduction_leave: parseFloat(payForm.deduction_leave) || 0,
        net_payable: netPayable,
        amount_paid: amtPaid,
        payment_date: payForm.payment_date || null,
        payment_mode: payForm.payment_mode,
        notes: payForm.notes || null,
        status,
      })
      if (error) throw error
      alert('Salary payment recorded!')
      setShowPayForm(false)
      setPayForm({ month: currentMonth, basic_amount: String(emp?.basic_salary || 0), incentive_amount: '', overtime_amount: '',
        deduction_advance: '', deduction_penalty: '', deduction_leave: '',
        amount_paid: '', payment_date: new Date().toISOString().split('T')[0], payment_mode: 'cash', notes: '' })
      onRefresh()
    } catch (err: any) { alert(err.message || 'Error') }
    setSubmitting(false)
  }

  // Running balance
  const sortedPayments = [...empPayments].sort((a, b) => a.month.localeCompare(b.month))
  let runBal = 0
  const withBalance = sortedPayments.map(p => {
    runBal += parseFloat(String(p.net_payable || 0)) - parseFloat(String(p.amount_paid || 0))
    return { ...p, balance: runBal }
  }).reverse()

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[250px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Employee</label>
            <select value={selectedEmp} onChange={e => setSelectedEmp(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-blue-500">
              <option value="">Choose an employee...</option>
              {employees.filter(e => e.status === 'active').map(e => (
                <option key={e.id} value={e.id}>{e.employee_code} - {e.name} ({e.role})</option>
              ))}
            </select>
          </div>
          {selectedEmp && (
            <button onClick={() => setShowPayForm(!showPayForm)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${showPayForm ? 'bg-gray-200 text-gray-700' : 'bg-green-600 hover:bg-green-700 text-white'}`}>
              {showPayForm ? 'Cancel' : '+ Process Salary'}
            </button>
          )}
        </div>
      </div>

      {selectedEmp && emp && (
        <>
          {/* Employee Summary */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex flex-wrap gap-6">
              <div><p className="text-xs text-gray-500">Employee</p><p className="text-sm font-semibold text-gray-900">{emp.name} ({emp.employee_code})</p></div>
              <div><p className="text-xs text-gray-500">Role</p><p className="text-sm font-medium text-gray-800">{emp.role}</p></div>
              <div><p className="text-xs text-gray-500">Salary Type</p><p className="text-sm font-medium text-gray-800 capitalize">{emp.salary_type.replace('_', ' ')}</p></div>
              <div><p className="text-xs text-gray-500">Basic Salary</p><p className="text-sm font-bold text-indigo-700">₹{parseFloat(String(emp.basic_salary)).toLocaleString()}</p></div>
              <div><p className="text-xs text-gray-500">Total Paid (All Time)</p><p className="text-sm font-bold text-green-700">₹{empPayments.reduce((s, p) => s + parseFloat(String(p.amount_paid || 0)), 0).toLocaleString()}</p></div>
              <div><p className="text-xs text-gray-500">Pending Balance</p><p className="text-sm font-bold text-red-600">₹{Math.max(0, withBalance[0]?.balance || 0).toLocaleString()}</p></div>
            </div>
          </div>

          {showPayForm && (
            <form onSubmit={handlePaySubmit} className="bg-white rounded-lg shadow p-5 space-y-4">
              <h4 className="font-semibold text-gray-900">Process Salary for {emp.name}</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Month *</label>
                  <input type="month" value={payForm.month} onChange={e => setPayForm({ ...payForm, month: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Basic Amount</label>
                  <input type="number" step="0.01" value={payForm.basic_amount} onChange={e => setPayForm({ ...payForm, basic_amount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Incentives</label>
                  <input type="number" step="0.01" value={payForm.incentive_amount} onChange={e => setPayForm({ ...payForm, incentive_amount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Overtime</label>
                  <input type="number" step="0.01" value={payForm.overtime_amount} onChange={e => setPayForm({ ...payForm, overtime_amount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ded: Advance</label>
                  <input type="number" step="0.01" value={payForm.deduction_advance} onChange={e => setPayForm({ ...payForm, deduction_advance: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ded: Penalty</label>
                  <input type="number" step="0.01" value={payForm.deduction_penalty} onChange={e => setPayForm({ ...payForm, deduction_penalty: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ded: Leave</label>
                  <input type="number" step="0.01" value={payForm.deduction_leave} onChange={e => setPayForm({ ...payForm, deduction_leave: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" />
                </div>
                <div className="bg-indigo-50 rounded-lg p-2 flex flex-col justify-center">
                  <p className="text-xs text-indigo-600 font-medium">Net Payable</p>
                  <p className="text-lg font-bold text-indigo-800">₹{calcNet().toLocaleString()}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Amount Paid *</label>
                  <input type="number" step="0.01" value={payForm.amount_paid} onChange={e => setPayForm({ ...payForm, amount_paid: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Payment Date</label>
                  <input type="date" value={payForm.payment_date} onChange={e => setPayForm({ ...payForm, payment_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Payment Mode</label>
                  <select value={payForm.payment_mode} onChange={e => setPayForm({ ...payForm, payment_mode: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white">
                    <option value="cash">Cash</option><option value="bank">Bank</option><option value="upi">UPI</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                  <input type="text" value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" />
                </div>
              </div>
              <button type="submit" disabled={submitting}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
                {submitting ? 'Recording...' : 'Record Payment'}
              </button>
            </form>
          )}

          {/* Payment History */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-4 border-b"><h4 className="font-semibold text-gray-900">Payment History ({empPayments.length})</h4></div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Basic</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Incentive</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Overtime</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Deductions</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Net Payable</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Mode</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {withBalance.length === 0 && (
                    <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-500">No salary payments recorded</td></tr>
                  )}
                  {withBalance.map(p => {
                    const totalDed = parseFloat(String(p.deduction_advance || 0)) + parseFloat(String(p.deduction_penalty || 0)) + parseFloat(String(p.deduction_leave || 0))
                    return (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-3 py-3 text-sm font-medium text-gray-900">{p.month}</td>
                        <td className="px-3 py-3 text-sm text-right text-gray-700">₹{parseFloat(String(p.basic_amount)).toLocaleString()}</td>
                        <td className="px-3 py-3 text-sm text-right text-gray-700">{parseFloat(String(p.incentive_amount)) > 0 ? `₹${parseFloat(String(p.incentive_amount)).toLocaleString()}` : '-'}</td>
                        <td className="px-3 py-3 text-sm text-right text-gray-700">{parseFloat(String(p.overtime_amount)) > 0 ? `₹${parseFloat(String(p.overtime_amount)).toLocaleString()}` : '-'}</td>
                        <td className="px-3 py-3 text-sm text-right text-red-600">{totalDed > 0 ? `-₹${totalDed.toLocaleString()}` : '-'}</td>
                        <td className="px-3 py-3 text-sm text-right font-semibold text-gray-900">₹{parseFloat(String(p.net_payable)).toLocaleString()}</td>
                        <td className="px-3 py-3 text-sm text-right font-semibold text-green-700">₹{parseFloat(String(p.amount_paid)).toLocaleString()}</td>
                        <td className="px-3 py-3 text-sm text-right font-semibold">
                          {p.balance > 0 ? <span className="text-red-600">₹{p.balance.toLocaleString()}</span> : <span className="text-gray-400">0</span>}
                        </td>
                        <td className="px-3 py-3 text-sm text-center capitalize text-gray-600">{p.payment_mode}</td>
                        <td className="px-3 py-3 text-center">
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded ${
                            p.status === 'paid' ? 'bg-green-100 text-green-800' : p.status === 'partial' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                          }`}>{p.status}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!selectedEmp && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="text-5xl mb-4">💰</div>
          <p className="text-lg font-medium text-gray-600">Select an employee to process salary</p>
          <p className="text-sm text-gray-400 mt-1">Choose from the dropdown above</p>
        </div>
      )}
    </div>
  )
}

// ==================== MISC EXPENSES VIEW ====================
function MiscExpensesView({ expenses, onRefresh }: { expenses: MiscExpense[]; onRefresh: () => void }) {
  const supabase = createClient()
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [filterCat, setFilterCat] = useState('')
  const [form, setForm] = useState({
    category: 'others', description: '', amount: '', expense_date: new Date().toISOString().split('T')[0],
    paid_to: '', payment_mode: 'cash', notes: '',
  })

  const categories = ['electricity', 'fuel', 'internet', 'rent', 'maintenance', 'office_supplies', 'travel', 'others']
  const filtered = filterCat ? expenses.filter(e => e.category === filterCat) : expenses
  const totalFiltered = filtered.reduce((s, e) => s + parseFloat(String(e.amount || 0)), 0)

  // Summary by category
  const catSummary: Record<string, number> = {}
  for (const exp of expenses) {
    catSummary[exp.category] = (catSummary[exp.category] || 0) + parseFloat(String(exp.amount || 0))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.amount || parseFloat(form.amount) <= 0) return alert('Enter a valid amount')
    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      let adminId = null
      if (user) {
        const { data: appUser } = await supabase.from('app_users').select('id').eq('auth_uid', user.id).single()
        adminId = appUser?.id
      }
      const { error } = await supabase.from('misc_expenses').insert({
        category: form.category, description: form.description || null,
        amount: parseFloat(form.amount), expense_date: form.expense_date,
        paid_to: form.paid_to || null, payment_mode: form.payment_mode,
        notes: form.notes || null, created_by: adminId,
      })
      if (error) throw error
      alert('Expense recorded!')
      setShowForm(false)
      setForm({ category: 'others', description: '', amount: '', expense_date: new Date().toISOString().split('T')[0], paid_to: '', payment_mode: 'cash', notes: '' })
      onRefresh()
    } catch (err: any) { alert(err.message || 'Error') }
    setSubmitting(false)
  }

  return (
    <div className="space-y-4">
      {/* Category Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {categories.map(cat => (
          <button key={cat} onClick={() => setFilterCat(filterCat === cat ? '' : cat)}
            className={`bg-white rounded-lg shadow p-3 text-left transition-colors border-l-4 ${
              filterCat === cat ? 'border-blue-600 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-400'
            }`}>
            <p className="text-[10px] text-gray-500 uppercase capitalize">{cat.replace('_', ' ')}</p>
            <p className="text-sm font-bold text-gray-900">₹{(catSummary[cat] || 0).toLocaleString()}</p>
          </button>
        ))}
      </div>

      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">
          Expenses ({filtered.length}) {filterCat && <span className="text-sm font-normal text-blue-600 capitalize">- {filterCat.replace('_', ' ')}</span>}
          <span className="text-sm font-normal text-gray-500 ml-2">Total: ₹{totalFiltered.toLocaleString()}</span>
        </h3>
        <div className="flex gap-2">
          {filterCat && (
            <button onClick={() => setFilterCat('')} className="px-3 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Clear Filter</button>
          )}
          <button onClick={() => setShowForm(!showForm)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${showForm ? 'bg-gray-200 text-gray-700' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
            {showForm ? 'Cancel' : '+ Add Expense'}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-5 space-y-4">
          <h4 className="font-semibold text-gray-900">Record New Expense</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category *</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white">
                {categories.map(c => <option key={c} value={c} className="capitalize">{c.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₹) *</label>
              <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
              <input type="date" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Paid To</label>
              <input type="text" value={form.paid_to} onChange={e => setForm({ ...form, paid_to: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Payment Mode</label>
              <select value={form.payment_mode} onChange={e => setForm({ ...form, payment_mode: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white">
                <option value="cash">Cash</option><option value="bank">Bank</option><option value="upi">UPI</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" />
          </div>
          <button type="submit" disabled={submitting}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
            {submitting ? 'Saving...' : 'Record Expense'}
          </button>
        </form>
      )}

      {/* Expense Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paid To</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Mode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No expenses found</td></tr>
              )}
              {filtered.map(exp => (
                <tr key={exp.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3 text-sm text-gray-600">{new Date(exp.expense_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td className="px-3 py-3"><span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-100 text-blue-800 capitalize">{exp.category.replace('_', ' ')}</span></td>
                  <td className="px-3 py-3 text-sm text-gray-700">{exp.description || '-'}</td>
                  <td className="px-3 py-3 text-sm text-gray-600">{exp.paid_to || '-'}</td>
                  <td className="px-3 py-3 text-sm text-right font-semibold text-gray-900">₹{parseFloat(String(exp.amount)).toLocaleString()}</td>
                  <td className="px-3 py-3 text-sm text-center capitalize text-gray-600">{exp.payment_mode}</td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-sm font-semibold text-gray-700 text-right">Total:</td>
                  <td className="px-3 py-3 text-sm text-right font-bold text-gray-900">₹{totalFiltered.toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}

// ==================== PROFESSIONAL SERVICES VIEW ====================
function ProfessionalServicesView({ professionals, profPayments, onRefresh }: {
  professionals: Professional[]; profPayments: ProfPayment[]; onRefresh: () => void
}) {
  const supabase = createClient()
  const [showProfForm, setShowProfForm] = useState(false)
  const [showPayForm, setShowPayForm] = useState(false)
  const [selectedProf, setSelectedProf] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [profForm, setProfForm] = useState({
    name: '', service_type: '', contract_type: 'monthly', agreed_fee: '',
    contact_phone: '', contact_email: '', status: 'active',
  })
  const [payForm, setPayForm] = useState({
    service_description: '', invoice_number: '', amount: '', tds_deduction: '',
    payment_date: new Date().toISOString().split('T')[0], payment_mode: 'bank', notes: '',
  })

  const handleAddProf = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profForm.name.trim() || !profForm.service_type.trim()) return alert('Name and service type are required')
    setSubmitting(true)
    try {
      const { error } = await supabase.from('professionals').insert({
        name: profForm.name.trim(), service_type: profForm.service_type.trim(),
        contract_type: profForm.contract_type, agreed_fee: parseFloat(profForm.agreed_fee) || 0,
        contact_phone: profForm.contact_phone || null, contact_email: profForm.contact_email || null,
        status: profForm.status,
      })
      if (error) throw error
      alert('Professional added!')
      setShowProfForm(false)
      setProfForm({ name: '', service_type: '', contract_type: 'monthly', agreed_fee: '', contact_phone: '', contact_email: '', status: 'active' })
      onRefresh()
    } catch (err: any) { alert(err.message || 'Error') }
    setSubmitting(false)
  }

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProf || !payForm.amount || parseFloat(payForm.amount) <= 0) return alert('Select professional and enter amount')
    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      let adminId = null
      if (user) {
        const { data: appUser } = await supabase.from('app_users').select('id').eq('auth_uid', user.id).single()
        adminId = appUser?.id
      }
      const amt = parseFloat(payForm.amount) || 0
      const tds = parseFloat(payForm.tds_deduction) || 0
      const { error } = await supabase.from('professional_payments').insert({
        professional_id: selectedProf,
        service_description: payForm.service_description || null,
        invoice_number: payForm.invoice_number || null,
        amount: amt, tds_deduction: tds, net_amount: amt - tds,
        payment_date: payForm.payment_date, payment_mode: payForm.payment_mode,
        notes: payForm.notes || null, created_by: adminId,
      })
      if (error) throw error
      alert('Payment recorded!')
      setShowPayForm(false)
      setPayForm({ service_description: '', invoice_number: '', amount: '', tds_deduction: '', payment_date: new Date().toISOString().split('T')[0], payment_mode: 'bank', notes: '' })
      onRefresh()
    } catch (err: any) { alert(err.message || 'Error') }
    setSubmitting(false)
  }

  const selectedProfData = professionals.find(p => p.id === selectedProf)
  const selectedPayments = profPayments.filter(p => p.professional_id === selectedProf)
  const totalPaidToSelected = selectedPayments.reduce((s, p) => s + parseFloat(String(p.net_amount || 0)), 0)

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Professional Services ({professionals.length})</h3>
        <button onClick={() => setShowProfForm(!showProfForm)}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${showProfForm ? 'bg-gray-200 text-gray-700' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
          {showProfForm ? 'Cancel' : '+ Add Professional'}
        </button>
      </div>

      {showProfForm && (
        <form onSubmit={handleAddProf} className="bg-white rounded-lg shadow p-5 space-y-4">
          <h4 className="font-semibold text-gray-900">Add New Professional</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input type="text" value={profForm.name} onChange={e => setProfForm({ ...profForm, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Service Type *</label>
              <select value={profForm.service_type} onChange={e => setProfForm({ ...profForm, service_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" required>
                <option value="">Select...</option>
                {['CA (Chartered Accountant)', 'Engineer', 'Legal Advisor', 'Consultant', 'Auditor', 'IT Services', 'Other'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contract Type</label>
              <select value={profForm.contract_type} onChange={e => setProfForm({ ...profForm, contract_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white">
                <option value="monthly">Monthly</option><option value="per_project">Per Project</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Agreed Fee (₹)</label>
              <input type="number" step="0.01" value={profForm.agreed_fee} onChange={e => setProfForm({ ...profForm, agreed_fee: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input type="text" value={profForm.contact_phone} onChange={e => setProfForm({ ...profForm, contact_phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input type="email" value={profForm.contact_email} onChange={e => setProfForm({ ...profForm, contact_email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" />
            </div>
          </div>
          <button type="submit" disabled={submitting}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
            {submitting ? 'Saving...' : 'Add Professional'}
          </button>
        </form>
      )}

      {/* Professionals Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Service Type</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contract</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Agreed Fee</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Paid</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {professionals.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No professionals added yet</td></tr>
              )}
              {professionals.map(prof => {
                const paid = profPayments.filter(p => p.professional_id === prof.id).reduce((s, p) => s + parseFloat(String(p.net_amount || 0)), 0)
                return (
                  <tr key={prof.id} className={`hover:bg-gray-50 ${selectedProf === prof.id ? 'bg-blue-50' : ''}`}>
                    <td className="px-3 py-3 text-sm font-medium text-gray-900">{prof.name}</td>
                    <td className="px-3 py-3 text-sm text-gray-700">{prof.service_type}</td>
                    <td className="px-3 py-3 text-sm text-gray-600 capitalize">{prof.contract_type.replace('_', ' ')}</td>
                    <td className="px-3 py-3 text-sm text-right font-semibold text-gray-900">₹{parseFloat(String(prof.agreed_fee)).toLocaleString()}</td>
                    <td className="px-3 py-3 text-sm text-right font-semibold text-green-700">₹{paid.toLocaleString()}</td>
                    <td className="px-3 py-3 text-sm text-gray-600">{prof.contact_phone || prof.contact_email || '-'}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded ${prof.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>{prof.status}</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button onClick={() => { setSelectedProf(prof.id); setShowPayForm(false) }}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium">View</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Professional - Payment Section */}
      {selectedProf && selectedProfData && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex flex-wrap justify-between items-start gap-4">
              <div>
                <h4 className="text-lg font-bold text-gray-900">{selectedProfData.name}</h4>
                <p className="text-sm text-gray-600">{selectedProfData.service_type} - {selectedProfData.contract_type.replace('_', ' ')}</p>
                <p className="text-sm text-gray-500 mt-1">
                  Agreed Fee: <span className="font-semibold text-gray-800">₹{parseFloat(String(selectedProfData.agreed_fee)).toLocaleString()}</span>
                  {' | '}Total Paid: <span className="font-semibold text-green-700">₹{totalPaidToSelected.toLocaleString()}</span>
                  {' | '}Outstanding: <span className="font-semibold text-red-600">₹{Math.max(0, parseFloat(String(selectedProfData.agreed_fee)) - totalPaidToSelected).toLocaleString()}</span>
                </p>
              </div>
              <button onClick={() => setShowPayForm(!showPayForm)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${showPayForm ? 'bg-gray-200 text-gray-700' : 'bg-green-600 hover:bg-green-700 text-white'}`}>
                {showPayForm ? 'Cancel' : '+ Record Payment'}
              </button>
            </div>
          </div>

          {showPayForm && (
            <form onSubmit={handleAddPayment} className="bg-white rounded-lg shadow p-5 space-y-4">
              <h4 className="font-semibold text-gray-900">Record Payment to {selectedProfData.name}</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₹) *</label>
                  <input type="number" step="0.01" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">TDS Deduction</label>
                  <input type="number" step="0.01" value={payForm.tds_deduction} onChange={e => setPayForm({ ...payForm, tds_deduction: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" />
                </div>
                <div className="bg-indigo-50 rounded-lg p-2 flex flex-col justify-center">
                  <p className="text-xs text-indigo-600 font-medium">Net Amount</p>
                  <p className="text-lg font-bold text-indigo-800">₹{((parseFloat(payForm.amount) || 0) - (parseFloat(payForm.tds_deduction) || 0)).toLocaleString()}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Invoice Number</label>
                  <input type="text" value={payForm.invoice_number} onChange={e => setPayForm({ ...payForm, invoice_number: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Payment Date</label>
                  <input type="date" value={payForm.payment_date} onChange={e => setPayForm({ ...payForm, payment_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Payment Mode</label>
                  <select value={payForm.payment_mode} onChange={e => setPayForm({ ...payForm, payment_mode: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white">
                    <option value="cash">Cash</option><option value="bank">Bank</option><option value="upi">UPI</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Service Description</label>
                  <input type="text" value={payForm.service_description} onChange={e => setPayForm({ ...payForm, service_description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                  <input type="text" value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white" />
                </div>
              </div>
              <button type="submit" disabled={submitting}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
                {submitting ? 'Recording...' : 'Record Payment'}
              </button>
            </form>
          )}

          {/* Payment History for Selected Professional */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-4 border-b"><h4 className="font-semibold text-gray-900">Payment History ({selectedPayments.length})</h4></div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">TDS</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Net Paid</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Mode</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {selectedPayments.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No payments recorded</td></tr>
                  )}
                  {selectedPayments.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-3 py-3 text-sm text-gray-600">{new Date(p.payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td className="px-3 py-3 text-sm font-mono text-gray-500">{p.invoice_number || '-'}</td>
                      <td className="px-3 py-3 text-sm text-gray-700">{p.service_description || '-'}</td>
                      <td className="px-3 py-3 text-sm text-right text-gray-900">₹{parseFloat(String(p.amount)).toLocaleString()}</td>
                      <td className="px-3 py-3 text-sm text-right text-red-600">{parseFloat(String(p.tds_deduction)) > 0 ? `-₹${parseFloat(String(p.tds_deduction)).toLocaleString()}` : '-'}</td>
                      <td className="px-3 py-3 text-sm text-right font-semibold text-green-700">₹{parseFloat(String(p.net_amount)).toLocaleString()}</td>
                      <td className="px-3 py-3 text-sm text-center capitalize text-gray-600">{p.payment_mode}</td>
                    </tr>
                  ))}
                </tbody>
                {selectedPayments.length > 0 && (
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr>
                      <td colSpan={5} className="px-3 py-3 text-sm font-semibold text-gray-700 text-right">Total:</td>
                      <td className="px-3 py-3 text-sm text-right font-bold text-green-700">₹{totalPaidToSelected.toLocaleString()}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== EXPENSE LEDGER VIEW ====================
function ExpenseLedgerView({ salaryPayments, miscExpenses, profPayments, employees, professionals }: {
  salaryPayments: SalaryPayment[]; miscExpenses: MiscExpense[]; profPayments: ProfPayment[]; employees: Employee[]; professionals: Professional[]
}) {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filterCategory, setFilterCategory] = useState('')

  // Build unified ledger entries from all 3 sources
  const empMap: Record<string, string> = {}
  for (const e of employees) empMap[e.id] = `${e.name} (${e.employee_code})`
  const profMap: Record<string, string> = {}
  for (const p of professionals) profMap[p.id] = p.name

  type LedgerEntry = { id: string; date: string; category: string; person: string; description: string; amount: number; mode: string; source: string }
  let entries: LedgerEntry[] = []

  // Salary payments
  for (const s of salaryPayments) {
    entries.push({
      id: `sal-${s.id}`, date: s.payment_date || s.created_at?.split('T')[0] || '',
      category: 'Salary', person: empMap[s.employee_id] || 'Unknown', description: `Salary for ${s.month}`,
      amount: parseFloat(String(s.amount_paid || 0)), mode: s.payment_mode, source: 'salary',
    })
  }

  // Misc expenses
  for (const m of miscExpenses) {
    entries.push({
      id: `misc-${m.id}`, date: m.expense_date || '',
      category: m.category.charAt(0).toUpperCase() + m.category.slice(1).replace('_', ' '),
      person: m.paid_to || '-', description: m.description || m.category.replace('_', ' '),
      amount: parseFloat(String(m.amount || 0)), mode: m.payment_mode, source: 'misc',
    })
  }

  // Professional payments
  for (const p of profPayments) {
    entries.push({
      id: `prof-${p.id}`, date: p.payment_date || '',
      category: 'Professional Fee', person: profMap[p.professional_id] || 'Unknown',
      description: p.service_description || `Invoice: ${p.invoice_number || '-'}`,
      amount: parseFloat(String(p.net_amount || 0)), mode: p.payment_mode, source: 'professional',
    })
  }

  // Apply filters
  if (dateFrom) entries = entries.filter(e => e.date >= dateFrom)
  if (dateTo) entries = entries.filter(e => e.date <= dateTo)
  if (filterCategory) entries = entries.filter(e => e.source === filterCategory)

  // Sort by date descending
  entries.sort((a, b) => b.date.localeCompare(a.date))

  const total = entries.reduce((s, e) => s + e.amount, 0)
  const salaryTotal = entries.filter(e => e.source === 'salary').reduce((s, e) => s + e.amount, 0)
  const miscTotal = entries.filter(e => e.source === 'misc').reduce((s, e) => s + e.amount, 0)
  const profTotal = entries.filter(e => e.source === 'professional').reduce((s, e) => s + e.amount, 0)

  const generateLedgerPDF = () => {
    if (entries.length === 0) return
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pw = doc.internal.pageSize.getWidth()

    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('Company Expense Ledger', pw / 2, 15, { align: 'center' })
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100)
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, pw / 2, 21, { align: 'center' })
    doc.setTextColor(0)

    let y = 28
    if (dateFrom || dateTo) {
      doc.text(`Period: ${dateFrom || '...'} to ${dateTo || '...'}`, 14, y); y += 5
    }

    // Summary
    doc.setFillColor(245, 245, 250)
    doc.roundedRect(14, y, pw - 28, 14, 2, 2, 'F')
    doc.setFontSize(9); doc.setFont('helvetica', 'bold')
    const items = [
      `Salary: Rs ${salaryTotal.toLocaleString()}`,
      `Misc Expenses: Rs ${miscTotal.toLocaleString()}`,
      `Professional Fees: Rs ${profTotal.toLocaleString()}`,
      `TOTAL: Rs ${total.toLocaleString()}`,
    ]
    const sp = (pw - 28) / items.length
    items.forEach((item, i) => doc.text(item, 14 + sp * i + sp / 2, y + 9, { align: 'center' }))
    y += 20

    const tableData = entries.map(e => [
      e.date ? new Date(e.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-',
      e.category, e.person, e.description,
      `Rs ${e.amount.toLocaleString()}`, e.mode,
    ])

    autoTable(doc, {
      startY: y,
      head: [['Date', 'Category', 'Person', 'Description', 'Amount', 'Mode']],
      body: tableData,
      foot: [['', '', '', 'TOTAL', `Rs ${total.toLocaleString()}`, '']],
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [243, 244, 246], textColor: [31, 41, 55], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: { 4: { halign: 'right' } },
    })

    const totalPages = (doc as any).getNumberOfPages()
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i)
      doc.setFontSize(7); doc.setTextColor(150)
      doc.text(`Page ${i} of ${totalPages} | Dairy Admin - Expense Ledger`, pw / 2, doc.internal.pageSize.getHeight() - 5, { align: 'center' })
    }

    doc.save(`Expense_Ledger_${new Date().toISOString().split('T')[0]}.pdf`)
  }

  const generateLedgerExcel = () => {
    if (entries.length === 0) return

    const infoRows: any[][] = [
      ['Company Expense Ledger'],
      [`Generated: ${new Date().toLocaleString('en-IN')}`],
      [],
      ...(dateFrom || dateTo ? [['Period', `${dateFrom || '...'} to ${dateTo || '...'}`]] : []),
      ['Summary'],
      ['Salary Payments', salaryTotal],
      ['Misc Expenses', miscTotal],
      ['Professional Fees', profTotal],
      ['TOTAL', total],
      [],
    ]

    const header = ['Date', 'Category', 'Person', 'Description', 'Amount', 'Mode']

    const dataRows = entries.map(e => [
      e.date ? new Date(e.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-',
      e.category,
      e.person,
      e.description,
      e.amount,
      e.mode,
    ])

    const totalsRow = ['', '', '', 'TOTAL', total, '']

    const ws = XLSX.utils.aoa_to_sheet([...infoRows, header, ...dataRows, totalsRow])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Expense Ledger')

    XLSX.writeFile(wb, `Expense_Ledger_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="min-w-[160px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="min-w-[160px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="min-w-[180px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-blue-500">
              <option value="">All Categories</option>
              <option value="salary">Salary</option>
              <option value="misc">Miscellaneous</option>
              <option value="professional">Professional Fees</option>
            </select>
          </div>
          {(dateFrom || dateTo || filterCategory) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); setFilterCategory('') }}
              className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Clear</button>
          )}
          {entries.length > 0 && (
            <div className="ml-auto flex gap-2">
            <button onClick={generateLedgerPDF}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Save PDF
            </button>
            <button onClick={generateLedgerExcel}
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-indigo-500">
          <p className="text-[10px] text-gray-500 uppercase">Salary Payments</p>
          <p className="text-xl font-bold text-indigo-700">₹{salaryTotal.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-500">
          <p className="text-[10px] text-gray-500 uppercase">Misc Expenses</p>
          <p className="text-xl font-bold text-orange-700">₹{miscTotal.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
          <p className="text-[10px] text-gray-500 uppercase">Professional Fees</p>
          <p className="text-xl font-bold text-purple-700">₹{profTotal.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
          <p className="text-[10px] text-gray-500 uppercase">Grand Total</p>
          <p className="text-xl font-bold text-red-700">₹{total.toLocaleString()}</p>
        </div>
      </div>

      {/* Expense Breakdown Bar */}
      {total > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm font-medium text-gray-600 mb-2">Expense Breakdown</p>
          <div className="w-full bg-gray-200 rounded-full h-4 flex overflow-hidden">
            {salaryTotal > 0 && <div className="bg-indigo-500 h-4" style={{ width: `${(salaryTotal / total) * 100}%` }} title={`Salary: ${((salaryTotal / total) * 100).toFixed(1)}%`} />}
            {miscTotal > 0 && <div className="bg-orange-500 h-4" style={{ width: `${(miscTotal / total) * 100}%` }} title={`Misc: ${((miscTotal / total) * 100).toFixed(1)}%`} />}
            {profTotal > 0 && <div className="bg-purple-500 h-4" style={{ width: `${(profTotal / total) * 100}%` }} title={`Professional: ${((profTotal / total) * 100).toFixed(1)}%`} />}
          </div>
          <div className="flex gap-4 text-xs mt-2">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-indigo-500 inline-block" /> Salary ({((salaryTotal / total) * 100).toFixed(0)}%)</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500 inline-block" /> Misc ({((miscTotal / total) * 100).toFixed(0)}%)</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-500 inline-block" /> Professional ({((profTotal / total) * 100).toFixed(0)}%)</span>
          </div>
        </div>
      )}

      {/* Ledger Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900">Expense Ledger ({entries.length})</h3>
          <span className="text-xs text-gray-400">{dateFrom || dateTo ? `Filtered: ${dateFrom || '...'} to ${dateTo || '...'}` : 'All time'}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Person</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Mode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {entries.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No expense records found</td></tr>
              )}
              {entries.map(entry => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3 text-sm text-gray-600 whitespace-nowrap">
                    {entry.date ? new Date(entry.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded ${
                      entry.source === 'salary' ? 'bg-indigo-100 text-indigo-800' :
                      entry.source === 'professional' ? 'bg-purple-100 text-purple-800' :
                      'bg-orange-100 text-orange-800'
                    }`}>{entry.category}</span>
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-700">{entry.person}</td>
                  <td className="px-3 py-3 text-sm text-gray-600">{entry.description}</td>
                  <td className="px-3 py-3 text-sm text-right font-semibold text-gray-900">₹{entry.amount.toLocaleString()}</td>
                  <td className="px-3 py-3 text-sm text-center capitalize text-gray-600">{entry.mode}</td>
                </tr>
              ))}
            </tbody>
            {entries.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-sm font-semibold text-gray-700 text-right">Grand Total:</td>
                  <td className="px-3 py-3 text-sm text-right font-bold text-gray-900">₹{total.toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
