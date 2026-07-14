import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

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
const app = firebase.apps.length > 0 ? firebase.app() : firebase.initializeApp(firebaseConfig);

// ✅ Force Firestore to use 'elbrit' database (not default)
const db = firebase.firestore(app);
db._delegate._databaseId.database = 'elbrit';

// Expose to window for Plasmic if needed
if (typeof window !== 'undefined') {
  window.firebaseApp = app;
  window.firebaseAuth = app.auth();
}

export default app;
export { db };

