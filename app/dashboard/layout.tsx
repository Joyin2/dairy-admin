import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardSidebar from '@/components/dashboard/DashboardSidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user role and status
  const { data: appUser } = await supabase
    .from('app_users')
    .select('*')
    .eq('auth_uid', user.id)
    .single()

  // Block delivery agents from accessing admin panel
  if (appUser?.role === 'delivery_agent') {
    redirect('/login')
  }

  // Block inactive or pending users
  if (appUser?.status !== 'active') {
    redirect('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <DashboardSidebar user={appUser} />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  )
}
