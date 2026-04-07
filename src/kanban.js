'use strict';

import './kanban.css';

const COLUMNS = ['ready', 'inprogress', 'submitted', 'graded'];

// ── State ─────────────────────────────────────────────────────────────────────

let allAssignments = [];
let courseColors = {}; // { "Course Name": "#hexcolor" }
let activeFilters = new Set(); // courses to show; empty = show all
let draggingId = null;
let editingId = null;

// ── Storage ───────────────────────────────────────────────────────────────────

function loadData(cb) {
  chrome.storage.sync.get(['assignments', 'courseColors'], (result) => {
    allAssignments = result.assignments || [];
    courseColors = result.courseColors || {};
    cb();
  });
}

function saveData(cb) {
  chrome.storage.sync.set({ assignments: allAssignments, courseColors }, () => {
    if (cb) cb();
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDue(dateStr) {
  if (!dateStr) return null;
  const due = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((due - today) / 86400000);
  if (diff < 0) return { text: `Due ${Math.abs(diff)}d ago`, overdue: true };
  if (diff === 0) return { text: 'Due today', overdue: false };
  return { text: `Due in ${diff}d`, overdue: false };
}

function getCourseColor(course) {
  return (course && courseColors[course]) || '#d1d5db';
}

function getVisibleAssignments() {
  if (activeFilters.size === 0) return allAssignments;
  return allAssignments.filter((a) => activeFilters.has(a.course || ''));
}

// ── Filter Bar ────────────────────────────────────────────────────────────────

function renderFilterBar() {
  const filterBar = document.getElementById('filterBar');
  const chipsEl = document.getElementById('filterChips');
  const clearBtn = document.getElementById('filterClearBtn');

  const courses = [...new Set(allAssignments.map((a) => a.course).filter(Boolean))];

  if (courses.length === 0) {
    filterBar.classList.add('hidden');
    return;
  }
  filterBar.classList.remove('hidden');

  chipsEl.innerHTML = '';
  courses.forEach((course) => {
    const chip = document.createElement('button');
    chip.className = 'filter-chip' + (activeFilters.has(course) ? ' active' : '');
    chip.textContent = course;
    chip.style.setProperty('--chip-color', getCourseColor(course));
    chip.addEventListener('click', () => {
      if (activeFilters.has(course)) {
        activeFilters.delete(course);
      } else {
        activeFilters.add(course);
      }
      renderFilterBar();
      renderBoard();
    });
    chipsEl.appendChild(chip);
  });

  clearBtn.classList.toggle('hidden', activeFilters.size === 0);
}

// ── Board ─────────────────────────────────────────────────────────────────────

function renderBoard() {
  const visible = getVisibleAssignments();
  COLUMNS.forEach((col) => {
    const container = document.getElementById(`cards-${col}`);
    const countEl = document.getElementById(`count-${col}`);
    container.innerHTML = '';
    visible.filter((a) => a.status === col).forEach((a) => container.appendChild(createCardEl(a)));
    countEl.textContent = visible.filter((a) => a.status === col).length;
  });
}

// ── Cards ─────────────────────────────────────────────────────────────────────

function createCardEl(assignment) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = assignment.id;
  card.setAttribute('draggable', 'true');

  const color = getCourseColor(assignment.course);
  const due = formatDue(assignment.due);
  const checklist = assignment.checklist || [];
  const total = checklist.length;
  const done = checklist.filter((c) => c.done).length;

  card.style.setProperty('--course-color', color);

  card.innerHTML = `
    <div class="card-color-bar"></div>
    <div class="card-body">
      <div class="card-title">${escapeHtml(assignment.title)}</div>
      ${assignment.course ? `<div class="card-course">${escapeHtml(assignment.course)}</div>` : ''}
      <div class="card-meta">
        ${due ? `<span class="card-due${due.overdue ? ' overdue' : ''}">${due.text}</span>` : ''}
        ${total > 0 ? `<span class="card-checklist-count">${done}/${total} tasks</span>` : ''}
      </div>
      <div class="card-footer">
        <div class="card-move-btns">
          <button class="card-btn move-left" title="Move left">&larr;</button>
          <button class="card-btn move-right" title="Move right">&rarr;</button>
        </div>
      </div>
    </div>
  `;

  // Click card body (not buttons) → open edit panel
  card.querySelector('.card-body').addEventListener('click', (e) => {
    if (!e.target.closest('.card-btn')) openEditPanel(assignment.id);
  });

  card.querySelector('.move-left').addEventListener('click', (e) => {
    e.stopPropagation();
    moveCard(assignment.id, -1);
  });
  card.querySelector('.move-right').addEventListener('click', (e) => {
    e.stopPropagation();
    moveCard(assignment.id, 1);
  });

  // Drag events
  card.addEventListener('dragstart', (e) => {
    draggingId = assignment.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', assignment.id);
  });
  card.addEventListener('dragend', () => {
    draggingId = null;
    card.classList.remove('dragging');
    document.querySelectorAll('.column').forEach((c) => c.classList.remove('drag-over'));
  });

  return card;
}

function moveCard(id, direction) {
  const assignment = allAssignments.find((a) => a.id === id);
  if (!assignment) return;
  const idx = COLUMNS.indexOf(assignment.status);
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= COLUMNS.length) return;
  assignment.status = COLUMNS[newIdx];
  saveData(() => { renderFilterBar(); renderBoard(); });
}

// ── Drag & Drop ───────────────────────────────────────────────────────────────

function setupDragAndDrop() {
  COLUMNS.forEach((col) => {
    const colEl = document.getElementById(`col-${col}`);

    colEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      colEl.classList.add('drag-over');
    });

    colEl.addEventListener('dragleave', (e) => {
      if (!colEl.contains(e.relatedTarget)) {
        colEl.classList.remove('drag-over');
      }
    });

    colEl.addEventListener('drop', (e) => {
      e.preventDefault();
      colEl.classList.remove('drag-over');
      if (!draggingId) return;
      const assignment = allAssignments.find((a) => a.id === draggingId);
      if (!assignment || assignment.status === col) return;
      assignment.status = col;
      saveData(() => { renderFilterBar(); renderBoard(); });
    });
  });
}

