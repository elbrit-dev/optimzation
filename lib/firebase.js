// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAU7NbYC2FizLMT0HWJLWPTR0XkEn-xBXA",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "elbrit-sso-d01d9.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "elbrit-sso-d01d9",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "elbrit-sso-d01d9.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "878677132537",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:878677132537:web:c85dd96936d5ed1ecd4e28",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-2REFK80W2D"
};

// Initialize Firebase
// Use a named app ("playground") to avoid conflict with the default app initialized in the root firebase.js
const app = getApps().find(a => a.name === "playground") 
  ? getApp("playground") 
  : initializeApp(firebaseConfig, "playground");

// Initialize Analytics (only in browser)
let analytics;
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}

// Initialize other services
const auth = getAuth(app);

// Use initializeFirestore with long polling to bypass potential network issues that cause "offline" errors.
// In Next.js, we check if Firestore is already initialized to avoid errors.
// Target the non-default 'elbrit' database to match the rest of the app (root firebase.js).
let db;
try {
  db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
  }, 'elbrit');
} catch (e) {
  db = getFirestore(app, 'elbrit');
}

export { app, analytics, auth, db };
