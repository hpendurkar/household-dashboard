/**
 * Household Tasks Dashboard - Core Application Logic
 */

// Application State
let appState = {
  tasks: [],
  filteredTasks: [],
  currentView: 'grid', // 'grid' or 'kanban'
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

// Default Column Indices (in case CSV headers can't be mapped)
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

// Initialize Application on Page Load
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initEventListeners();
  loadInitialData();
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
  document.getElementById('csv-file-input').addEventListener('change', handleFileUpload);
  document.getElementById('load-sample-btn').addEventListener('click', loadDemoData);

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

  setupKanbanDragAndDrop();
}

// --- CSV Parsing Engine ---
// Robust CSV Parser that handles commas inside quotes and newline characters correctly.
function parseCSV(text) {
  const lines = [];
  let row = [""];
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
      row.push("");
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      lines.push(row);
      row = [""];
    } else {
      row[row.length - 1] += char;
    }
  }

  if (row.length > 1 || row[0] !== "") {
    lines.push(row);
  }

  return lines;
}

// Map CSV columns using header heuristics
function mapHeaders(headers) {
  const findColumn = (regexList) => {
    for (const regex of regexList) {
      const idx = headers.findIndex(h => regex.test(h.trim()));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  columnMapping.id         = findColumn([/^id$/i]);
  columnMapping.title      = findColumn([/task.*desc/i, /description/i, /task/i, /title/i, /name/i, /summary/i, /subject/i, /activity/i]);
  columnMapping.category   = findColumn([/^cat/i, /^type/i, /^group/i, /^area/i, /^label/i]);
  columnMapping.subCategory = findColumn([/sub.?cat/i, /sub.?type/i]);
  columnMapping.owner      = findColumn([/owner/i, /bearer/i, /assigned/i, /person/i]);
  columnMapping.dateSet    = findColumn([/date.?set/i, /set.?date/i, /date.?start/i, /created/i]);
  columnMapping.status     = findColumn([/^status$/i, /^state$/i, /^stage$/i]);
  columnMapping.priority   = findColumn([/prior/i, /import/i, /urg/i, /^level/i]);
  columnMapping.milestone  = findColumn([/milestone/i, /goal/i, /sprint/i, /phase/i]);
  columnMapping.dateCompleted = findColumn([/date.?comp/i, /comp.*date/i, /finish/i, /end.?date/i]);
  columnMapping.notes      = findColumn([/note/i, /comment/i, /remark/i, /extra/i]);

  // Fallback defaults if not found
  if (columnMapping.title === -1)     columnMapping.title = 0;
  if (columnMapping.category === -1)  columnMapping.category = 1 < headers.length ? 1 : 0;
  if (columnMapping.status === -1)    columnMapping.status = 2 < headers.length ? 2 : 0;
}

// Convert parsed CSV lines to normalized task objects
function processTasksFromCSV(lines) {
  if (lines.length < 2) return [];

  const headers = lines[0];
  mapHeaders(headers);

  const tasks = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (row.length === 0 || (row.length === 1 && row[0].trim() === '')) continue;

    const rawTitle = (columnMapping.title !== -1 && row[columnMapping.title]) ? row[columnMapping.title] : '';
    if (!rawTitle.trim()) continue;

    const get = (col) => (col !== -1 && row[col]) ? row[col].trim() : '';

    const rawCategory    = get(columnMapping.category);
    const rawSubCategory = get(columnMapping.subCategory);
    const rawOwner       = get(columnMapping.owner);
    const rawDateSet     = get(columnMapping.dateSet);
    const rawStatus      = get(columnMapping.status);
    const rawPriority    = get(columnMapping.priority);
    const rawMilestone   = get(columnMapping.milestone);
    const rawDateComp    = get(columnMapping.dateCompleted);
    const rawNotes       = get(columnMapping.notes);

    // Normalize Category
    let category = 'Other';
    if (/house/i.test(rawCategory))                                          category = 'House';
    else if (/personal/i.test(rawCategory))                                  category = 'Personal';
    else if (/med/i.test(rawCategory) || /health/i.test(rawCategory))        category = 'Medical';
    else if (/work/i.test(rawCategory) || /job/i.test(rawCategory))          category = 'Work';

    // Normalize Status
    let status = 'To Do';
    if (/not.?start/i.test(rawStatus))                                              status = 'To Do';
    else if (/done/i.test(rawStatus) || /comp/i.test(rawStatus) || /finish/i.test(rawStatus)) status = 'Completed';
    else if (/progress/i.test(rawStatus) || /doing/i.test(rawStatus) || /active/i.test(rawStatus)) status = 'In Progress';

    // If Date Completed is filled, treat as Completed regardless of Status column
    if (rawDateComp) status = 'Completed';

    // Parse Date Set
    let parsedDateSet = null;
    if (rawDateSet) {
      const dateObj = new Date(rawDateSet);
      parsedDateSet = !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : rawDateSet;
    }

    const taskId = `task-${i}-${Date.now()}`;

    tasks.push({
      id: taskId,
      title: rawTitle.trim(),
      category,
      subCategory: rawSubCategory,
      owner: rawOwner,
      dateSet: parsedDateSet || rawDateSet,
      status,
      priority: rawPriority,
      milestone: rawMilestone,
      dateCompleted: rawDateComp,
      description: '',
      notes: rawNotes
    });
  }

  return tasks;
}

// --- Data Loading ---
function loadInitialData() {
  const storedTasks = localStorage.getItem('household_tasks');
  if (storedTasks) {
    try {
      const tasks = JSON.parse(storedTasks);
      // If tasks are in the old format (no 'owner' field), discard and reload fresh demo data
      if (tasks.length > 0 && tasks[0].owner === undefined) {
        loadDemoData();
        return;
      }
      appState.tasks = tasks;
      filterAndRender();
      return;
    } catch (e) {
      console.error("Error parsing stored tasks, falling back.", e);
    }
  }
  loadDemoData();
}

function loadDemoData() {
  const demoCSV = `ID,Category,SubCategory,Task Description,Owner,Date Set,Status,Priority,Milestone,Date Completed,Comments
1,House,Plumbing,Contact plumber,Minu,"June 10, 2026",Not Started,P0,Seattle Trip,,
2,House,Plumbing,Replace angle stops under kitchen and guest bathroom 1,Minu,"June 10, 2026",Not Started,P1,Seattle Trip,,
3,House,Plumbing,Reseat master bathroom toilet,Minu,"June 10, 2026",Not Started,P1,Seattle Trip,,
4,House,Plumbing,Replace exterior hose bib,Minu,"June 10, 2026",Not Started,P1,Seattle Trip,,
5,House,Plumbing,Fix irrigation valve,Minu,"June 10, 2026",Not Started,P1,Seattle Trip,,
6,House,Plumbing,Seal air gap under kitchen sink,Minu,"June 10, 2026",Not Started,P1,Seattle Trip,,
7,Personal,Electronics,Buy windows laptop,Minu,"June 1, 2026",In Progress,P1,Seattle Trip,,
8,House,Electrical,Contact electrician on Thumbtack,Hrishi,"May 1, 2026",Not Started,P0,Seattle Trip,,
9,House,Electrical,Replace manual light switches with Wi-Fi controlled automated switches,Hrishi,"May 1, 2026",Not Started,P1,Sedona Trip,,
10,House,Handywork,Contact Tilek,Hrishi,"April 1, 2026",Not Started,P0,Seattle Trip,,
11,House,Handywork,Replace curtain rods in living room,Hrishi,"April 1, 2026",Not Started,P1,Sedona Trip,,
12,House,Handywork,Restain main door,Hrishi,"April 1, 2026",Not Started,P1,Sedona Trip,,
13,House,Handywork,Replace mailbox,Hrishi,"April 1, 2026",Not Started,P1,Sedona Trip,,
14,Personal,Electronics,Buy macbook,Hrishi,"June 1, 2026",In Progress,P1,Sedona Trip,,
15,Personal,Dental,Schedule sinus graft and request sedation,Hrishi,"June 24, 2026",In Progress,P0,Seattle Trip,,`;

  const parsedLines = parseCSV(demoCSV);
  appState.tasks = processTasksFromCSV(parsedLines);
  saveToLocalStorage();
  filterAndRender();
}

function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const csvContent = event.target.result;
    const parsedLines = parseCSV(csvContent);
    const newTasks = processTasksFromCSV(parsedLines);

    if (newTasks.length > 0) {
      appState.tasks = newTasks;
      saveToLocalStorage();
      filterAndRender();
      e.target.value = '';
    } else {
      alert("No valid tasks found in the uploaded CSV. Please check the columns and contents.");
    }
  };
  reader.readAsText(file);
}

