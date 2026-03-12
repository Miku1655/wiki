// auth.js — Logowanie przez Google (Firebase Auth)
// Na mobile używa signInWithRedirect (popup blokowany przez Safari/Chrome iOS),
// na desktopie signInWithPopup dla lepszego UX.

import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const provider = new GoogleAuthProvider();
let currentUser = null;
const listeners = [];

/** Zwraca true jeśli jesteśmy na urządzeniu mobilnym / przeglądarce bez popupów */
function isMobile() {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent)); // iPad na iOS 13+
}

export function initAuth() {
  const auth     = window.__auth;
  const btnAuth  = document.getElementById('btn-auth');
  const modalAuth = document.getElementById('modal-auth');
  const btnLogin = document.getElementById('btn-google-login');

  // ── Obserwuj stan logowania ────────────────────────────
  onAuthStateChanged(auth, user => {
    currentUser = user;
    updateAuthUI(user);
    listeners.forEach(fn => fn(user));
  });

  // ── Po powrocie z redirectu — odbierz wynik ────────────
  // Musi być wywołane przy każdym ładowaniu strony; na desktop zwraca null.
  getRedirectResult(auth)
    .then(result => {
      if (result?.user) {
        // Pomyślne logowanie przez redirect — modalAuth już zakrywa widok,
        // onAuthStateChanged wywoła się sam i zamknie modal.
        modalAuth.classList.add('hidden');
      }
    })
    .catch(e => {
      console.error('Redirect login error:', e);
      // Pokaż modal z komunikatem błędu zamiast wyrzucać alert
      showAuthError(e.message);
    });

  // ── Przycisk w topbarze ───────────────────────────────
  btnAuth.addEventListener('click', () => {
    if (currentUser) {
      if (confirm('Wylogować się?')) signOut(auth);
    } else {
      modalAuth.classList.remove('hidden');
    }
  });

  // ── Przycisk logowania w modalu ───────────────────────
  btnLogin.addEventListener('click', async () => {
    clearAuthError();
    if (isMobile()) {
      // Na mobile: redirect — przeglądarka wróci po autoryzacji
      try {
        showLoginLoading(btnLogin, true);
        await signInWithRedirect(auth, provider);
        // Dalsze wykonanie po tym await nie nastąpi — strona się przeładuje
      } catch (e) {
        showLoginLoading(btnLogin, false);
        showAuthError(e.message);
        console.error('Redirect init error:', e);
      }
    } else {
      // Na desktopie: popup
      try {
        showLoginLoading(btnLogin, true);
        await signInWithPopup(auth, provider);
        modalAuth.classList.add('hidden');
      } catch (e) {
        showLoginLoading(btnLogin, false);
        console.error('Popup login error:', e);
        if (e.code === 'auth/popup-blocked') {
          // Fallback: popup zablokowany — spróbuj redirectem
          try {
            await signInWithRedirect(auth, provider);
          } catch (e2) {
            showAuthError(e2.message);
          }
        } else if (e.code !== 'auth/popup-closed-by-user') {
          showAuthError(e.message);
        }
      }
    }
  });

  // ── Zamknij modal kliknięciem tła ─────────────────────
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

// ── UI helpers ────────────────────────────────────────────

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

function showLoginLoading(btn, loading) {
  btn.disabled = loading;
  btn.textContent = loading ? 'Przekierowuję…' : 'Zaloguj przez Google';
}

function showAuthError(msg) {
  const modal = document.getElementById('modal-auth');
  let errEl = modal.querySelector('.auth-error');
  if (!errEl) {
    errEl = document.createElement('p');
    errEl.className = 'auth-error';
    errEl.style.cssText = 'color:var(--danger,#e55);font-size:.85rem;margin-top:10px;text-align:center';
    modal.querySelector('.modal-box').appendChild(errEl);
  }
  errEl.textContent = 'Błąd logowania: ' + msg;
}

function clearAuthError() {
  document.querySelector('#modal-auth .auth-error')?.remove();
}
