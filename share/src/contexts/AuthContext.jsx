'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  signInWithPopup,
  OAuthProvider,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recaptchaVerifier, setRecaptchaVerifier] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Initialize reCAPTCHA verifier for phone authentication
  const setupRecaptcha = useCallback((containerId = 'recaptcha-container') => {
    if (typeof window === 'undefined') return null;
    
    // Check if container element exists
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`Recaptcha container with id "${containerId}" not found`);
      return null;
    }
    
    // Clean up existing verifier if any
    if (recaptchaVerifier) {
      try {
        recaptchaVerifier.clear();
      } catch (error) {
        // Ignore errors when clearing
      }
      setRecaptchaVerifier(null);
    }

    try {
      // Create verifier with the container element or ID
      // Firebase accepts both DOM element and string ID
      const verifier = new RecaptchaVerifier(auth, container, {
        size: 'invisible',
        callback: () => {
          // reCAPTCHA solved, allow phone sign-in
        },
        'expired-callback': () => {
          // Response expired, ask user to solve reCAPTCHA again
        }
      });

      setRecaptchaVerifier(verifier);
      return verifier;
    } catch (error) {
      console.error('Error setting up RecaptchaVerifier:', error);
      // If error occurs, try to clean up
      if (container) {
        container.innerHTML = '';
      }
      return null;
    }
  }, [recaptchaVerifier]);

  // Email/Password Login
  const loginWithEmail = async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      return { success: true, user: userCredential.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // Phone Login
  const loginWithPhone = async (phoneNumber, containerId = 'recaptcha-container') => {
    try {
      let verifier = recaptchaVerifier;
      
      // Create verifier if it doesn't exist or if container changed
      if (!verifier) {
        verifier = setupRecaptcha(containerId);
        if (!verifier) {
          return { 
            success: false, 
            error: 'Failed to initialize reCAPTCHA. Please refresh the page and try again.' 
          };
        }
      }

      const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, verifier);
      return { 
        success: true, 
        confirmationResult,
        message: 'Verification code sent to your phone'
      };
    } catch (error) {
      // Clear verifier on error so it can be recreated
      if (recaptchaVerifier) {
        try {
          recaptchaVerifier.clear();
        } catch (e) {
          // Ignore cleanup errors
        }
        setRecaptchaVerifier(null);
      }
      return { success: false, error: error.message };
    }
  };

  // Verify Phone Code
  const verifyPhoneCode = async (confirmationResult, code) => {
    try {
      const userCredential = await confirmationResult.confirm(code);
      return { success: true, user: userCredential.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // Microsoft Login
  const loginWithMicrosoft = async () => {
    try {
      const provider = new OAuthProvider('microsoft.com');
      // Add scopes if needed
      provider.addScope('email');
      provider.addScope('profile');
      
      const userCredential = await signInWithPopup(auth, provider);
      return { success: true, user: userCredential.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // Sign Out
  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      // Clean up reCAPTCHA
      if (recaptchaVerifier) {
        recaptchaVerifier.clear();
        setRecaptchaVerifier(null);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const value = {
    user,
    loading,
    loginWithEmail,
    loginWithPhone,
    verifyPhoneCode,
    loginWithMicrosoft,
    signOut,
    setupRecaptcha,
    isAuthenticated: !!user
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

