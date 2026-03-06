'use client'

import { db } from '@/lib/firebase/client'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { useEffect, useState } from 'react'

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({
    phone1: '',
    phone1_label: 'Support Line 1',
    phone2: '',
    phone2_label: 'Support Line 2',
  })

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const snap = await getDoc(doc(db, 'settings', 'support'))
      if (snap.exists()) {
        const data = snap.data() as any
        setForm({
          phone1: data.phone1 || '',
          phone1_label: data.phone1_label || 'Support Line 1',
          phone2: data.phone2 || '',
          phone2_label: data.phone2_label || 'Support Line 2',
        })
      }
    } catch (err: any) {
      alert('Failed to load settings: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await setDoc(doc(db, 'settings', 'support'), {
        phone1: form.phone1.trim(),
        phone1_label: form.phone1_label.trim() || 'Support Line 1',
        phone2: form.phone2.trim(),
        phone2_label: form.phone2_label.trim() || 'Support Line 2',
        updated_at: new Date().toISOString(),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      alert('Failed to save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const update = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  if (loading) {
    return <div className="text-center py-12">Loading...</div>
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl font-bold text-gray-900">Settings</h1>

      {/* Help & Support Numbers */}
      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800 mb-1">Help & Support</h2>
          <p className="text-sm text-gray-500">
            These phone numbers are shown in the delivery agent app under Help & Support.
          </p>
        </div>

        {/* Contact 1 */}
        <div className="border border-gray-200 rounded-lg p-4 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Contact 1</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
            <input
              type="text"
              value={form.phone1_label}
              onChange={e => update('phone1_label', e.target.value)}
              placeholder="e.g. Customer Support"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
            <input
              type="tel"
              value={form.phone1}
              onChange={e => update('phone1', e.target.value)}
              placeholder="e.g. +91 98765 43210"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Contact 2 */}
        <div className="border border-gray-200 rounded-lg p-4 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Contact 2</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
            <input
              type="text"
              value={form.phone2_label}
              onChange={e => update('phone2_label', e.target.value)}
              placeholder="e.g. Manager"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
            <input
              type="tel"
              value={form.phone2}
              onChange={e => update('phone2', e.target.value)}
              placeholder="e.g. +91 98765 43211"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          {saved && (
            <span className="text-green-600 font-medium text-sm">Saved successfully!</span>
          )}
        </div>
      </div>
    </div>
  )
}
