// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAlYCaWOgUKf4uI_DLkBA_6g2JLTJOuo5Q",
  authDomain: "test-e3e1d.firebaseapp.com",
  projectId: "test-e3e1d",
  storageBucket: "test-e3e1d.firebasestorage.app",
  messagingSenderId: "1068174068450",
  appId: "1:1068174068450:web:a62922a04531bf3ce02cbb",
  measurementId: "G-B3QBF1F00X"
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
let db;
try {
  db = initializeFirestore(app, { 
    experimentalForceLongPolling: true,
  });
} catch (e) {
  db = getFirestore(app);
}

export { app, analytics, auth, db };
