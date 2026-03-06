import { getCurrentUser, getAppUser } from '@/lib/firebase/server'
import { redirect } from 'next/navigation'
import DashboardSidebar from '@/components/dashboard/DashboardSidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const appUser = await getAppUser(user.uid)

  if (appUser?.role === 'delivery_agent') {
    redirect('/login')
  }

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
