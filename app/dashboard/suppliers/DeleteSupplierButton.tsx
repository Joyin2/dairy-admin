'use client'

export default function DeleteSupplierButton({ 
  supplierId, 
  deleteAction 
}: { 
  supplierId: string
  deleteAction: (formData: FormData) => Promise<void>
}) {
  return (
    <form action={deleteAction} className="inline">
      <input type="hidden" name="id" value={supplierId} />
      <button
        type="submit"
        className="text-red-600 hover:text-red-900"
        onClick={(e) => {
          if (!confirm('Are you sure you want to delete this supplier?')) {
            e.preventDefault()
          }
        }}
      >
        Delete
      </button>
    </form>
  )
}
