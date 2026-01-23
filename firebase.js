import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCY2qR__9xqrzr2OzCO26cFhoqle4gGYYU",
  authDomain: "elbrit-sso.firebaseapp.com",
  databaseURL: "https://elbrit-sso-default-rtdb.firebaseio.com",
  projectId: "elbrit-sso",
  storageBucket: "elbrit-sso.firebasestorage.app",
  messagingSenderId: "998910471029",
  appId: "1:998910471029:web:d0982d548891d02b89413c"
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

