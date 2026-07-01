/**
 * Household Tasks Dashboard - Core Application Logic
 */

// --- Google Sheets Config ---
const SHEET_ID = '18n_93cw2RA-8-h79nKVnzeEhu-dndUp6V3FycuGjVrY';
const TASKS_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
const MILESTONES_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=23811170`;
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzDqZw_klaVaY2lIgjETkGhnhTRF3Y8LLtRfR5DiwWZya9fj9xPQ4wO6vP25WgGHUKEsA/exec'; // paste GAS Web App /exec URL here after deployment

// --- Application State ---
let appState = {
  tasks: [],
  filteredTasks: [],
  milestones: {},   // { 'Seattle Trip': 'Jul 4, 2026', ... }
  currentView: 'grid',
  activeFilters: {
    search: '',
    category: 'all',
    subCategory: 'all',
    owner: 'all',
    priority: 'all',
    milestone: 'all',
    status: 'all'
  },
  theme: 'light'
};

// Default Column Indices
let columnMapping = {
  id: -1,
  title: 0,
  category: 1,
  subCategory: 2,
  owner: 3,
  dateSet: 4,
  status: 5,
  priority: 6,
  milestone: 7,
  dateCompleted: 8,
  notes: 9
};

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initEventListeners();
  loadSheetData();
});

// --- Theme Management ---
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  appState.theme = savedTheme;
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon();
}

function toggleTheme() {
  const newTheme = appState.theme === 'light' ? 'dark' : 'light';
  appState.theme = newTheme;
  localStorage.setItem('theme', newTheme);
  document.documentElement.setAttribute('data-theme', newTheme);
  updateThemeIcon();
}

function updateThemeIcon() {
  const sunIcon = document.querySelector('.sun-icon');
  const moonIcon = document.querySelector('.moon-icon');
  if (appState.theme === 'dark') {
    sunIcon.style.display = 'block';
    moonIcon.style.display = 'none';
  } else {
    sunIcon.style.display = 'none';
    moonIcon.style.display = 'block';
  }
}

// --- Event Listeners ---
function initEventListeners() {
  document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);
  document.getElementById('refresh-btn').addEventListener('click', loadSheetData);

  document.getElementById('search-input').addEventListener('input', (e) => {
    appState.activeFilters.search = e.target.value;
    filterAndRender();
  });

  document.getElementById('category-filter').addEventListener('change', (e) => {
    appState.activeFilters.category = e.target.value;
    filterAndRender();
  });

  document.getElementById('subcategory-filter').addEventListener('change', (e) => {
    appState.activeFilters.subCategory = e.target.value;
    filterAndRender();
  });

  document.getElementById('owner-filter').addEventListener('change', (e) => {
    appState.activeFilters.owner = e.target.value;
    filterAndRender();
  });

  document.getElementById('priority-filter').addEventListener('change', (e) => {
    appState.activeFilters.priority = e.target.value;
    filterAndRender();
  });

  document.getElementById('milestone-filter').addEventListener('change', (e) => {
    appState.activeFilters.milestone = e.target.value;
    filterAndRender();
  });

  document.getElementById('status-filter').addEventListener('change', (e) => {
    appState.activeFilters.status = e.target.value;
    filterAndRender();
  });

  document.getElementById('clear-filters-btn').addEventListener('click', clearFilters);
  document.getElementById('view-grid-btn').addEventListener('click', () => switchView('grid'));
  document.getElementById('view-kanban-btn').addEventListener('click', () => switchView('kanban'));

  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('task-modal').addEventListener('click', (e) => {
    if (e.target.id === 'task-modal') closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  document.getElementById('add-task-btn').addEventListener('click', openAddTaskModal);

  document.getElementById('modal-edit-btn').addEventListener('click', () => {
    document.querySelector('#task-modal .modal-window').classList.add('modal-editing');
  });
  document.getElementById('modal-cancel-btn').addEventListener('click', () => {
    const win = document.querySelector('#task-modal .modal-window');
    win.classList.remove('modal-editing', 'modal-adding');
  });
  document.getElementById('modal-save-btn').addEventListener('click', saveTask);
  document.getElementById('modal-delete-btn').addEventListener('click', () => {
    document.getElementById('modal-delete-confirm').style.display = 'flex';
  });
  document.getElementById('modal-confirm-delete-btn').addEventListener('click', () => {
    deleteTask(document.getElementById('task-modal').dataset.taskId);
  });
  document.getElementById('modal-cancel-delete-btn').addEventListener('click', () => {
    document.getElementById('modal-delete-confirm').style.display = 'none';
  });

  setupKanbanDragAndDrop();
}

// --- Google Sheets Data Fetch ---
async function loadSheetData() {
  showLoadingState();
  try {
    const [tasksRes, milestonesRes] = await Promise.all([
      fetch(TASKS_URL),
      fetch(MILESTONES_URL)
    ]);

    if (!tasksRes.ok) throw new Error(`Tasks sheet returned HTTP ${tasksRes.status}.`);
    if (!milestonesRes.ok) throw new Error(`Milestones sheet returned HTTP ${milestonesRes.status}.`);

    const [tasksCsv, milestonesCsv] = await Promise.all([
      tasksRes.text(),
      milestonesRes.text()
    ]);

    // Detect auth redirect (sheet is private)
    if (isHtml(tasksCsv)) throw new Error('Tasks sheet is not publicly accessible.');
    if (isHtml(milestonesCsv)) throw new Error('Milestones sheet is not publicly accessible.');

    appState.milestones = parseMilestonesCSV(milestonesCsv);
    populateMilestoneFilter();

    const lines = parseCSV(tasksCsv);
    appState.tasks = processTasksFromCSV(lines);

    filterAndRender();
  } catch (err) {
    showErrorState(err.message);
  }
}

function isHtml(text) {
  const t = text.trimStart().toLowerCase();
  return t.startsWith('<!doctype') || t.startsWith('<html');
}

// --- Milestone Sheet Parsing ---
function parseMilestonesCSV(csvText) {
  const lines = parseCSV(csvText);
  if (lines.length < 2) return {};

  const headers = lines[0];
  const nameCol = headers.findIndex(h => /milestone/i.test(h.trim()));
  const dateCol = headers.findIndex(h => /date/i.test(h.trim()));

  if (nameCol === -1) return {};

  const result = {};
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    const name = row[nameCol] ? row[nameCol].trim() : '';
    if (!name) continue;
    const date = (dateCol !== -1 && row[dateCol]) ? row[dateCol].trim() : '';
    result[name] = date;
  }
  return result;
}

function populateMilestoneFilter() {
  const select = document.getElementById('milestone-filter');
  const current = select.value;
  select.innerHTML = '<option value="all">All Milestones</option>';
  Object.entries(appState.milestones).forEach(([name, date]) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = date ? `${name} (${date})` : name;
    select.appendChild(opt);
  });
  // Restore prior selection if it still exists
  if ([...select.options].some(o => o.value === current)) select.value = current;
}

// --- Loading / Error States ---
function showLoadingState() {
  document.getElementById('tasks-grid-container').innerHTML = '';
  ['kanban-wrapper-todo', 'kanban-wrapper-progress', 'kanban-wrapper-done'].forEach(id => {
    document.getElementById(id).innerHTML = '';
  });
  const panel = document.getElementById('empty-state-panel');
  panel.style.display = 'flex';
  document.getElementById('empty-state-icon').textContent = '⏳';
  document.getElementById('empty-state-title').textContent = 'Loading tasks…';
  document.getElementById('empty-state-text').textContent = 'Fetching data from Google Sheets.';
}

function showErrorState(message) {
  const panel = document.getElementById('empty-state-panel');
  panel.style.display = 'flex';
  document.getElementById('empty-state-icon').textContent = '⚠️';
  document.getElementById('empty-state-title').textContent = 'Could not load tasks';
  document.getElementById('empty-state-text').textContent =
    `${message} Make sure the sheet is shared as "Anyone with the link can view".`;
}

// --- CSV Parsing Engine ---
function parseCSV(text) {
  const lines = [];
  let row = [''];
  let insideQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      row.push('');
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') i++;
      lines.push(row);
      row = [''];
    } else {
      row[row.length - 1] += char;
    }
  }

  if (row.length > 1 || row[0] !== '') lines.push(row);
  return lines;
}

function mapHeaders(headers) {
  const findColumn = (regexList) => {
    for (const regex of regexList) {
      const idx = headers.findIndex(h => regex.test(h.trim()));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  columnMapping.id = findColumn([/^id$/i]);
  columnMapping.title = findColumn([/task.*desc/i, /description/i, /task/i, /title/i, /name/i, /summary/i, /subject/i, /activity/i]);
  columnMapping.category = findColumn([/^cat/i, /^type/i, /^group/i, /^area/i, /^label/i]);
  columnMapping.subCategory = findColumn([/sub.?cat/i, /sub.?type/i]);
  columnMapping.owner = findColumn([/owner/i, /bearer/i, /assigned/i, /person/i]);
  columnMapping.dateSet = findColumn([/date.?set/i, /set.?date/i, /date.?start/i, /created/i]);
  columnMapping.status = findColumn([/^status$/i, /^state$/i, /^stage$/i]);
  columnMapping.priority = findColumn([/prior/i, /import/i, /urg/i, /^level/i]);
  columnMapping.milestone = findColumn([/milestone/i, /goal/i, /sprint/i, /phase/i]);
  columnMapping.dateCompleted = findColumn([/date.?comp/i, /comp.*date/i, /finish/i, /end.?date/i]);
  columnMapping.notes = findColumn([/note/i, /comment/i, /remark/i, /extra/i]);

  if (columnMapping.title === -1) columnMapping.title = 0;
  if (columnMapping.category === -1) columnMapping.category = 1 < headers.length ? 1 : 0;
  if (columnMapping.status === -1) columnMapping.status = 2 < headers.length ? 2 : 0;
}

function processTasksFromCSV(lines) {
  if (lines.length < 2) return [];

  const headers = lines[0];
  mapHeaders(headers);

  const tasks = [];
  const get = (row, col) => (col !== -1 && row[col]) ? row[col].trim() : '';

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (row.length === 0 || (row.length === 1 && row[0].trim() === '')) continue;

    const rawTitle = get(row, columnMapping.title);
    if (!rawTitle) continue;

    const rawCategory = get(row, columnMapping.category);
    const rawSubCategory = get(row, columnMapping.subCategory);
    const rawOwner = get(row, columnMapping.owner);
    const rawDateSet = get(row, columnMapping.dateSet);
    const rawStatus = get(row, columnMapping.status);
    const rawPriority = get(row, columnMapping.priority);
    const rawMilestone = get(row, columnMapping.milestone);
    const rawDateComp = get(row, columnMapping.dateCompleted);
    const rawNotes = get(row, columnMapping.notes);

    // Normalize Category
    let category = 'Other';
    if (/house/i.test(rawCategory)) category = 'House';
    else if (/personal/i.test(rawCategory)) category = 'Personal';
    else if (/med/i.test(rawCategory) || /health/i.test(rawCategory)) category = 'Medical';
    else if (/work/i.test(rawCategory) || /job/i.test(rawCategory)) category = 'Work';

    // Normalize Status
    let status = 'To Do';
    if (/not.?start/i.test(rawStatus)) status = 'To Do';
    else if (/done/i.test(rawStatus) || /comp/i.test(rawStatus) || /finish/i.test(rawStatus)) status = 'Completed';
    else if (/progress/i.test(rawStatus) || /doing/i.test(rawStatus) || /active/i.test(rawStatus)) status = 'In Progress';
    if (rawDateComp) status = 'Completed';

    // Parse Date Set
    let parsedDateSet = rawDateSet;
    if (rawDateSet) {
      const d = new Date(rawDateSet);
      if (!isNaN(d.getTime())) {
        parsedDateSet = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
    }

    tasks.push({
      id: `task-${i}-${Date.now()}`,
      rawId: get(row, columnMapping.id),  // original sheet ID for write-back
      sheetRow: i + 1,                    // 1-based row in sheet (header = row 1, first data row = 2; i starts at 1 here)
      title: rawTitle,
      category,
      subCategory: rawSubCategory,
      owner: rawOwner,
      dateSet: parsedDateSet,
      status,
      priority: rawPriority,
      milestone: rawMilestone,
      dateCompleted: rawDateComp,
      notes: rawNotes
    });
  }

  return tasks;
}

// --- Sheet Write Helpers ---
function taskToValues(task) {
  // Column order must match the sheet: ID, Category, SubCategory, Task Description, Owner, Date Set, Status, Priority, Milestone, Date Completed, Comments
  // The sheet uses "Not Started" where the dashboard displays "To Do" — map back on write.
  const sheetStatus = task.status === 'To Do' ? 'Not Started' : task.status;
  return [
    task.rawId, task.category, task.subCategory, task.title,
    task.owner, task.dateSet, sheetStatus, task.priority,
    task.milestone, task.dateCompleted, task.notes
  ];
}

async function sheetWrite(action, rowIndex, values) {
  if (!GAS_URL) return; // no-op until GAS is deployed
  // GAS Web Apps redirect POST requests (302), which causes browsers to drop the
  // POST body before following the redirect. Sending data as GET query params
  // avoids this — params survive the redirect intact.
  const params = new URLSearchParams({
    action,
    row: rowIndex !== null && rowIndex !== undefined ? String(rowIndex) : '',
    values: JSON.stringify(values)
  });
  await fetch(`${GAS_URL}?${params}`, { mode: 'no-cors' });
}

function populateFormMilestoneSelect(selectedValue) {
  const sel = document.getElementById('modal-form-milestone');
  sel.innerHTML = '<option value="">None</option>';
  Object.entries(appState.milestones).forEach(([name, date]) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = date ? `${name} (${date})` : name;
    sel.appendChild(opt);
  });
  sel.value = selectedValue || '';
}

// --- Filtering ---
function filterAndRender() {
  const { search, category, subCategory, owner, priority, milestone, status } = appState.activeFilters;

  const hasActiveFilters = search.trim() !== ''
    || category !== 'all' || subCategory !== 'all' || owner !== 'all'
    || priority !== 'all' || milestone !== 'all' || status !== 'all';

  document.getElementById('clear-filters-btn').style.display = hasActiveFilters ? 'inline-flex' : 'none';

  appState.filteredTasks = appState.tasks.filter(task => {
    if (search.trim() !== '') {
      const q = search.toLowerCase();
      const fields = [task.title, task.subCategory, task.owner, task.milestone, task.notes, task.category, task.status];
      if (!fields.some(f => f && f.toLowerCase().includes(q))) return false;
    }
    if (category !== 'all' && task.category !== category) return false;
    if (subCategory !== 'all' && task.subCategory !== subCategory) return false;
    if (owner !== 'all' && task.owner !== owner) return false;
    if (priority !== 'all' && task.priority !== priority) return false;
    if (milestone !== 'all' && task.milestone !== milestone) return false;
    if (status !== 'all' && task.status !== status) return false;
    return true;
  });

  renderAnalytics();
  renderTasks();
}

function clearFilters() {
  document.getElementById('search-input').value = '';
  document.getElementById('category-filter').value = 'all';
  document.getElementById('subcategory-filter').value = 'all';
  document.getElementById('owner-filter').value = 'all';
  document.getElementById('priority-filter').value = 'all';
  document.getElementById('milestone-filter').value = 'all';
  document.getElementById('status-filter').value = 'all';

  appState.activeFilters = {
    search: '', category: 'all', subCategory: 'all', owner: 'all',
    priority: 'all', milestone: 'all', status: 'all'
  };

  filterAndRender();
}

// --- Analytics ---
function renderAnalytics() {
  const total = appState.tasks.length;
  if (total === 0) {
    ['stat-total', 'stat-todo', 'stat-progress', 'stat-done'].forEach(id => {
      document.getElementById(id).innerText = '0';
    });
    ['stat-todo-pct', 'stat-progress-pct', 'stat-done-pct'].forEach(id => {
      document.getElementById(id).innerText = '0%';
    });
    return;
  }

  const todoCount = appState.tasks.filter(t => t.status === 'To Do').length;
  const progressCount = appState.tasks.filter(t => t.status === 'In Progress').length;
  const doneCount = appState.tasks.filter(t => t.status === 'Completed').length;

  document.getElementById('stat-total').innerText = total;
  document.getElementById('stat-todo').innerText = todoCount;
  document.getElementById('stat-progress').innerText = progressCount;
  document.getElementById('stat-done').innerText = doneCount;

  document.getElementById('stat-todo-pct').innerText = `${Math.round((todoCount / total) * 100)}%`;
  document.getElementById('stat-progress-pct').innerText = `${Math.round((progressCount / total) * 100)}%`;
  document.getElementById('stat-done-pct').innerText = `${Math.round((doneCount / total) * 100)}%`;
}

// --- Rendering ---
function renderTasks() {
  const gridContainer = document.getElementById('tasks-grid-container');
  const emptyState = document.getElementById('empty-state-panel');
  emptyState.style.display = 'none';

  if (appState.filteredTasks.length === 0) {
    gridContainer.innerHTML = '';
    emptyState.style.display = 'flex';
    document.getElementById('empty-state-icon').textContent = '📋';
    document.getElementById('empty-state-title').textContent = 'No tasks found';
    document.getElementById('empty-state-text').textContent = 'Try adjusting your filters.';
    ['count-todo', 'count-progress', 'count-done-column'].forEach(id => {
      document.getElementById(id).innerText = '0';
    });
    ['kanban-wrapper-todo', 'kanban-wrapper-progress', 'kanban-wrapper-done'].forEach(id => {
      document.getElementById(id).innerHTML = '';
    });
    return;
  }

  if (appState.currentView === 'grid') {
    renderGridView();
  } else {
    renderKanbanView();
  }
}

function renderGridView() {
  const container = document.getElementById('tasks-grid-container');
  container.innerHTML = '';
  appState.filteredTasks.forEach(task => container.appendChild(createTaskCard(task)));
}

function renderKanbanView() {
  const todoWrapper = document.getElementById('kanban-wrapper-todo');
  const progressWrapper = document.getElementById('kanban-wrapper-progress');
  const doneWrapper = document.getElementById('kanban-wrapper-done');

  todoWrapper.innerHTML = '';
  progressWrapper.innerHTML = '';
  doneWrapper.innerHTML = '';

  const todoTasks = appState.filteredTasks.filter(t => t.status === 'To Do');
  const progressTasks = appState.filteredTasks.filter(t => t.status === 'In Progress');
  const doneTasks = appState.filteredTasks.filter(t => t.status === 'Completed');

  document.getElementById('count-todo').innerText = todoTasks.length;
  document.getElementById('count-progress').innerText = progressTasks.length;
  document.getElementById('count-done-column').innerText = doneTasks.length;

  todoTasks.forEach(task => todoWrapper.appendChild(createTaskCard(task, true)));
  progressTasks.forEach(task => progressWrapper.appendChild(createTaskCard(task, true)));
  doneTasks.forEach(task => doneWrapper.appendChild(createTaskCard(task, true)));
}

function createTaskCard(task, isKanban = false) {
  const card = document.createElement('div');
  card.className = `task-card glass-panel ${isKanban ? 'kanban-card' : ''}`;
  card.setAttribute('data-id', task.id);
  if (isKanban) card.setAttribute('draggable', 'true');

  let catClass = 'tag-other';
  if (task.category === 'House') catClass = 'tag-house';
  else if (task.category === 'Personal') catClass = 'tag-personal';
  else if (task.category === 'Medical') catClass = 'tag-medical';
  else if (task.category === 'Work') catClass = 'tag-work';

  let statusClass = 'status-todo';
  if (task.status === 'In Progress') statusClass = 'status-progress';
  else if (task.status === 'Completed') statusClass = 'status-done';

  let priorityClass = 'priority-medium';
  if (task.priority === 'P0') priorityClass = 'priority-high';

  // Milestone label: name + date from appState.milestones if available
  const milestoneDate = task.milestone ? (appState.milestones[task.milestone] || '') : '';
  const milestoneLabel = task.milestone
    ? (milestoneDate ? `${task.milestone} · ${milestoneDate}` : task.milestone)
    : null;

  const milestoneHtml = milestoneLabel
    ? `<div class="task-milestone">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
        <span>${escapeHTML(milestoneLabel)}</span>
      </div>`
    : `<div></div>`;

  card.innerHTML = `
    <div class="task-card-header">
      <span class="task-category-tag ${catClass}">${escapeHTML(task.category)}</span>
      <span class="task-subcategory-tag">${escapeHTML(task.subCategory || '')}</span>
    </div>
    <h3 class="task-title">${escapeHTML(task.title)}</h3>
    <div class="task-owner">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      <span>${escapeHTML(task.owner || 'Unassigned')}</span>
    </div>
    <div class="task-card-footer">
      ${milestoneHtml}
      <div class="task-footer-right">
        <span class="task-priority-badge ${priorityClass}">${escapeHTML(task.priority || '')}</span>
        <span class="task-status-pill ${statusClass}">${task.status}</span>
      </div>
    </div>
  `;

  card.addEventListener('click', (e) => {
    if (e.target.closest('.task-card').classList.contains('dragging')) return;
    openModal(task.id);
  });

  return card;
}

// --- View Switching ---
function switchView(viewName) {
  appState.currentView = viewName;
  const gridBtn = document.getElementById('view-grid-btn');
  const kanbanBtn = document.getElementById('view-kanban-btn');
  const gridPanel = document.getElementById('grid-view-panel');
  const kanbanPanel = document.getElementById('kanban-view-panel');

  if (viewName === 'grid') {
    gridBtn.classList.add('active'); kanbanBtn.classList.remove('active');
    gridPanel.classList.add('active'); kanbanPanel.classList.remove('active');
  } else {
    gridBtn.classList.remove('active'); kanbanBtn.classList.add('active');
    gridPanel.classList.remove('active'); kanbanPanel.classList.add('active');
  }
  renderTasks();
}

// --- Modal ---
function openModal(taskId) {
  const task = appState.tasks.find(t => t.id === taskId);
  if (!task) return;

  const modal = document.getElementById('task-modal');
  const win = modal.querySelector('.modal-window');

  // Reset to view mode
  win.classList.remove('modal-editing', 'modal-adding');
  document.getElementById('modal-delete-confirm').style.display = 'none';
  modal.dataset.taskId = task.id;

  // --- Populate read-only view ---
  document.getElementById('modal-title').innerText = task.title;
  document.getElementById('modal-status').innerText = task.status;
  document.getElementById('modal-priority').innerText = task.priority || '—';
  document.getElementById('modal-date-set').innerText = task.dateSet || 'Not set';
  document.getElementById('modal-category').innerText = task.category;
  document.getElementById('modal-subcategory').innerText = task.subCategory || '—';
  document.getElementById('modal-owner').innerText = task.owner || '—';

  const milestoneDate = task.milestone ? (appState.milestones[task.milestone] || '') : '';
  document.getElementById('modal-milestone').innerText = task.milestone
    ? (milestoneDate ? `${task.milestone} (${milestoneDate})` : task.milestone)
    : '—';

  const dateCompSection = document.getElementById('modal-date-completed-section');
  if (task.dateCompleted) {
    document.getElementById('modal-date-completed').innerText = task.dateCompleted;
    dateCompSection.style.display = 'block';
  } else {
    dateCompSection.style.display = 'none';
  }

  const notesPanel = document.getElementById('modal-notes');
  const notesSection = document.getElementById('modal-notes-section');
  if (task.notes && task.notes.trim()) {
    notesPanel.innerText = task.notes;
    notesSection.style.display = 'block';
  } else {
    notesPanel.innerText = '';
    notesSection.style.display = 'none';
  }

  const tagsContainer = document.getElementById('modal-tags-container');
  tagsContainer.innerHTML = '';
  let catClass = 'tag-other';
  if (task.category === 'House') catClass = 'tag-house';
  else if (task.category === 'Personal') catClass = 'tag-personal';
  else if (task.category === 'Medical') catClass = 'tag-medical';
  else if (task.category === 'Work') catClass = 'tag-work';
  const catTag = document.createElement('span');
  catTag.className = `task-category-tag ${catClass}`;
  catTag.innerText = task.category;
  tagsContainer.appendChild(catTag);

  // --- Populate edit form ---
  document.getElementById('modal-form-title').value = task.title;
  document.getElementById('modal-form-category').value = task.category;
  document.getElementById('modal-form-subcategory').value = task.subCategory || '';
  document.getElementById('modal-form-owner').value = task.owner || '';
  document.getElementById('modal-form-priority').value = task.priority || 'P1';
  document.getElementById('modal-form-status').value = task.status;
  document.getElementById('modal-form-date-completed').value = task.dateCompleted || '';
  document.getElementById('modal-form-notes').value = task.notes || '';
  populateFormMilestoneSelect(task.milestone);

  modal.classList.add('open');
}

function closeModal() {
  const modal = document.getElementById('task-modal');
  modal.classList.remove('open');
  modal.dataset.taskId = '';
  const win = modal.querySelector('.modal-window');
  if (win) win.classList.remove('modal-editing', 'modal-adding');
  const confirm = document.getElementById('modal-delete-confirm');
  if (confirm) confirm.style.display = 'none';
}

function openAddTaskModal() {
  const modal = document.getElementById('task-modal');
  const win = modal.querySelector('.modal-window');

  modal.dataset.taskId = '';
  win.classList.add('modal-editing', 'modal-adding');
  document.getElementById('modal-delete-confirm').style.display = 'none';

  // Clear all form inputs
  document.getElementById('modal-form-title').value = '';
  document.getElementById('modal-form-category').value = 'House';
  document.getElementById('modal-form-subcategory').value = '';
  document.getElementById('modal-form-owner').value = '';
  document.getElementById('modal-form-priority').value = 'P1';
  document.getElementById('modal-form-status').value = 'To Do';
  document.getElementById('modal-form-date-completed').value = '';
  document.getElementById('modal-form-notes').value = '';
  populateFormMilestoneSelect('');

  modal.classList.add('open');
}

async function saveTask() {
  const modal = document.getElementById('task-modal');
  const taskId = modal.dataset.taskId;

  const title = document.getElementById('modal-form-title').value.trim();
  const category = document.getElementById('modal-form-category').value;
  const subCategory = document.getElementById('modal-form-subcategory').value.trim();
  const owner = document.getElementById('modal-form-owner').value;
  const priority = document.getElementById('modal-form-priority').value;
  const milestone = document.getElementById('modal-form-milestone').value;
  const status = document.getElementById('modal-form-status').value;
  const dateCompleted = document.getElementById('modal-form-date-completed').value.trim();
  const notes = document.getElementById('modal-form-notes').value.trim();

  if (!title) {
    document.getElementById('modal-form-title').focus();
    return;
  }

  if (!taskId) {
    // ADD path
    const maxId = Math.max(0, ...appState.tasks.map(t => parseInt(t.rawId) || 0));
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const newTask = {
      id: `task-new-${Date.now()}`,
      rawId: String(maxId + 1),
      sheetRow: null,
      title, category, subCategory, owner,
      dateSet: today,
      status, priority, milestone, dateCompleted, notes
    };
    await sheetWrite('add', null, taskToValues(newTask));
    appState.tasks.push(newTask);
  } else {
    // UPDATE path
    const idx = appState.tasks.findIndex(t => t.id === taskId);
    if (idx === -1) return;
    const task = appState.tasks[idx];
    task.title = title; task.category = category; task.subCategory = subCategory;
    task.owner = owner; task.priority = priority; task.milestone = milestone;
    task.status = status; task.dateCompleted = dateCompleted; task.notes = notes;
    await sheetWrite('update', task.sheetRow, taskToValues(task));
  }

  closeModal();
  filterAndRender();
}

async function deleteTask(taskId) {
  const task = appState.tasks.find(t => t.id === taskId);
  if (!task) return;
  await sheetWrite('delete', task.sheetRow, []);
  appState.tasks = appState.tasks.filter(t => t.id !== taskId);
  closeModal();
  filterAndRender();
}

// --- Kanban Drag and Drop ---
function setupKanbanDragAndDrop() {
  document.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.kanban-card');
    if (card) {
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', card.getAttribute('data-id'));
      e.dataTransfer.effectAllowed = 'move';
    }
  });

  document.addEventListener('dragend', (e) => {
    const card = e.target.closest('.kanban-card');
    if (card) card.classList.remove('dragging');
  });

  document.querySelectorAll('.kanban-cards-wrapper').forEach(wrapper => {
    wrapper.addEventListener('dragover', (e) => {
      e.preventDefault();
      wrapper.classList.add('drag-over');
    });
    wrapper.addEventListener('dragleave', () => wrapper.classList.remove('drag-over'));
    wrapper.addEventListener('drop', (e) => {
      e.preventDefault();
      wrapper.classList.remove('drag-over');
      const taskId = e.dataTransfer.getData('text/plain');
      const targetStatus = wrapper.getAttribute('data-status');
      if (taskId && targetStatus) updateTaskStatus(taskId, targetStatus);
    });
  });
}

function updateTaskStatus(taskId, newStatus) {
  const idx = appState.tasks.findIndex(t => t.id === taskId);
  if (idx !== -1) {
    appState.tasks[idx].status = newStatus;
    sheetWrite('update', appState.tasks[idx].sheetRow, taskToValues(appState.tasks[idx]));
    filterAndRender();
  }
}

// --- Utility ---
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
