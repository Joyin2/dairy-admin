'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface DashboardSidebarProps {
  user: any
}

export default function DashboardSidebar({ user }: DashboardSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [isCollapsed, setIsCollapsed] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: '📊', section: 'main' },
    
    { name: 'User Management', section: 'header' },
    { name: 'Users', href: '/dashboard/users', icon: '👥', section: 'users' },
    { name: 'Pending Approvals', href: '/dashboard/approvals', icon: '⏳', section: 'users' },
    
    { name: 'Master Data', section: 'header' },
    { name: 'Suppliers', href: '/dashboard/suppliers', icon: '🚜', section: 'master' },
    { name: 'Shops', href: '/dashboard/shops', icon: '🏪', section: 'master' },
    { name: 'Products', href: '/dashboard/products', icon: '📦', section: 'master' },
    { name: 'Raw Materials', href: '/dashboard/raw-materials', icon: '🧪', section: 'master' },
    
    { name: 'Operations', section: 'header' },
    { name: 'Collections', href: '/dashboard/collections', icon: '🥛', section: 'operations' },
    { name: 'Milk Pool', href: '/dashboard/milk-pool', icon: '🧪', section: 'operations' },
    { name: 'Production', href: '/dashboard/production', icon: '🏭', section: 'operations' },
    { name: 'Inventory', href: '/dashboard/inventory', icon: '📊', section: 'operations' },
    
    { name: 'Delivery', section: 'header' },
    { name: 'Routes', href: '/dashboard/routes', icon: '🗺️', section: 'delivery' },
    { name: 'Deliveries', href: '/dashboard/deliveries', icon: '🚚', section: 'delivery' },
    
    { name: 'Finance', section: 'header' },
    { name: 'Outstanding', href: '/dashboard/outstanding', icon: '⚠️', section: 'finance' },
    { name: 'Payments', href: '/dashboard/payments', icon: '💰', section: 'finance' },
    { name: 'Reports', href: '/dashboard/reports', icon: '📈', section: 'finance' },
  ]

  return (
    <div className={`${isCollapsed ? 'w-20' : 'w-64'} bg-white border-r border-gray-200 flex flex-col transition-all duration-300 shadow-sm`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <div>
              <h1 className="text-xl font-bold text-blue-600">🥛 Dairy Admin</h1>
              <p className="text-xs text-gray-500 mt-1">Management System</p>
            </div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            {isCollapsed ? '→' : '←'}
          </button>
        </div>
      </div>

      {/* User Info */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        {!isCollapsed ? (
          <div>
            <div className="text-sm font-semibold text-gray-900 truncate">{user?.name || user?.email}</div>
            <div className="text-xs text-blue-600 mt-1 uppercase font-medium">{user?.role === 'company_admin' || user?.role === 'admin' ? 'Admin' : user?.role}</div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold text-white">
              {(user?.name || user?.email)?.[0]?.toUpperCase()}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {navigation.map((item, index) => {
          if (item.section === 'header') {
            return !isCollapsed ? (
              <div key={index} className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {item.name}
              </div>
            ) : (
              <div key={index} className="h-px bg-gray-200 my-2 mx-2" />
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href!}
              className={`flex items-center px-3 py-2.5 my-1 rounded-lg transition-all ${
                pathname === item.href
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              {!isCollapsed && <span className="ml-3 font-medium">{item.name}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-gray-200">
        <button
          onClick={handleLogout}
          className={`w-full flex items-center px-3 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors ${
            isCollapsed ? 'justify-center' : ''
          }`}
        >
          <span className="text-xl">🚪</span>
          {!isCollapsed && <span className="ml-3 font-medium">Logout</span>}
        </button>
      </div>
    </div>
  )
}
