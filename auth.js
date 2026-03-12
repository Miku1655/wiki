// auth.js — Logowanie przez Google oraz Email/Hasło (Firebase Auth)
// Na mobile używa signInWithRedirect, na desktopie signInWithPopup.
// Ten sam email działa dla obu metod — konta są automatycznie łączone.

import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  linkWithCredential,
  EmailAuthProvider,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const provider = new GoogleAuthProvider();
let currentUser = null;
const listeners = [];

function isMobile() {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
}

export function initAuth() {
  const auth      = window.__auth;
  const btnAuth   = document.getElementById('btn-auth');
  const modalAuth = document.getElementById('modal-auth');

  // ── Obserwuj stan logowania ────────────────────────────
  onAuthStateChanged(auth, user => {
    currentUser = user;
    updateAuthUI(user);
    listeners.forEach(fn => fn(user));
  });

  // ── Po powrocie z redirectu ────────────────────────────
  getRedirectResult(auth)
    .then(result => {
      if (result?.user) modalAuth.classList.add('hidden');
    })
    .catch(e => {
      console.error('Redirect login error:', e);
      showAuthError(e.message);
    });

  // ── Przycisk w topbarze ───────────────────────────────
  btnAuth.addEventListener('click', () => {
    if (currentUser) {
      if (confirm('Wylogować się?')) signOut(auth);
    } else {
      openModal();
    }
  });

  // ── Zakładki ──────────────────────────────────────────
  document.getElementById('auth-tab-google').addEventListener('click', () => switchTab('google'));
  document.getElementById('auth-tab-email').addEventListener('click',  () => switchTab('email'));

  // ── Google ────────────────────────────────────────────
  document.getElementById('btn-google-login').addEventListener('click', () => handleGoogleLogin(auth, modalAuth));

  // ── Email / hasło ─────────────────────────────────────
  document.getElementById('btn-email-login').addEventListener('click',    () => handleEmailLogin(auth, modalAuth));
  document.getElementById('btn-email-register').addEventListener('click', () => handleEmailRegister(auth, modalAuth));
  document.getElementById('btn-forgot-password').addEventListener('click', () => handleForgotPassword(auth));

  // ── Zamknij modal kliknięciem tła ─────────────────────
  modalAuth.addEventListener('click', e => {
    if (e.target === modalAuth) modalAuth.classList.add('hidden');
  });
}

// ── ZAKŁADKI MODALU ───────────────────────────────────────

function openModal() {
  document.getElementById('modal-auth').classList.remove('hidden');
  switchTab('google');
  clearAuthError();
}

function switchTab(tab) {
  const isGoogle = tab === 'google';
  document.getElementById('auth-tab-google').classList.toggle('auth-tab-active', isGoogle);
  document.getElementById('auth-tab-email').classList.toggle('auth-tab-active', !isGoogle);
  document.getElementById('auth-section-google').classList.toggle('hidden', !isGoogle);
  document.getElementById('auth-section-email').classList.toggle('hidden',  isGoogle);
  clearAuthError();
}

// ── GOOGLE LOGIN ──────────────────────────────────────────

async function handleGoogleLogin(auth, modalAuth) {
  clearAuthError();
  if (isMobile()) {
    try {
      showBtnLoading('btn-google-login', true, 'Zaloguj przez Google');
      await signInWithRedirect(auth, provider);
    } catch(e) {
      showBtnLoading('btn-google-login', false, 'Zaloguj przez Google');
      showAuthError(e.message);
    }
  } else {
    try {
      showBtnLoading('btn-google-login', true, 'Zaloguj przez Google');
      await signInWithPopup(auth, provider);
      modalAuth.classList.add('hidden');
    } catch(e) {
      showBtnLoading('btn-google-login', false, 'Zaloguj przez Google');
      if (e.code === 'auth/popup-blocked') {
        try { await signInWithRedirect(auth, provider); } catch(e2) { showAuthError(e2.message); }
      } else if (e.code !== 'auth/popup-closed-by-user') {
        showAuthError(e.message);
      }
    }
  }
}

// ── EMAIL LOGIN ───────────────────────────────────────────

