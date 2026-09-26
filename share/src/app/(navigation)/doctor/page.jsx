'use client';

import { motion } from 'framer-motion';

export default function DoctorPage() {
  return (
    <div className="h-full bg-page p-6 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-surface rounded-xl shadow-pop p-6 sm:p-8"
        >
          <h1 className="text-32 sm:text-32 font-bold text-body mb-4">Doctor</h1>
          <p className="text-ds-secondary mb-6">
            This is the Doctor page. Access medical information and resources.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="p-4 bg-cat-violet-wash rounded-lg border border-cat-violet"
            >
              <h3 className="font-semibold text-cat-violet mb-2">Medical Records</h3>
              <p className="text-sm text-cat-violet">Access your medical history and records.</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="p-4 bg-cat-violet-wash rounded-lg border border-cat-violet"
            >
              <h3 className="font-semibold text-cat-violet mb-2">Appointments</h3>
              <p className="text-sm text-cat-violet">Schedule and manage your doctor appointments.</p>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
