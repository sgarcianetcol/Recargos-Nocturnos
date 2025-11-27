// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAG0j4gU722dmJX9n8Dj2R3DMX2NoBp-zQ",
  authDomain: "controlpersonal-a5371.firebaseapp.com",
  projectId: "controlpersonal-a5371",
  storageBucket: "controlpersonal-a5371.firebasestorage.app",
  messagingSenderId: "535711646177",
  appId: "1:535711646177:web:8106fe43321a38299652a0",
  measurementId: "G-K5KX0F20H4",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export const storage = getStorage(app);
