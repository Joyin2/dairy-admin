'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'

export default function EditUserPage() {
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'delivery_agent' as 'company_admin' | 'admin' | 'delivery_agent',
    status: 'active',
  })
  const [authUid, setAuthUid] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resetPasswordDialog, setResetPasswordDialog] = useState(false)
  const [newPassword, setNewPassword] = useState('')

  useEffect(() => {
    const fetchUser = async () => {
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('id', params.id)
        .single()

      if (error) {
        setError('User not found')
      } else if (data) {
        setFormData({
          name: data.name || '',
          email: data.email || '',
          phone: data.phone || '',
          role: data.role,
          status: data.status,
        })
        setAuthUid(data.auth_uid)
      }
      setFetching(false)
    }

    fetchUser()
  }, [params.id, supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error: updateError } = await supabase
        .from('app_users')
        .update({
          name: formData.name,
          phone: formData.phone,
          role: formData.role,
          status: formData.status,
        })
        .eq('id', params.id)

      if (updateError) throw updateError

      router.push('/dashboard/users')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to update user')
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    if (!authUid) {
      setError('User auth ID not found')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Call Supabase Edge Function or use admin API to reset password
      const response = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authUid, newPassword }),
      })

      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Failed to reset password')

      setResetPasswordDialog(false)
      setNewPassword('')
      alert('Password reset successfully')
    } catch (err: any) {
      setError(err.message || 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this user?')) return

    setLoading(true)
    try {
      const { error: deleteError } = await supabase
        .from('app_users')
        .delete()
        .eq('id', params.id)

      if (deleteError) throw deleteError

      router.push('/dashboard/users')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to delete user')
    } finally {
      setLoading(false)
    }
  }

  if (fetching) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Edit User</h1>

      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email (Read-only)
            </label>
            <input
              type="email"
              disabled
              value={formData.email}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Role <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="delivery_agent">Delivery Agent</option>
              <option value="manufacturer">Factory Manager</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update User'}
            </button>
            <button
              type="button"
              onClick={() => setResetPasswordDialog(true)}
              disabled={loading || !authUid}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              Reset Password
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-2 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="ml-auto bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              Delete User
            </button>
          </div>
        </form>
      </div>

      {/* Reset Password Dialog */}
      {resetPasswordDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Reset Password</h3>
            
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
                {error}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Enter new password (min 6 characters)"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleResetPassword}
                disabled={loading}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
              <button
                onClick={() => {
                  setResetPasswordDialog(false)
                  setNewPassword('')
                  setError(null)
                }}
                disabled={loading}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-medium transition-colors"
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
