'use client';

import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';

function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <Link
            href="/datatable"
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200 group"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                  Data Table
                </h2>
                <p className="text-sm text-gray-600">
                  View, filter, sort, and analyze your data with advanced table controls
                </p>
              </div>
              <div className="ml-4 text-gray-400 group-hover:text-blue-600 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
            </div>
          </Link>

          <Link
            href="/navigation"
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200 group"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                  Navigation
                </h2>
                <p className="text-sm text-gray-600">
                  Navigate through the application and explore different sections
                </p>
              </div>
              <div className="ml-4 text-gray-400 group-hover:text-blue-600 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </div>
            </div>
          </Link>

          <Link
            href="/graphql-playground-v2"
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200 group"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                  GraphQL Playground
                </h2>
                <p className="text-sm text-gray-600">
                  Modern GraphQL playground with Monaco Editor and query management
                </p>
              </div>
              <div className="ml-4 text-gray-400 group-hover:text-blue-600 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}

export default function HomePage() {
  return (
    <ProtectedRoute>
      <Home />
    </ProtectedRoute>
  );
}

