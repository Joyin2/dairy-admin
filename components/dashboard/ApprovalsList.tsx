'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface User {
  id: string
  name: string
  email: string
  phone: string
  role: string
  status: string
  created_at: string
}

export default function ApprovalsList({ users }: { users: User[] }) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState<string | null>(null)

  const handleApprove = async (userId: string) => {
    setLoading(userId)
    
    const { error } = await supabase
      .from('app_users')
      .update({ status: 'active' })
      .eq('id', userId)

    if (error) {
      console.error('Approve error:', error)
      alert('Failed to approve user: ' + error.message)
    } else {
      alert('User approved successfully!')
      router.refresh()
    }
    
    setLoading(null)
  }

  const handleReject = async (userId: string) => {
    if (!confirm('Are you sure you want to reject this user? This will delete their account.')) {
      return
    }

    setLoading(userId)
    
    // Delete from app_users (this will also delete auth user via trigger if set up)
    const { error } = await supabase
      .from('app_users')
      .delete()
      .eq('id', userId)

    if (error) {
      alert('Failed to reject user: ' + error.message)
    } else {
      router.refresh()
    }
    
    setLoading(null)
  }

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contact
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Requested On
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <span className="text-blue-600 font-semibold">
                        {user.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">{user.name}</div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{user.phone || 'N/A'}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                    {user.role === 'admin' ? 'Admin' : user.role}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => handleApprove(user.id)}
                    disabled={loading === user.id}
                    className="text-green-600 hover:text-green-900 mr-4 disabled:opacity-50"
                  >
                    ✓ Approve
                  </button>
                  <button
                    onClick={() => handleReject(user.id)}
                    disabled={loading === user.id}
                    className="text-red-600 hover:text-red-900 disabled:opacity-50"
                  >
                    ✗ Reject
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