async function handleEmailLogin(auth, modalAuth) {
  clearAuthError();
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;

  if (!email || !password) { showAuthError('Wypełnij email i hasło.'); return; }

  showBtnLoading('btn-email-login', true, 'Zaloguj');
  try {
    await signInWithEmailAndPassword(auth, email, password);
    modalAuth.classList.add('hidden');
  } catch(e) {
    showBtnLoading('btn-email-login', false, 'Zaloguj');
    if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
      showAuthError('Nieprawidłowy email lub hasło.');
    } else if (e.code === 'auth/wrong-password') {
      showAuthError('Nieprawidłowe hasło.');
    } else {
      showAuthError(e.message);
    }
  }
}

// ── EMAIL REJESTRACJA ─────────────────────────────────────
// Jeśli email istnieje już w Google → łączy konta (account linking).

async function handleEmailRegister(auth, modalAuth) {
  clearAuthError();
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;

  if (!email || !password) { showAuthError('Wypełnij email i hasło.'); return; }
  if (password.length < 6) { showAuthError('Hasło musi mieć co najmniej 6 znaków.'); return; }

  showBtnLoading('btn-email-register', true, 'Zarejestruj');
  try {
    // Sprawdź czy email jest już zarejestrowany (np. przez Google)
    const methods = await fetchSignInMethodsForEmail(auth, email);

    if (methods.includes('google.com') && !methods.includes('password')) {
      // Konto Google z tym emailem istnieje — zaloguj przez Google i połącz
      showAuthError('Ten email jest powiązany z kontem Google. Zaloguj się przez Google — hasło zostanie dodane automatycznie.');
      showBtnLoading('btn-email-register', false, 'Zarejestruj');

      // Zaloguj Googlem, potem linkuj email/hasło
      try {
        const result = isMobile()
          ? await signInWithRedirect(auth, provider)
          : await signInWithPopup(auth, provider);

        if (result?.user) {
          const credential = EmailAuthProvider.credential(email, password);
          await linkWithCredential(result.user, credential);
          modalAuth.classList.add('hidden');
          clearAuthError();
        }
      } catch(linkErr) {
        showAuthError('Nie udało się połączyć kont: ' + linkErr.message);
      }
      return;
    }

    // Normalny zapis email/hasło
    await createUserWithEmailAndPassword(auth, email, password);
    modalAuth.classList.add('hidden');

  } catch(e) {
    showBtnLoading('btn-email-register', false, 'Zarejestruj');
    if (e.code === 'auth/email-already-in-use') {
      showAuthError('Konto z tym emailem już istnieje. Zaloguj się zamiast rejestrować.');
    } else if (e.code === 'auth/invalid-email') {
      showAuthError('Nieprawidłowy adres email.');
    } else if (e.code === 'auth/weak-password') {
      showAuthError('Hasło jest za słabe (minimum 6 znaków).');
    } else {
      showAuthError(e.message);
    }
  }
}

// ── RESET HASŁA ───────────────────────────────────────────

async function handleForgotPassword(auth) {
  clearAuthError();
  const email = document.getElementById('auth-email').value.trim();
  if (!email) { showAuthError('Wpisz adres email w polu powyżej.'); return; }

  try {
    await sendPasswordResetEmail(auth, email);
    showAuthError('✓ Link do resetowania hasła został wysłany na ' + email, true);
  } catch(e) {
    if (e.code === 'auth/user-not-found') {
      showAuthError('Nie znaleziono konta z tym adresem email.');
    } else {
      showAuthError(e.message);
    }
  }
}

// ── PUBLICZNE API ─────────────────────────────────────────

export function onAuthChange(fn) { listeners.push(fn); }
export function getUser()        { return currentUser; }

export function requireAuth() {
  if (!currentUser) {
    openModal();
    return false;
  }
  return true;
}

// ── UI HELPERS ────────────────────────────────────────────

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

function showBtnLoading(btnId, loading, label) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled    = loading;
  btn.textContent = loading ? 'Ładowanie…' : label;
}

function showAuthError(msg, isSuccess = false) {
  const modal = document.getElementById('modal-auth');
  let errEl = modal.querySelector('.auth-error');
  if (!errEl) {
    errEl = document.createElement('p');
    errEl.className = 'auth-error';
    modal.querySelector('.modal-box').appendChild(errEl);
  }
  errEl.textContent = msg;
  errEl.style.cssText = `font-size:.85rem;margin-top:8px;text-align:center;
    color:${isSuccess ? 'var(--accent)' : 'var(--danger,#e55)'};`;
}

function clearAuthError() {
  document.querySelector('#modal-auth .auth-error')?.remove();
}
