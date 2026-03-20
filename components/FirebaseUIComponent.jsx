import React, { useEffect, useRef, useState } from "react";
import app, { db } from "../firebase"; // compat app + compat Firestore instance
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
// Firestore is initialized in ../firebase.js (compat). No need to import compat/firestore here.
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';

// Dynamically import FirebaseUI to avoid SSR issues
const FirebaseUIComponent = ({ onSuccess, onError, className }) => {
  const uiRef = useRef(null);
  const containerRef = useRef(null);
  const [isClient, setIsClient] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;

    const initializeFirebaseUI = async () => {
      const auth = app.auth(); // using compat auth

      const firebaseui = await import('firebaseui');
      await import('firebaseui/dist/firebaseui.css');

      uiRef.current = firebaseui.auth.AuthUI.getInstance() || new firebaseui.auth.AuthUI(auth);

      const uiConfig = {
        signInOptions: [
          {
            provider: 'microsoft.com',
            customParameters: {
              tenant: process.env.NEXT_PUBLIC_AZURE_TENANT_ID
            }
          },
          {
            provider: 'phone',
            recaptchaParameters: {
              type: 'image',
              size: 'normal',
              badge: 'bottomleft'
            },
            defaultCountry: 'IN'
          }
        ],
        signInFlow: 'popup',
          callbacks: {
          signInSuccessWithAuthResult: (authResult, redirectUrl) => {
            console.log('Login successful:', authResult.user.phoneNumber || authResult.user.email);

            // Persist logged-in user to Firestore so `users/{uid}` exists.
            // Note: Firestore write is best-effort; we don't block sign-in if it fails.
            const user = authResult?.user;
            const uid = user?.uid;
            if (uid && db) {
              const providerId =
                user.providerData?.[0]?.providerId ||
                (user.phoneNumber ? "phone" : "password");
              const isPhoneLogin = providerId === "phone";
              const originalPhoneNumber = user.phoneNumber || null;
              const normalizedPhoneNumber = originalPhoneNumber?.startsWith("+91")
                ? originalPhoneNumber.slice(3)
                : originalPhoneNumber;
              const fallbackDisplayName = isPhoneLogin ? "User" : null;

              const userRef = db.collection("users").doc(uid);
              userRef
                .get()
                .then((existingSnap) => {
                  const existingData = existingSnap.exists ? existingSnap.data() : {};
                  const createdAt = existingData?.createdAt || new Date();
                  const role = existingData?.role || "Editor";

                  return userRef.set(
                    {
                      uid,
                      createdAt,
                      lastLoginAt: new Date(),
                      displayName: user.displayName || fallbackDisplayName,
                      email: user.email || null,
                      photoURL: user.photoURL || null,
                      phoneNumber: normalizedPhoneNumber || null,
                      originalPhoneNumber,
                      role,
                      customProperties: {
                        accessLevel: "full",
                        organization: "Elbrit Life Sciences",
                        provider: providerId,
                        ...(isPhoneLogin ? { authMethod: "phone" } : {}),
                      },
                    },
                    { merge: true }
                  );
                })
                .catch((err) => {
                  console.error("Failed to write users/{uid} doc:", err);
                });
            }

            if (onSuccess) onSuccess({ firebaseUser: authResult.user });
            return false; // Prevent redirect
          },
          signInFailure: (error) => {
            console.error('Login failed:', error.code, error.message);
            if (error.code === 'auth/timeout') {
              alert('Phone verification timed out. Please retry.');
            }
            if (onError) onError(error);
            return Promise.resolve();
          },
          uiShown: () => {
            console.log('FirebaseUI is ready');
          }
        }
      };

      uiRef.current.start(containerRef.current, uiConfig);

      return () => {
        if (uiRef.current) {
          uiRef.current.reset();
        }
      };
    };

    initializeFirebaseUI();
  }, [isClient, onSuccess, onError]);

  if (!isClient) {
    return null;
  }

  return (
    <div className={className} ref={containerRef}></div>
  );
};

export default dynamic(() => Promise.resolve(FirebaseUIComponent), {
  ssr: false,
  loading: () => <div>Loading authentication...</div>
});