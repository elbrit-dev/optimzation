'use client';

import { motion } from 'framer-motion';

export default function ChatPage() {
  return (
    <div className="h-full bg-gradient-to-br from-cyan-50 to-teal-100 p-6 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-white rounded-xl shadow-lg p-6 sm:p-8"
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Chat</h1>
          <p className="text-gray-600 mb-6">
            Connect and communicate with our team and community.
          </p>
          <div className="space-y-4">
            <div className="p-4 bg-cyan-50 rounded-lg border border-cyan-200">
              <h3 className="font-semibold text-cyan-900 mb-2">Messages</h3>
              <p className="text-sm text-cyan-700">
                Send and receive messages in real-time.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
