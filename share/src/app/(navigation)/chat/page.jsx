'use client';

import { motion } from 'framer-motion';

export default function ChatPage() {
  return (
    <div className="h-full bg-page p-6 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-surface rounded-xl shadow-pop p-6 sm:p-8"
        >
          <h1 className="text-32 sm:text-32 font-bold text-body mb-4">Chat</h1>
          <p className="text-ds-secondary mb-6">
            Connect and communicate with our team and community.
          </p>
          <div className="space-y-4">
            <div className="p-4 bg-cat-cyan-wash rounded-lg border border-cat-cyan">
              <h3 className="font-semibold text-cat-cyan mb-2">Messages</h3>
              <p className="text-sm text-cat-cyan">
                Send and receive messages in real-time.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
