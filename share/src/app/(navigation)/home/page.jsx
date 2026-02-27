'use client';

import { motion } from 'framer-motion';

export default function HomePage() {
  return (
    <div className="h-full bg-gradient-to-br from-blue-50 to-indigo-100 p-6 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-white rounded-xl shadow-lg p-6 sm:p-8"
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Home</h1>
          <p className="text-gray-600 mb-6">
            Welcome to the Navigation playground. This is the home page. Swipe left or use the navigation to explore other pages.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <h3 className="font-semibold text-blue-900 mb-2">Desktop View</h3>
              <p className="text-sm text-blue-700">On large screens, you'll see a sidebar navigation on the left.</p>
            </div>
            <div className="p-4 bg-indigo-50 rounded-lg">
              <h3 className="font-semibold text-indigo-900 mb-2">Mobile View</h3>
              <p className="text-sm text-indigo-700">On small screens, navigation appears at the bottom with swipe gestures.</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