function saveToLocalStorage() {
  localStorage.setItem('household_tasks', JSON.stringify(appState.tasks));
}

// --- Filtering and Query Logic ---
function filterAndRender() {
  const { search, category, subCategory, owner, priority, milestone, status } = appState.activeFilters;

  const hasActiveFilters = search.trim() !== ''
    || category !== 'all'
    || subCategory !== 'all'
    || owner !== 'all'
    || priority !== 'all'
    || milestone !== 'all'
    || status !== 'all';

  document.getElementById('clear-filters-btn').style.display = hasActiveFilters ? 'inline-flex' : 'none';

  appState.filteredTasks = appState.tasks.filter(task => {
    if (search.trim() !== '') {
      const q = search.toLowerCase();
      const fields = [task.title, task.subCategory, task.owner, task.milestone, task.notes, task.category, task.status];
      if (!fields.some(f => f && f.toLowerCase().includes(q))) return false;
    }

    if (category !== 'all' && task.category !== category)         return false;
    if (subCategory !== 'all' && task.subCategory !== subCategory) return false;
    if (owner !== 'all' && task.owner !== owner)                  return false;
    if (priority !== 'all' && task.priority !== priority)         return false;
    if (milestone !== 'all' && task.milestone !== milestone)      return false;
    if (status !== 'all' && task.status !== status)               return false;

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
    search: '',
    category: 'all',
    subCategory: 'all',
    owner: 'all',
    priority: 'all',
    milestone: 'all',
    status: 'all'
  };

  filterAndRender();
}

// --- Analytics Render ---
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

  const todoCount     = appState.tasks.filter(t => t.status === 'To Do').length;
  const progressCount = appState.tasks.filter(t => t.status === 'In Progress').length;
  const doneCount     = appState.tasks.filter(t => t.status === 'Completed').length;

  document.getElementById('stat-total').innerText    = total;
  document.getElementById('stat-todo').innerText     = todoCount;
  document.getElementById('stat-progress').innerText = progressCount;
  document.getElementById('stat-done').innerText     = doneCount;

  document.getElementById('stat-todo-pct').innerText     = `${Math.round((todoCount / total) * 100)}%`;
  document.getElementById('stat-progress-pct').innerText = `${Math.round((progressCount / total) * 100)}%`;
  document.getElementById('stat-done-pct').innerText     = `${Math.round((doneCount / total) * 100)}%`;
}

