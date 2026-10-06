import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { initializeFirestore, type Firestore } from "firebase/firestore";

/**
 * The Firebase web app config. These values are public by design — access is
 * controlled by firestore.rules — and come from .env.local in development and
 * from the repository's Actions variables when GitHub Pages builds the site.
 */
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};

interface Firebase {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
}

let firebase: Firebase | undefined;

export function getFirebase(): Firebase {
  if (firebase) return firebase;
  const missing = (
    [
      ["VITE_FIREBASE_API_KEY", config.apiKey],
      ["VITE_FIREBASE_AUTH_DOMAIN", config.authDomain],
      ["VITE_FIREBASE_PROJECT_ID", config.projectId],
      ["VITE_FIREBASE_APP_ID", config.appId],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length) {
    const message = `Missing Firebase environment variable(s): ${missing.join(", ")}. See README.md.`;
    console.error(`[Firebase] ${message}`);
    throw new Error(message);
  }
  const app = initializeApp(config);
  firebase = {
    app,
    auth: getAuth(app),
    // Optional columns are written as null, never undefined; this keeps a stray
    // undefined from failing a whole write.
    firestore: initializeFirestore(app, { ignoreUndefinedProperties: true }),
  };
  return firebase;
}
