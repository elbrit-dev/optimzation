'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Navigation from './components/Navigation';
import ProtectedRoute from '@/components/ProtectedRoute';

// Page components
const HomePage = () => (
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

const PlannerPage = () => (
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

const DoctorPage = () => (
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

const ProductsPage = () => (
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

const ChatPage = () => (
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

function NavigationPlayground() {
  const [navigationItems] = useState([
    {
      label: 'Planner',
      route: 'planner',
      pageKey: 'planner',
      mobileFullscreen: true,
      mobileOnly: false,
      iconActive: <Image src="/planner_active.svg" width={24} height={24} alt="Planner" />,
      iconInactive: <Image src="/planner_inactive.svg" width={24} height={24} alt="Planner" />,
    },
    {
      label: 'Doctor',
      route: 'doctor',
      pageKey: 'doctor',
      mobileFullscreen: false,
      mobileOnly: false,
      iconActive: <Image src="/doctor_active.svg" width={24} height={24} alt="Doctor" />,
      iconInactive: <Image src="/doctor_inactive.svg" width={24} height={24} alt="Doctor" />,
    },
    {
      route: 'home',
      pageKey: 'home',
      mobileFullscreen: false,
      mobileOnly: true,
      isDefault: true,
      iconActive: <Image src="/logo.jpeg" width={56} height={56} alt="Home" />,
      iconInactive: <Image src="/logo.jpeg" width={52} height={52} alt="Home" />,
    },
    {
      label: 'Products',
      route: 'products',
      pageKey: 'products',
      mobileFullscreen: false,
      mobileOnly: false,
      iconActive: <Image src="/product_active.svg" width={24} height={24} alt="Products" />,
      iconInactive: <Image src="/product_inactive.svg" width={24} height={24} alt="Products" />,
    },
    {
      label: 'Chat',
      route: 'chat',
      pageKey: 'chat',
      mobileFullscreen: true,
      mobileOnly: false,
      iconActive: <Image src="/chat_active.svg" width={24} height={24} alt="Chat" />,
      iconInactive: <Image src="/chat_inactive.svg" width={24} height={24} alt="Chat" />,
    },
  ]);

  return (
    <div className="h-dvh flex flex-col">
      <div className="flex-1 overflow-hidden">
        <Navigation items={navigationItems}>
          <PlannerPage key="planner" />
          <DoctorPage key="doctor" />
          <HomePage key="home" />
          <ProductsPage key="products" />
          <ChatPage key="chat" />
        </Navigation>
      </div>
    </div>
  );
}

export default function NavigationPlaygroundPage() {
  return (
    <ProtectedRoute>
      <NavigationPlayground />
    </ProtectedRoute>
  );
}
