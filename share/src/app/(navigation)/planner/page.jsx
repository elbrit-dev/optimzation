'use client';

import { motion } from 'framer-motion';

export default function PlannerPage() {
  return (
    <div className="h-full bg-page p-6 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-surface rounded-xl shadow-pop p-6 sm:p-8"
        >
          <h1 className="text-32 sm:text-32 font-bold text-body mb-4">Planner</h1>
          <p className="text-ds-secondary mb-6">
            This is the Planner page. Manage your schedules and appointments here.
          </p>
          <div className="space-y-4">
            <div className="p-4 bg-success-wash rounded-lg border border-success-border">
              <h3 className="font-semibold text-success mb-2">Schedule</h3>
              <p className="text-sm text-success">View and manage your upcoming events and appointments.</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
