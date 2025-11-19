// src/services/auth.service.ts
import { auth } from "@/lib/firebase";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";

export const AuthService = {
  // Google
  async loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    return cred.user;
  },

  // Email / password
  async loginWithEmail(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  },

  // Reset password
  async resetPassword(email: string) {
    await sendPasswordResetEmail(auth, email);
    return true;
  },

  // Logout
  async logout() {
    await signOut(auth);
  },

  // Suscripción a cambios de sesión (útil para contexts/guards)
  onAuth(cb: (user: User | null) => void) {
    return onAuthStateChanged(auth, cb);
  },

  getCurrentUser() {
    return auth.currentUser;
  },
};

export function mapFirebaseError(err: any): string {
  const code = String(err?.code || "");
  if (code.includes("auth/invalid-credential"))
    return "Credenciales inválidas.";
  if (code.includes("auth/invalid-email")) return "Correo inválido.";
  if (code.includes("auth/user-not-found")) return "Usuario no encontrado.";
  if (code.includes("auth/wrong-password")) return "Contraseña incorrecta.";
  if (code.includes("auth/popup-closed-by-user")) return "Popup cerrado.";
  if (code.includes("auth/popup-blocked")) return "Popup bloqueado.";
  if (code.includes("auth/too-many-requests")) return "Demasiados intentos.";
  return "Ocurrió un error. Intenta de nuevo.";
}