// ── Edit Panel ────────────────────────────────────────────────────────────────

function openEditPanel(id) {
  editingId = id;
  const assignment = allAssignments.find((a) => a.id === id);
  if (!assignment) return;

  const color = getCourseColor(assignment.course);
  const due = formatDue(assignment.due);

  // Title
  const titleEl = document.getElementById('editTitle');
  titleEl.textContent = assignment.title;

  // Course badge
  const badge = document.getElementById('editCourseBadge');
  if (assignment.course) {
    badge.textContent = assignment.course;
    badge.style.backgroundColor = color;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }

  // Due date
  const dueEl = document.getElementById('editDue');
  if (due) {
    dueEl.textContent = due.text;
    dueEl.className = 'edit-due' + (due.overdue ? ' overdue' : '');
  } else {
    dueEl.textContent = '';
  }

  // Notes
  document.getElementById('editNotes').value = assignment.notes || '';

  // Checklist
  renderChecklist(assignment.checklist || []);

  document.getElementById('editPanel').classList.remove('hidden');
  titleEl.focus();

  // Move cursor to end of contenteditable
  const range = document.createRange();
  range.selectNodeContents(titleEl);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function closeEditPanel() {
  editingId = null;
  document.getElementById('editPanel').classList.add('hidden');
  document.getElementById('checklistInput').value = '';
}

function renderChecklist(items) {
  const list = document.getElementById('editChecklist');
  list.innerHTML = '';
  items.forEach((item) => {
    list.appendChild(createChecklistRow(item.id, item.text, item.done));
  });
}

function createChecklistRow(id, text, done) {
  const row = document.createElement('div');
  row.className = 'checklist-item' + (done ? ' done' : '');
  row.dataset.id = id;
  row.innerHTML = `
    <input type="checkbox" class="checklist-cb" ${done ? 'checked' : ''} />
    <span class="checklist-text">${escapeHtml(text)}</span>
    <button class="checklist-del" title="Remove">&#x2715;</button>
  `;
  row.querySelector('.checklist-cb').addEventListener('change', (e) => {
    row.classList.toggle('done', e.target.checked);
  });
  row.querySelector('.checklist-del').addEventListener('click', () => row.remove());
  return row;
}

function collectChecklist() {
  return Array.from(document.querySelectorAll('#editChecklist .checklist-item')).map((row) => ({
    id: row.dataset.id,
    text: row.querySelector('.checklist-text').textContent,
    done: row.querySelector('.checklist-cb').checked,
  }));
}

function setupEditPanel() {
  document.getElementById('editCancelBtn').addEventListener('click', closeEditPanel);

  document.getElementById('editPanel').addEventListener('click', (e) => {
    if (e.target === document.getElementById('editPanel')) closeEditPanel();
  });

  document.getElementById('editDeleteBtn').addEventListener('click', () => {
    if (!editingId) return;
    allAssignments = allAssignments.filter((a) => a.id !== editingId);
    saveData(() => { renderFilterBar(); renderBoard(); closeEditPanel(); });
  });

  document.getElementById('editSaveBtn').addEventListener('click', () => {
    if (!editingId) return;
    const assignment = allAssignments.find((a) => a.id === editingId);
    if (!assignment) return;
    const newTitle = document.getElementById('editTitle').textContent.trim();
    if (newTitle) assignment.title = newTitle;
    assignment.notes = document.getElementById('editNotes').value;
    assignment.checklist = collectChecklist();
    saveData(() => { renderFilterBar(); renderBoard(); closeEditPanel(); });
  });

  // Add checklist item
  const checklistInput = document.getElementById('checklistInput');
  const addItem = () => {
    const text = checklistInput.value.trim();
    if (!text) return;
    const row = createChecklistRow(Date.now().toString(), text, false);
    document.getElementById('editChecklist').appendChild(row);
    checklistInput.value = '';
    checklistInput.focus();
  };
  document.getElementById('checklistAddBtn').addEventListener('click', addItem);
  checklistInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addItem(); });
}

