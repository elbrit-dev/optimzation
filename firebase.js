import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);

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

