import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  projectId: "single-truck-zfbwx",
  appId: "1:415576865276:web:e8d80ba1f4053014ef5a79",
  apiKey: "AIzaSyCJ4JciZSJsdAbKJsg9YesM9nTGPAlKPS4",
  authDomain: "single-truck-zfbwx.firebaseapp.com",
  storageBucket: "single-truck-zfbwx.firebasestorage.app",
  messagingSenderId: "415576865276",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app, "ai-studio-jsai-945c6e16-7ac5-4d91-9c88-5fc0124698a4");
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
    throw error;
  }
};

export { app, auth, db, storage, googleProvider };
