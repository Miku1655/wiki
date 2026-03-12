// theme.js — Zarządzanie trybem jasnym/ciemnym

export function initTheme() {
  const saved = localStorage.getItem('kp_theme') || 'light';
  applyTheme(saved);

  document.getElementById('btn-theme').addEventListener('click', toggleTheme);
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('kp_theme', theme);
  const btn = document.getElementById('btn-theme');
  if (btn) btn.title = theme === 'dark' ? 'Tryb jasny' : 'Tryb ciemny';
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
}
