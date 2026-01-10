'use client';

import { motion } from 'framer-motion';

export default function PlannerPage() {
  return (
    <div className="h-full bg-gradient-to-br from-green-50 to-emerald-100 p-6 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-white rounded-xl shadow-lg p-6 sm:p-8"
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Planner</h1>
          <p className="text-gray-600 mb-6">
            This is the Planner page. Manage your schedules and appointments here.
          </p>
          <div className="space-y-4">
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <h3 className="font-semibold text-green-900 mb-2">Schedule</h3>
              <p className="text-sm text-green-700">View and manage your upcoming events and appointments.</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
