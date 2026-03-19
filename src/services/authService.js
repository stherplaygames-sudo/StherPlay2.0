import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../firebase/firebaseConfig.js';

async function login(email, password) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

function logout() {
  return signOut(auth);
}

window.authService = {
  login,
  logout,
};
window.loginWithFirebase = login;
window.logoutFromFirebase = logout;

export { login, logout };
