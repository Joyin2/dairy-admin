'use client'

import { useState, useEffect, Suspense, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [clientReady, setClientReady] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  
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

  useEffect(() => {
    if (searchParams.get('signup') === 'success') {
      setSuccess('Account created successfully! Please sign in.')
    }
    if (searchParams.get('message') === 'pending') {
      setSuccess('Account created! Pending admin approval. You will be able to login once approved.')
    }

    // Clear any existing session on mount to prevent token refresh issues
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          // Clear existing session to prevent auto-refresh errors
          supabase.auth.signOut().catch(() => {})
        }
      }).catch(() => {})
    }
  }, [searchParams, supabase])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Check if client is ready
    if (!supabase || !clientReady) {
      setError('Authentication service is not ready. Please refresh the page.')
      return
    }
    
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      // Check user status and role
      if (data.user) {
        const { data: userData, error: userError } = await supabase
          .from('app_users')
          .select('status, role')
          .eq('auth_uid', data.user.id)
          .single()

        if (userError) throw userError

        // Block delivery agents from admin panel
        if (userData.role === 'delivery_agent') {
          await supabase.auth.signOut()
          setError('Access denied. Delivery agents cannot access the admin panel. Please use the delivery app.')
          setLoading(false)
          return
        }

        // Block pending users
        if (userData.status === 'pending') {
          await supabase.auth.signOut()
          setError('Your account is pending approval. Please wait for admin approval.')
          setLoading(false)
          return
        }

        // Block inactive users
        if (userData.status !== 'active') {
          await supabase.auth.signOut()
          setError('Your account is inactive. Please contact support.')
          setLoading(false)
          return
        }

        // Update last login
        await supabase
          .from('app_users')
          .update({ last_login: new Date().toISOString() })
          .eq('auth_uid', data.user.id)
      }

      router.push('/dashboard')
      router.refresh()
    } catch (err: any) {
      console.error('Login error:', err)
      if (err.message?.includes('fetch')) {
        setError('Network error. Please check your internet connection and try again.')
      } else {
        setError(err.message || 'Failed to login')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dairy Admin Panel</h1>
          <p className="text-gray-600">Sign in to your account</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {!clientReady && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-lg">
              Connecting to authentication service...
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
              {success}
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !clientReady}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : !clientReady ? 'Connecting...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Don't have an account?{' '}
            <Link href="/signup" className="text-blue-600 hover:text-blue-800 font-medium">
              Sign up
            </Link>
          </p>
        </div>

        <div className="mt-4 text-center text-xs text-gray-500">
          <p>Demo: admin@dairy.com / password123</p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-gray-500">Loading...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