// ── New Assignment Modal ──────────────────────────────────────────────────────

function setupModal() {
  const modal = document.getElementById('modal');
  const titleInput = document.getElementById('assignmentTitle');
  const courseInput = document.getElementById('assignmentCourse');
  const colorInput = document.getElementById('assignmentColor');
  const dueInput = document.getElementById('assignmentDue');

  // Auto-fill color when a known course name is typed
  courseInput.addEventListener('input', () => {
    const known = courseColors[courseInput.value.trim()];
    if (known) colorInput.value = known;
  });

  document.getElementById('newAssignmentBtn').addEventListener('click', () => {
    titleInput.value = '';
    courseInput.value = '';
    colorInput.value = '#4f8ef7';
    dueInput.value = '';

    // Populate datalist with known courses
    const dl = document.getElementById('courseDatalist');
    dl.innerHTML = '';
    Object.keys(courseColors).forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      dl.appendChild(opt);
    });

    modal.classList.remove('hidden');
    titleInput.focus();
  });

  document.getElementById('cancelModalBtn').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

  document.getElementById('saveAssignmentBtn').addEventListener('click', () => {
    const title = titleInput.value.trim();
    if (!title) { titleInput.focus(); return; }
    const course = courseInput.value.trim();
    const color = colorInput.value;

    if (course) courseColors[course] = color;

    allAssignments.push({
      id: Date.now().toString(),
      title,
      course,
      due: dueInput.value,
      status: 'ready',
      notes: '',
      checklist: [],
    });

    saveData(() => { renderFilterBar(); renderBoard(); modal.classList.add('hidden'); });
  });
}

// ── Clear All ─────────────────────────────────────────────────────────────────

function setupClearAll() {
  document.getElementById('clearAllBtn').addEventListener('click', () => {
    if (!confirm('Clear all assignments?')) return;
    allAssignments = [];
    activeFilters.clear();
    saveData(() => { renderFilterBar(); renderBoard(); });
  });
}

// ── Filter Clear ──────────────────────────────────────────────────────────────

function setupFilterClear() {
  document.getElementById('filterClearBtn').addEventListener('click', () => {
    activeFilters.clear();
    renderFilterBar();
    renderBoard();
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  setupModal();
  setupEditPanel();
  setupClearAll();
  setupFilterClear();

  loadData(() => {
    renderFilterBar();
    renderBoard();
    setupDragAndDrop();
  });
});
