// sidebar-left.js — Lewy panel: drzewo kategorii z drag & drop

import { buildCategoryTree, getCategoryOptions, saveCategoryToStore, deleteCategoryFromStore, loadCategoriesData, getAllCategories, saveCategoryOrder } from './categories.js';
import { filterByCategory } from './search.js';
import { getAllMeta, saveArticle, getArticleFull } from './articles.js';
import { showToast } from './ui.js';

let navigateFn = null;
let openNodes = new Set();

// Drag & drop state
let _dragCatId   = null;
let _dragPlaceholder = null;

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
  el.dataset.catId = node.id;

  const row = document.createElement('div');
  row.className = 'tree-node-row';
  row.style.paddingLeft = `${14 + depth * 14}px`;
  row.dataset.catId = node.id;
  row.dataset.parentId = node.parentId || '';
  row.dataset.depth = depth;

  // Drag handle
  const dragHandle = document.createElement('span');
  dragHandle.className = 'tree-drag-handle';
  dragHandle.textContent = '⠿';
  dragHandle.title = 'Przeciągnij aby zmienić kolejność';

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

  row.addEventListener('click', e => {
    if (e.target === dragHandle) return;
    if (node.children?.length) {
      if (openNodes.has(node.id)) openNodes.delete(node.id);
      else openNodes.add(node.id);
      renderCategoryTree();
    }
    if (navigateFn) navigateFn('category/' + node.id);
  });

  row.appendChild(dragHandle);
  row.appendChild(toggle);
  row.appendChild(icon);
  row.appendChild(label);

  // Drag & drop
  row.draggable = true;
  _bindCatDrag(row, node, depth);

  el.appendChild(row);

  if (node.children?.length && openNodes.has(node.id)) {
    const children = document.createElement('div');
    children.className = 'tree-children';
    node.children.forEach(child => children.appendChild(renderNode(child, depth + 1)));
    el.appendChild(children);
  }

  return el;
}

// ── DRAG & DROP KATEGORII ─────────────────────────────────

function _bindCatDrag(row, node, depth) {
  row.addEventListener('dragstart', e => {
    _dragCatId = node.id;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', node.id);

    _dragPlaceholder = document.createElement('div');
    _dragPlaceholder.className = 'tree-drag-placeholder';
    _dragPlaceholder.style.height = row.offsetHeight + 'px';
    _dragPlaceholder.style.paddingLeft = row.style.paddingLeft;
  });

  row.addEventListener('dragend', () => {
    row.classList.remove('dragging');
    _dragPlaceholder?.remove();
    _dragCatId = null;
    _dragPlaceholder = null;
  });

  row.addEventListener('dragover', e => {
    e.preventDefault();
    if (!_dragCatId || _dragCatId === node.id) return;
    e.dataTransfer.dropEffect = 'move';

    const rect = row.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    if (before) {
      row.parentNode.insertBefore(_dragPlaceholder, row);
    } else {
      row.parentNode.insertBefore(_dragPlaceholder, row.nextSibling);
    }
  });

  row.addEventListener('drop', e => {
    e.preventDefault();
    if (!_dragCatId || _dragCatId === node.id) return;

    const allCats = getAllCategories();
    const draggedCat = allCats.find(c => c.id === _dragCatId);
    if (!draggedCat) return;

    // Nowe rodzeństwo — kategorie na tym samym poziomie i tym samym parentId
    const parentId = node.parentId || null;
    const siblings = allCats
      .filter(c => (c.parentId || null) === parentId && c.id !== _dragCatId)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

    const targetIdx = siblings.findIndex(c => c.id === node.id);
    const rect = row.getBoundingClientRect();
    const before = e.clientY < rect.top + row.offsetHeight / 2;
    const insertAt = before ? targetIdx : targetIdx + 1;

    siblings.splice(insertAt, 0, draggedCat);
    const newOrder = siblings.map(c => c.id);
    saveCategoryOrder(newOrder, parentId);

    renderCategoryTree();
    showToast('Kolejność kategorii zapisana');
  });
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
  const modal      = document.getElementById('modal-category');
  const titleEl    = document.getElementById('modal-category-title');
  const nameInput  = document.getElementById('input-category-name');
  const parentSel  = document.getElementById('input-category-parent');

  titleEl.textContent = existingCategory ? 'Edytuj kategorię' : 'Nowa kategoria';
  nameInput.value = existingCategory?.name || '';

  const options = getCategoryOptions();
  parentSel.innerHTML = '<option value="">— brak (główna) —</option>';
  options.forEach(opt => {
    if (existingCategory && opt.id === existingCategory.id) return;
    const o = document.createElement('option');
    o.value = opt.id;
    o.textContent = opt.name;
    if (existingCategory && opt.id === existingCategory.parentId) o.selected = true;
    parentSel.appendChild(o);
  });

  modal.dataset.editingId = existingCategory?.id || '';

  // Usuń stary przycisk usuwania
  modal.querySelector('#btn-category-delete')?.remove();

  if (existingCategory?.id) {
    const actionsEl = modal.querySelector('.modal-actions');
    const deleteBtn = document.createElement('button');
    deleteBtn.id = 'btn-category-delete';
    deleteBtn.className = 'btn-danger';
    deleteBtn.style.marginRight = 'auto';
    deleteBtn.textContent = 'Usuń';
    deleteBtn.addEventListener('click', () => deleteCategoryFromModal(existingCategory));
    actionsEl.prepend(deleteBtn);
  }

  modal.classList.remove('hidden');
  nameInput.focus();
}

