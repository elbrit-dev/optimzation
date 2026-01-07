// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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
// In Next.js, we check if an app already exists to prevent re-initialization
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

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
const db = getFirestore(app);

export { app, analytics, auth, db };