// --- Tasks Rendering ---
function renderTasks() {
  const gridContainer = document.getElementById('tasks-grid-container');
  const emptyState    = document.getElementById('empty-state-panel');

  emptyState.style.display = 'none';

  if (appState.filteredTasks.length === 0) {
    gridContainer.innerHTML = '';
    emptyState.style.display = 'flex';

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
  const gridContainer = document.getElementById('tasks-grid-container');
  gridContainer.innerHTML = '';
  appState.filteredTasks.forEach(task => gridContainer.appendChild(createTaskCard(task)));
}

function renderKanbanView() {
  const todoWrapper     = document.getElementById('kanban-wrapper-todo');
  const progressWrapper = document.getElementById('kanban-wrapper-progress');
  const doneWrapper     = document.getElementById('kanban-wrapper-done');

  todoWrapper.innerHTML = '';
  progressWrapper.innerHTML = '';
  doneWrapper.innerHTML = '';

  const todoTasks     = appState.filteredTasks.filter(t => t.status === 'To Do');
  const progressTasks = appState.filteredTasks.filter(t => t.status === 'In Progress');
  const doneTasks     = appState.filteredTasks.filter(t => t.status === 'Completed');

  document.getElementById('count-todo').innerText        = todoTasks.length;
  document.getElementById('count-progress').innerText    = progressTasks.length;
  document.getElementById('count-done-column').innerText = doneTasks.length;

  todoTasks.forEach(task     => todoWrapper.appendChild(createTaskCard(task, true)));
  progressTasks.forEach(task => progressWrapper.appendChild(createTaskCard(task, true)));
  doneTasks.forEach(task     => doneWrapper.appendChild(createTaskCard(task, true)));
}

// Create a DOM Element for a Task Card
function createTaskCard(task, isKanban = false) {
  const card = document.createElement('div');
  card.className = `task-card glass-panel ${isKanban ? 'kanban-card' : ''}`;
  card.setAttribute('data-id', task.id);
  if (isKanban) card.setAttribute('draggable', 'true');

  // Category CSS class
  let catClass = 'tag-other';
  if (task.category === 'House')     catClass = 'tag-house';
  else if (task.category === 'Personal') catClass = 'tag-personal';
  else if (task.category === 'Medical')  catClass = 'tag-medical';
  else if (task.category === 'Work')     catClass = 'tag-work';

  // Status CSS class
  let statusClass = 'status-todo';
  if (task.status === 'In Progress') statusClass = 'status-progress';
  else if (task.status === 'Completed') statusClass = 'status-done';

  // Priority CSS class (P0 = high urgency, P1 = medium)
  let priorityClass = 'priority-medium';
  if (task.priority === 'P0') priorityClass = 'priority-high';

  // Milestone footer element
  const milestoneHtml = task.milestone
    ? `<div class="task-milestone">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
        <span>${escapeHTML(task.milestone)}</span>
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

  const gridBtn    = document.getElementById('view-grid-btn');
  const kanbanBtn  = document.getElementById('view-kanban-btn');
  const gridPanel  = document.getElementById('grid-view-panel');
  const kanbanPanel = document.getElementById('kanban-view-panel');

  if (viewName === 'grid') {
    gridBtn.classList.add('active');
    kanbanBtn.classList.remove('active');
    gridPanel.classList.add('active');
    kanbanPanel.classList.remove('active');
  } else {
    gridBtn.classList.remove('active');
    kanbanBtn.classList.add('active');
    gridPanel.classList.remove('active');
    kanbanPanel.classList.add('active');
  }

  renderTasks();
}

// --- Modal Details ---
function openModal(taskId) {
  const task = appState.tasks.find(t => t.id === taskId);
  if (!task) return;

  const modal = document.getElementById('task-modal');

  document.getElementById('modal-title').innerText       = task.title;
  document.getElementById('modal-status').innerText      = task.status;
  document.getElementById('modal-priority').innerText    = task.priority || '—';
  document.getElementById('modal-date-set').innerText    = task.dateSet || 'Not set';
  document.getElementById('modal-category').innerText    = task.category;
  document.getElementById('modal-subcategory').innerText = task.subCategory || '—';
  document.getElementById('modal-owner').innerText       = task.owner || '—';
  document.getElementById('modal-milestone').innerText   = task.milestone || '—';

  // Date Completed — only show section if filled
  const dateCompSection = document.getElementById('modal-date-completed-section');
  if (task.dateCompleted) {
    document.getElementById('modal-date-completed').innerText = task.dateCompleted;
    dateCompSection.style.display = 'block';
  } else {
    dateCompSection.style.display = 'none';
  }

  // Notes section
  const notesPanel   = document.getElementById('modal-notes');
  const notesSection = document.getElementById('modal-notes-section');
  if (task.notes && task.notes.trim() !== '') {
    notesPanel.innerText = task.notes;
    notesSection.style.display = 'block';
  } else {
    notesPanel.innerText = '';
    notesSection.style.display = 'none';
  }

  // Header category tag
  const tagsContainer = document.getElementById('modal-tags-container');
  tagsContainer.innerHTML = '';
  let catClass = 'tag-other';
  if (task.category === 'House')     catClass = 'tag-house';
  else if (task.category === 'Personal') catClass = 'tag-personal';
  else if (task.category === 'Medical')  catClass = 'tag-medical';
  else if (task.category === 'Work')     catClass = 'tag-work';
  const catTag = document.createElement('span');
  catTag.className = `task-category-tag ${catClass}`;
  catTag.innerText = task.category;
  tagsContainer.appendChild(catTag);

  modal.classList.add('open');
}

function closeModal() {
  document.getElementById('task-modal').classList.remove('open');
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
      const taskId      = e.dataTransfer.getData('text/plain');
      const targetStatus = wrapper.getAttribute('data-status');
      if (taskId && targetStatus) updateTaskStatus(taskId, targetStatus);
    });
  });
}

function updateTaskStatus(taskId, newStatus) {
  const taskIndex = appState.tasks.findIndex(t => t.id === taskId);
  if (taskIndex !== -1) {
    appState.tasks[taskIndex].status = newStatus;
    saveToLocalStorage();
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
