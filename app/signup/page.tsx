'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SignupPage() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    phone: '',
    secretCode: '',
  })
  
  const SIGNUP_SECRET = 'DAIRY2026' // Change this to your desired secret code
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clientReady, setClientReady] = useState(false)
  const router = useRouter()
  
  // Create client only once and handle initialization errors
  const supabase = useMemo(() => {
    try {
      const client = createClient()
      setClientReady(true)
      return client
    } catch (err) {
      console.error('Failed to create Supabase client:', err)
      setError('Failed to initialize authentication. Please check your internet connection.')
      return null
    }
  }, [])

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Check if client is ready
    if (!supabase || !clientReady) {
      setError('Authentication service is not ready. Please refresh the page.')
      return
    }
    
    if (formData.secretCode !== SIGNUP_SECRET) {
      setError('Invalid secret code')
      return
    }
    
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
      })

      if (authError) throw authError

      if (authData.user) {
        // Create app_users entry with pending status
        const { error: dbError } = await supabase
          .from('app_users')
          .insert({
            auth_uid: authData.user.id,
            email: formData.email,
            name: formData.name,
            phone: formData.phone,
            role: 'admin', // Admin role
            status: 'pending', // Pending approval
          })

        if (dbError) {
          console.error('Failed to create app_users entry:', dbError)
          // Clean up auth user if app_users insert fails
          await supabase.auth.admin.deleteUser(authData.user.id).catch(() => {})
          throw new Error(`Failed to create user profile: ${dbError.message}`)
        }

        // Sign out immediately - no auto-login for pending accounts
        await supabase.auth.signOut()

        // Redirect to login with pending message
        router.push('/login?message=pending')
        router.refresh()
      }
    } catch (err: any) {
      console.error('Signup error:', err)
      if (err.message?.includes('fetch')) {
        setError('Network error. Please check your internet connection and try again.')
      } else {
        setError(err.message || 'Failed to sign up')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Account</h1>
          <p className="text-gray-600">Sign up for Dairy Admin Panel</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          {!clientReady && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-lg text-sm">
              Connecting to authentication service...
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              placeholder="John Doe"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address <span className="text-red-500">*</span>
            </label>
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              placeholder="john@example.com"
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
              Phone Number
            </label>
            <input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              placeholder="+1234567890"
            />
          </div>

          <div>
            <label htmlFor="secretCode" className="block text-sm font-medium text-gray-700 mb-2">
              Secret Code <span className="text-red-500">*</span>
            </label>
            <input
              id="secretCode"
              type="text"
              value={formData.secretCode}
              onChange={(e) => setFormData({ ...formData, secretCode: e.target.value })}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              placeholder="Enter signup secret code"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password <span className="text-red-500">*</span>
            </label>
            <input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              minLength={6}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
              Confirm Password <span className="text-red-500">*</span>
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              required
              minLength={6}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !clientReady}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating Account...' : !clientReady ? 'Connecting...' : 'Sign Up'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-600 hover:text-blue-800 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