function closeCategoryModal() {
  document.getElementById('modal-category').classList.add('hidden');
  document.getElementById('btn-category-delete')?.remove();
}

async function saveCategoryFromModal() {
  const nameInput  = document.getElementById('input-category-name');
  const parentSel  = document.getElementById('input-category-parent');
  const modal      = document.getElementById('modal-category');
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }

  const cat = {
    id:       modal.dataset.editingId || undefined,
    name,
    parentId: parentSel.value || null
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

// ── USUWANIE KATEGORII ────────────────────────────────────

async function deleteCategoryFromModal(category) {
  const allCats     = getAllCategories();
  const allArticles = getAllMeta();

  const subtreeIds = getSubtreeIds(category.id, allCats);
  const affectedArticles = allArticles.filter(a => subtreeIds.includes(a.category));
  const childCats = subtreeIds.filter(id => id !== category.id);

  const lines = [`Usunąć kategorię „${category.name}"?`];
  if (childCats.length) {
    lines.push(`\nZostanie też usuniętych ${childCats.length} podkategor${childCats.length === 1 ? 'ia' : 'ii'}.`);
  }
  if (affectedArticles.length) {
    lines.push(`\n${affectedArticles.length} artykuł${affectedArticles.length === 1 ? '' : 'ów'} straci przypisaną kategorię (nie zostaną usunięte).`);
  }

  if (!confirm(lines.join(''))) return;

  closeCategoryModal();

  const saveBtn = document.getElementById('btn-category-save');
  if (saveBtn) { saveBtn.disabled = true; }

  try {
    for (const id of [...subtreeIds].reverse()) {
      await deleteCategoryFromStore(id);
    }

    if (affectedArticles.length) {
      await Promise.all(affectedArticles.map(async meta => {
        try {
          const full = await getArticleFull(meta.id);
          if (full) await saveArticle({ ...full, category: '' });
        } catch(e) {
          console.warn('Nie można wyczyścić kategorii artykułu:', meta.id, e);
        }
      }));
    }

    renderCategoryTree();
    const msg = childCats.length || affectedArticles.length
      ? `Usunięto „${category.name}"${childCats.length ? ` i ${childCats.length} podkategor${childCats.length===1?'ię':'ii'}` : ''}${affectedArticles.length ? `. ${affectedArticles.length} artykułów bez kategorii.` : '.'}`
      : `Usunięto kategorię „${category.name}"`;
    showToast(msg);

  } catch(e) {
    console.error(e);
    showToast('Błąd usuwania kategorii: ' + e.message);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; }
  }
}

function getSubtreeIds(rootId, allCats) {
  const ids = [];
  const queue = [rootId];
  while (queue.length) {
    const current = queue.shift();
    ids.push(current);
    allCats
      .filter(c => c.parentId === current)
      .forEach(c => queue.push(c.id));
  }
  return ids;
}
