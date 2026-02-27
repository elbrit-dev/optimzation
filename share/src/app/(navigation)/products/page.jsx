'use client';

import { motion } from 'framer-motion';

export default function ProductsPage() {
  return (
    <div className="h-full bg-gradient-to-br from-orange-50 to-red-100 p-6 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-white rounded-xl shadow-lg p-6 sm:p-8"
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Products</h1>
          <p className="text-gray-600 mb-6">
            Browse and explore our product catalog.
          </p>
          <div className="space-y-4">
            <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
              <h3 className="font-semibold text-orange-900 mb-2">Catalog</h3>
              <p className="text-sm text-orange-700">
                Discover our wide range of products and services.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
