export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">🥛 Dairy Management System</h1>
        <p className="text-gray-600 mb-8">Admin Panel</p>
        <a
          href="/login"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors"
        >
          Go to Login
        </a>
      </div>
    </div>
  );
}
