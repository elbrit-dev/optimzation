'use client';

import { motion } from 'framer-motion';

export default function HomePage() {
  return (
    <div className="h-full bg-page p-6 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-surface rounded-xl shadow-pop p-6 sm:p-8"
        >
          <h1 className="text-32 sm:text-32 font-bold text-body mb-4">Home</h1>
          <p className="text-ds-secondary mb-6">
            Welcome to the Navigation playground. This is the home page. Swipe left or use the navigation to explore other pages.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-info-wash rounded-lg">
              <h3 className="font-semibold text-brand-active mb-2">Desktop View</h3>
              <p className="text-sm text-brand">On large screens, you'll see a sidebar navigation on the left.</p>
            </div>
            <div className="p-4 bg-cat-plum-wash rounded-lg">
              <h3 className="font-semibold text-cat-plum mb-2">Mobile View</h3>
              <p className="text-sm text-cat-plum">On small screens, navigation appears at the bottom with swipe gestures.</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
