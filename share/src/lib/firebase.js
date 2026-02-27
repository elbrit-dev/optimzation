'use client';

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Main Firebase project configuration (for Firestore)
const mainFirebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  ...(process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID && {
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
  })
};

// Auth Firebase project configuration (elbrit-sso)
const authFirebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_AUTH_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_AUTH_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_AUTH_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_AUTH_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_AUTH_APP_ID,
  ...(process.env.NEXT_PUBLIC_FIREBASE_AUTH_MEASUREMENT_ID && {
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_AUTH_MEASUREMENT_ID
  })
};

// Initialize main Firebase app (for Firestore)
let mainApp;
const mainAppName = 'main-app';
if (!getApps().find(app => app.name === mainAppName)) {
  mainApp = initializeApp(mainFirebaseConfig, mainAppName);
} else {
  mainApp = getApps().find(app => app.name === mainAppName);
}

// Initialize auth Firebase app (elbrit-sso)
let authApp;
const authAppName = 'auth-app';
if (!getApps().find(app => app.name === authAppName)) {
  authApp = initializeApp(authFirebaseConfig, authAppName);
} else {
  authApp = getApps().find(app => app.name === authAppName);
}

// Initialize Firestore from main app
export const db = getFirestore(mainApp);

// Initialize Firebase Auth from auth app (elbrit-sso)
export const auth = getAuth(authApp);

