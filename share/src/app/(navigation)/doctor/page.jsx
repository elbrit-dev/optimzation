'use client';

import { motion } from 'framer-motion';

export default function DoctorPage() {
  return (
    <div className="h-full bg-gradient-to-br from-purple-50 to-pink-100 p-6 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-white rounded-xl shadow-lg p-6 sm:p-8"
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Doctor</h1>
          <p className="text-gray-600 mb-6">
            This is the Doctor page. Access medical information and resources.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="p-4 bg-purple-50 rounded-lg border border-purple-200"
            >
              <h3 className="font-semibold text-purple-900 mb-2">Medical Records</h3>
              <p className="text-sm text-purple-700">Access your medical history and records.</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="p-4 bg-purple-50 rounded-lg border border-purple-200"
            >
              <h3 className="font-semibold text-purple-900 mb-2">Appointments</h3>
              <p className="text-sm text-purple-700">Schedule and manage your doctor appointments.</p>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
