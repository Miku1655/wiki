// sidebar-left.js — Lewy panel: drzewo kategorii

import { buildCategoryTree, getCategoryOptions, saveCategoryToStore, deleteCategoryFromStore, loadCategoriesData, getAllCategories } from './categories.js';
import { filterByCategory } from './search.js';
import { showToast } from './ui.js';

let navigateFn = null;
let openNodes = new Set();

export function initSidebarLeft(navigateCallback) {
  navigateFn = navigateCallback;

  document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
    document.getElementById('sidebar-left').classList.toggle('collapsed');
  });

  document.getElementById('btn-new-category').addEventListener('click', () => {
    openCategoryModal(null);
  });

  document.getElementById('btn-category-save').addEventListener('click', saveCategoryFromModal);
  document.getElementById('btn-category-cancel').addEventListener('click', closeCategoryModal);
  document.getElementById('modal-category').addEventListener('click', e => {
    if (e.target.id === 'modal-category') closeCategoryModal();
  });
}

export function renderCategoryTree() {
  const tree = buildCategoryTree();
  const container = document.getElementById('category-tree');
  container.innerHTML = '';

  if (!tree.length) {
    container.innerHTML = '<div style="padding:10px 14px;font-size:.8rem;color:var(--text-faint)">Brak kategorii.<br>Dodaj pierwszą ↑</div>';
  } else {
    tree.forEach(node => {
      container.appendChild(renderNode(node, 0));
    });
  }

  // "Nieposegregowane" — artykuły bez kategorii
  const uncatRow = document.createElement('div');
  uncatRow.className = 'tree-node-row';
  uncatRow.style.paddingLeft = '14px';
  uncatRow.style.marginTop = tree.length ? '4px' : '0';
  uncatRow.style.borderTop = tree.length ? '1px solid var(--border-light)' : 'none';
  uncatRow.innerHTML = `
    <span class="tree-toggle"></span>
    <span class="tree-icon">📋</span>
    <span class="tree-label" style="color:var(--text-muted)">Nieposegregowane</span>
  `;
  uncatRow.addEventListener('click', () => {
    if (navigateFn) navigateFn('category/__uncategorized__');
  });
  container.appendChild(uncatRow);

  // "Wszystkie artykuły" — na samym dole
  const allRow = document.createElement('div');
  allRow.className = 'tree-node-row';
  allRow.style.paddingLeft = '14px';
  allRow.style.borderTop = '1px solid var(--border-light)';
  allRow.innerHTML = `
    <span class="tree-toggle"></span>
    <span class="tree-icon">📄</span>
    <span class="tree-label" style="color:var(--text-muted)">Wszystkie artykuły</span>
  `;
  allRow.addEventListener('click', () => {
    if (navigateFn) navigateFn('all-articles');
  });
  container.appendChild(allRow);
}

function renderNode(node, depth) {
  const el = document.createElement('div');
  el.className = 'tree-node';

  const row = document.createElement('div');
  row.className = 'tree-node-row';
  row.style.paddingLeft = `${14 + depth * 14}px`;

  const toggle = document.createElement('span');
  toggle.className = 'tree-toggle' + (openNodes.has(node.id) ? ' open' : '');
  toggle.textContent = node.children?.length ? '▶' : '';

  const icon = document.createElement('span');
  icon.className = 'tree-icon';
  icon.textContent = node.children?.length ? '📁' : '📂';

  const label = document.createElement('span');
  label.className = 'tree-label';
  label.textContent = node.name;

  row.addEventListener('contextmenu', e => {
    e.preventDefault();
    openCategoryModal(node);
  });

  row.addEventListener('click', () => {
    if (node.children?.length) {
      if (openNodes.has(node.id)) openNodes.delete(node.id);
      else openNodes.add(node.id);
      renderCategoryTree();
    }
    if (navigateFn) navigateFn('category/' + node.id);
  });

  row.appendChild(toggle);
  row.appendChild(icon);
  row.appendChild(label);
  el.appendChild(row);

  if (node.children?.length && openNodes.has(node.id)) {
    const children = document.createElement('div');
    children.className = 'tree-children';
    node.children.forEach(child => children.appendChild(renderNode(child, depth + 1)));
    el.appendChild(children);
  }

  return el;
}

export function highlightActiveCategory(categoryId) {
  document.querySelectorAll('.tree-node-row').forEach(row => row.classList.remove('active'));
  if (categoryId) {
    document.querySelectorAll('.tree-node-row').forEach(row => {
      if (row.dataset?.categoryId === categoryId) row.classList.add('active');
    });
  }
}

// ── MODAL KATEGORII ───────────────────────────────────────

function openCategoryModal(existingCategory) {
  const modal = document.getElementById('modal-category');
  const titleEl = document.getElementById('modal-category-title');
  const nameInput = document.getElementById('input-category-name');
  const parentSelect = document.getElementById('input-category-parent');

  titleEl.textContent = existingCategory ? 'Edytuj kategorię' : 'Nowa kategoria';
  nameInput.value = existingCategory?.name || '';

  const options = getCategoryOptions();
  parentSelect.innerHTML = '<option value="">— brak (główna) —</option>';
  options.forEach(opt => {
    if (existingCategory && opt.id === existingCategory.id) return;
    const o = document.createElement('option');
    o.value = opt.id;
    o.textContent = opt.name;
    if (existingCategory && opt.id === existingCategory.parentId) o.selected = true;
    parentSelect.appendChild(o);
  });

  modal.dataset.editingId = existingCategory?.id || '';
  modal.classList.remove('hidden');
  nameInput.focus();
}

function closeCategoryModal() {
  document.getElementById('modal-category').classList.add('hidden');
}

async function saveCategoryFromModal() {
  const nameInput = document.getElementById('input-category-name');
  const parentSelect = document.getElementById('input-category-parent');
  const modal = document.getElementById('modal-category');
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }

  const cat = {
    id: modal.dataset.editingId || undefined,
    name,
    parentId: parentSelect.value || null
  };

  try {
    await saveCategoryToStore(cat);
    closeCategoryModal();
    renderCategoryTree();
    showToast('Kategoria zapisana');
  } catch(e) {
    console.error(e);
    showToast('Błąd zapisu kategorii');
  }
}
