// auth.js — Logowanie przez Google (Firebase Auth)

import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const provider = new GoogleAuthProvider();
let currentUser = null;
const listeners = [];

export function initAuth() {
  const auth = window.__auth;
  const btnAuth = document.getElementById('btn-auth');
  const modalAuth = document.getElementById('modal-auth');
  const btnLogin = document.getElementById('btn-google-login');

  // Observe auth state
  onAuthStateChanged(auth, user => {
    currentUser = user;
    updateAuthUI(user);
    listeners.forEach(fn => fn(user));
  });

  // Topbar auth button: show modal or sign out
  btnAuth.addEventListener('click', () => {
    if (currentUser) {
      if (confirm('Wylogować się?')) signOut(auth);
    } else {
      modalAuth.classList.remove('hidden');
    }
  });

  // Login button in modal
  btnLogin.addEventListener('click', async () => {
    try {
      await signInWithPopup(auth, provider);
      modalAuth.classList.add('hidden');
    } catch (e) {
      console.error('Login error:', e);
      alert('Błąd logowania: ' + e.message);
    }
  });

  // Close modal on backdrop click
  modalAuth.addEventListener('click', e => {
    if (e.target === modalAuth) modalAuth.classList.add('hidden');
  });
}

export function onAuthChange(fn) {
  listeners.push(fn);
}

export function getUser() {
  return currentUser;
}

export function requireAuth() {
  if (!currentUser) {
    document.getElementById('modal-auth').classList.remove('hidden');
    return false;
  }
  return true;
}

function updateAuthUI(user) {
  const btn = document.getElementById('btn-auth');
  if (user) {
    btn.title = `Zalogowany: ${user.displayName || user.email}\nKliknij aby wylogować`;
    btn.textContent = '👤';
    btn.style.color = 'var(--accent)';
  } else {
    btn.title = 'Zaloguj się';
    btn.textContent = '👤';
    btn.style.color = '';
  }
}
