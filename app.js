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
    priority: 'all',
    status: 'all'
  },
  theme: 'light'
};

// Default Column Indices (in case CSV headers can't be mapped)
let columnMapping = {
  id: -1,
  title: 0,
  category: 1,
  status: 2,
  priority: 3,
  dueDate: 4,
  description: 5,
  notes: 6
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
  // Theme Toggle Button
  document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);

  // File Upload
  document.getElementById('csv-file-input').addEventListener('change', handleFileUpload);

  // Load Demo Data Button
  document.getElementById('load-sample-btn').addEventListener('click', loadDemoData);

  // Search Input
  document.getElementById('search-input').addEventListener('input', (e) => {
    appState.activeFilters.search = e.target.value;
    filterAndRender();
  });

  // Filters
  document.getElementById('category-filter').addEventListener('change', (e) => {
    appState.activeFilters.category = e.target.value;
    filterAndRender();
  });

  document.getElementById('priority-filter').addEventListener('change', (e) => {
    appState.activeFilters.priority = e.target.value;
    filterAndRender();
  });

  document.getElementById('status-filter').addEventListener('change', (e) => {
    appState.activeFilters.status = e.target.value;
    filterAndRender();
  });

  // Clear Filters
  document.getElementById('clear-filters-btn').addEventListener('click', clearFilters);

  // View Toggles
  document.getElementById('view-grid-btn').addEventListener('click', () => switchView('grid'));
  document.getElementById('view-kanban-btn').addEventListener('click', () => switchView('kanban'));

  // Close Modal
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('task-modal').addEventListener('click', (e) => {
    if (e.target.id === 'task-modal') closeModal();
  });

  // ESC key for closing modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Setup Kanban Drag & Drop
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
        // Escaped double quote
        row[row.length - 1] += '"';
        i++;
      } else {
        // Toggle quotes state
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      // End of field, start new field
      row.push("");
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      // End of row
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n
      }
      lines.push(row);
      row = [""];
    } else {
      // Regular character
      row[row.length - 1] += char;
    }
  }
  
  // Push the final row if it has content or isn't empty
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

  columnMapping.title = findColumn([/task/i, /title/i, /name/i, /summary/i, /subject/i, /activity/i]);
  columnMapping.category = findColumn([/cat/i, /type/i, /group/i, /area/i, /label/i]);
  columnMapping.status = findColumn([/status/i, /state/i, /stage/i, /progress/i]);
  columnMapping.priority = findColumn([/prior/i, /import/i, /urg/i, /level/i]);
  columnMapping.dueDate = findColumn([/due/i, /date/i, /deadline/i, /by/i, /schedule/i]);
  columnMapping.description = findColumn([/desc/i, /detail/i, /about/i, /body/i]);
  columnMapping.notes = findColumn([/note/i, /comment/i, /remark/i, /extra/i]);

  // Fallback defaults if not found
  if (columnMapping.title === -1) columnMapping.title = 0;
  if (columnMapping.category === -1) columnMapping.category = 1 < headers.length ? 1 : 0;
  if (columnMapping.status === -1) columnMapping.status = 2 < headers.length ? 2 : 0;
  if (columnMapping.priority === -1) columnMapping.priority = 3 < headers.length ? 3 : 0;
  if (columnMapping.dueDate === -1) columnMapping.dueDate = 4 < headers.length ? 4 : 0;
  if (columnMapping.description === -1) columnMapping.description = 5 < headers.length ? 5 : 0;
  if (columnMapping.notes === -1) columnMapping.notes = 6 < headers.length ? 6 : 0;
}

// Convert parsed CSV lines to normalized task objects
function processTasksFromCSV(lines) {
  if (lines.length < 2) return [];

  const headers = lines[0];
  mapHeaders(headers);

  const tasks = [];
  const startIdx = 1;

  for (let i = startIdx; i < lines.length; i++) {
    const row = lines[i];
    if (row.length === 0 || (row.length === 1 && row[0].trim() === '')) continue;

    // Extract raw fields using the column maps
    const rawTitle = row[columnMapping.title] || '';
    if (!rawTitle.trim()) continue; // skip task rows with no title

    const rawCategory = row[columnMapping.category] || '';
    const rawStatus = row[columnMapping.status] || '';
    const rawPriority = row[columnMapping.priority] || '';
    const rawDueDate = row[columnMapping.dueDate] || '';
    const rawDesc = row[columnMapping.description] || '';
    const rawNotes = row[columnMapping.notes] || '';

    // Standardize Category
    let category = 'Other';
    if (/personal/i.test(rawCategory)) category = 'Personal';
    else if (/med/i.test(rawCategory) || /health/i.test(rawCategory)) category = 'Medical';
    else if (/work/i.test(rawCategory) || /job/i.test(rawCategory) || /office/i.test(rawCategory)) category = 'Work';

    // Standardize Status
    let status = 'To Do';
    if (/done/i.test(rawStatus) || /comp/i.test(rawStatus) || /finish/i.test(rawStatus)) status = 'Completed';
    else if (/progress/i.test(rawStatus) || /doing/i.test(rawStatus) || /active/i.test(rawStatus)) status = 'In Progress';
    
    // Standardize Priority
    let priority = 'Medium';
    if (/high/i.test(rawPriority) || /urgent/i.test(rawPriority) || /p1/i.test(rawPriority)) priority = 'High';
    else if (/low/i.test(rawPriority) || /p3/i.test(rawPriority)) priority = 'Low';

    // Parse Due Date
    let parsedDate = null;
    if (rawDueDate.trim()) {
      const cleanDate = rawDueDate.trim();
      const dateObj = new Date(cleanDate);
      if (!isNaN(dateObj.getTime())) {
        parsedDate = dateObj.toISOString().split('T')[0];
      } else {
        parsedDate = cleanDate; // fallback to raw string if it can't parse
      }
    }

    // Unique ID
    const taskId = `task-${i}-${Date.now()}`;

    tasks.push({
      id: taskId,
      title: rawTitle.trim(),
      category,
      originalCategory: rawCategory.trim(),
      status,
      originalStatus: rawStatus.trim(),
      priority,
      originalPriority: rawPriority.trim(),
      dueDate: parsedDate,
      description: rawDesc.trim(),
      notes: rawNotes.trim()
    });
  }

  return tasks;
}

// --- Data Loading ---
function loadInitialData() {
  // Try loading from localStorage first
  const storedTasks = localStorage.getItem('household_tasks');
  if (storedTasks) {
    try {
      appState.tasks = JSON.parse(storedTasks);
      filterAndRender();
      return;
    } catch (e) {
      console.error("Error parsing stored tasks, falling back.", e);
    }
  }
  
  // If nothing stored, load default demo tasks
  loadDemoData();
}

function loadDemoData() {
  const demoCSV = `Task,Category,Status,Priority,Due Date,Description,Notes
"Schedule annual physical exam","Medical","In Progress","High","2026-07-10","Call Dr. Miller's office and book checkup.","Need to confirm if insurance details are up to date."
"Fix kitchen sink leak","Personal","To Do","High","2026-06-25","Under-sink pipe is dripping. Need plumber tape.","Check local hardware store."
"Weekly progress report","Work","Completed","Medium","2026-06-26","Summarize team deliverables and email to manager.","Sent on Friday morning."
"Refill prescriptions","Medical","To Do","High","2026-07-01","Pick up allergies medication at CVS pharmacy.","Rx number: 49202-A"
"Prepare Q3 project budget","Work","In Progress","High","2026-07-08","Review department spends and draft projections spreadsheet.","Need inputs from sales director by Tuesday."
"Wash the car","Personal","To Do","Low","2026-07-05","Interior vacuum and exterior wash.","Use the coupons from the mail."
"Organize medical bills","Medical","Completed","Medium","2026-06-20","File dental claims and hospital receipts.","All folders placed in file drawer 2."
"Clean the garage","Personal","In Progress","Low","2026-07-15","Sort tools and boxes; discard broken items.","Donate old bicycles to charity."
"Update work portfolio","Work","To Do","Medium","2026-07-20","Add latest mockups and design studies.","Export screenshots from Figma."`;

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
      
      // Reset file input
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
  const { search, category, priority, status } = appState.activeFilters;
  const todayStr = new Date().toISOString().split('T')[0];

  // Determine if filters are active to show/hide "Clear Filters" button
  const hasActiveFilters = search.trim() !== '' || category !== 'all' || priority !== 'all' || status !== 'all';
  document.getElementById('clear-filters-btn').style.display = hasActiveFilters ? 'inline-flex' : 'none';

  appState.filteredTasks = appState.tasks.filter(task => {
    // 1. Search Query
    if (search.trim() !== '') {
      const q = search.toLowerCase();
      const matchTitle = task.title.toLowerCase().includes(q);
      const matchDesc = task.description.toLowerCase().includes(q);
      const matchNotes = task.notes.toLowerCase().includes(q);
      const matchCat = task.category.toLowerCase().includes(q);
      const matchStatus = task.status.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchNotes && !matchCat && !matchStatus) {
        return false;
      }
    }

    // 2. Category Filter
    if (category !== 'all' && task.category !== category) {
      return false;
    }

    // 3. Priority Filter
    if (priority !== 'all' && task.priority !== priority) {
      return false;
    }

    // 4. Status Filter
    if (status !== 'all') {
      if (status === 'Overdue') {
        const isOverdue = task.status !== 'Completed' && task.dueDate && task.dueDate < todayStr;
        if (!isOverdue) return false;
      } else if (task.status !== status) {
        return false;
      }
    }

    return true;
  });

  renderAnalytics();
  renderTasks();
}

function clearFilters() {
  document.getElementById('search-input').value = '';
  document.getElementById('category-filter').value = 'all';
  document.getElementById('priority-filter').value = 'all';
  document.getElementById('status-filter').value = 'all';

  appState.activeFilters = {
    search: '',
    category: 'all',
    priority: 'all',
    status: 'all'
  };

  filterAndRender();
}

// --- Analytics Render ---
function renderAnalytics() {
  const total = appState.tasks.length;
  const todayStr = new Date().toISOString().split('T')[0];

  if (total === 0) {
    document.getElementById('stat-total').innerText = '0';
    document.getElementById('stat-todo').innerText = '0';
    document.getElementById('stat-progress').innerText = '0';
    document.getElementById('stat-done').innerText = '0';
    document.getElementById('stat-overdue').innerText = '0';
    
    document.getElementById('stat-todo-pct').innerText = '0%';
    document.getElementById('stat-progress-pct').innerText = '0%';
    document.getElementById('stat-done-pct').innerText = '0%';
    document.getElementById('stat-overdue-pct').innerText = '0%';
    return;
  }

  const todoCount = appState.tasks.filter(t => t.status === 'To Do').length;
  const progressCount = appState.tasks.filter(t => t.status === 'In Progress').length;
  const doneCount = appState.tasks.filter(t => t.status === 'Completed').length;
  
  const overdueCount = appState.tasks.filter(t => 
    t.status !== 'Completed' && t.dueDate && t.dueDate < todayStr
  ).length;

  // Update counts
  document.getElementById('stat-total').innerText = total;
  document.getElementById('stat-todo').innerText = todoCount;
  document.getElementById('stat-progress').innerText = progressCount;
  document.getElementById('stat-done').innerText = doneCount;
  document.getElementById('stat-overdue').innerText = overdueCount;

  // Update percentages
  document.getElementById('stat-todo-pct').innerText = `${Math.round((todoCount / total) * 100)}%`;
  document.getElementById('stat-progress-pct').innerText = `${Math.round((progressCount / total) * 100)}%`;
  document.getElementById('stat-done-pct').innerText = `${Math.round((doneCount / total) * 100)}%`;
  document.getElementById('stat-overdue-pct').innerText = `${Math.round((overdueCount / total) * 100)}%`;
}

// --- Tasks Rendering ---
function renderTasks() {
  const gridContainer = document.getElementById('tasks-grid-container');
  const emptyState = document.getElementById('empty-state-panel');

  // Hide empty state initially
  emptyState.style.display = 'none';

  if (appState.filteredTasks.length === 0) {
    gridContainer.innerHTML = '';
    emptyState.style.display = 'flex';
    
    // Clear Kanban wrapper counts
    document.getElementById('count-todo').innerText = '0';
    document.getElementById('count-progress').innerText = '0';
    document.getElementById('count-done-column').innerText = '0';
    
    document.getElementById('kanban-wrapper-todo').innerHTML = '';
    document.getElementById('kanban-wrapper-progress').innerHTML = '';
    document.getElementById('kanban-wrapper-done').innerHTML = '';
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

  appState.filteredTasks.forEach(task => {
    const card = createTaskCard(task);
    gridContainer.appendChild(card);
  });
}

function renderKanbanView() {
  const todoWrapper = document.getElementById('kanban-wrapper-todo');
  const progressWrapper = document.getElementById('kanban-wrapper-progress');
  const doneWrapper = document.getElementById('kanban-wrapper-done');

  // Clear existing items
  todoWrapper.innerHTML = '';
  progressWrapper.innerHTML = '';
  doneWrapper.innerHTML = '';

  const todoTasks = appState.filteredTasks.filter(t => t.status === 'To Do');
  const progressTasks = appState.filteredTasks.filter(t => t.status === 'In Progress');
  const doneTasks = appState.filteredTasks.filter(t => t.status === 'Completed');

  // Update column counters
  document.getElementById('count-todo').innerText = todoTasks.length;
  document.getElementById('count-progress').innerText = progressTasks.length;
  document.getElementById('count-done-column').innerText = doneTasks.length;

  // Append elements
  todoTasks.forEach(task => todoWrapper.appendChild(createTaskCard(task, true)));
  progressTasks.forEach(task => progressWrapper.appendChild(createTaskCard(task, true)));
  doneTasks.forEach(task => doneWrapper.appendChild(createTaskCard(task, true)));
}

// Create a DOM Element for a Task Card
function createTaskCard(task, isKanban = false) {
  const card = document.createElement('div');
  card.className = `task-card glass-panel ${isKanban ? 'kanban-card' : ''}`;
  card.setAttribute('data-id', task.id);
  
  if (isKanban) {
    card.setAttribute('draggable', 'true');
  }

  // Format Due Date and Overdue status
  let dueDateHtml = '';
  if (task.dueDate) {
    const todayStr = new Date().toISOString().split('T')[0];
    const isOverdue = task.status !== 'Completed' && task.dueDate < todayStr;
    const dateLabel = isOverdue ? 'Overdue' : 'Due';
    const overdueClass = isOverdue ? 'overdue' : '';

    dueDateHtml = `
      <div class="task-due-date ${overdueClass}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <span>${dateLabel}: ${task.dueDate}</span>
      </div>
    `;
  } else {
    dueDateHtml = `<div></div>`;
  }

  // Status mapping CSS classes
  let statusClass = 'status-todo';
  if (task.status === 'In Progress') statusClass = 'status-progress';
  else if (task.status === 'Completed') statusClass = 'status-done';

  // Category mapping CSS classes
  let catClass = 'tag-other';
  if (task.category === 'Personal') catClass = 'tag-personal';
  else if (task.category === 'Medical') catClass = 'tag-medical';
  else if (task.category === 'Work') catClass = 'tag-work';

  // Priority mapping CSS classes
  let priorityClass = 'priority-medium';
  if (task.priority === 'High') priorityClass = 'priority-high';
  else if (task.priority === 'Low') priorityClass = 'priority-low';

  card.innerHTML = `
    <div class="task-card-header">
      <span class="task-category-tag ${catClass}">${task.category}</span>
      <span class="task-priority-badge ${priorityClass}">${task.priority}</span>
    </div>
    <h3 class="task-title">${escapeHTML(task.title)}</h3>
    <p class="task-description">${escapeHTML(task.description || 'No description provided.')}</p>
    <div class="task-card-footer">
      ${dueDateHtml}
      <span class="task-status-pill ${statusClass}">${task.status}</span>
    </div>
  `;

  // Click card to open modal details
  card.addEventListener('click', (e) => {
    // Prevent opening modal if drag starts
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

// --- Modal Details Actions ---
function openModal(taskId) {
  const task = appState.tasks.find(t => t.id === taskId);
  if (!task) return;

  const modal = document.getElementById('task-modal');
  
  // Set details content
  document.getElementById('modal-title').innerText = task.title;
  document.getElementById('modal-status').innerText = task.status;
  document.getElementById('modal-priority').innerText = task.priority;
  document.getElementById('modal-due-date').innerText = task.dueDate || 'No due date';
  document.getElementById('modal-category').innerText = task.category;
  document.getElementById('modal-description').innerText = task.description || 'No description details available.';
  
  // Notes setup
  const notesPanel = document.getElementById('modal-notes');
  const notesSection = document.getElementById('modal-notes-section');
  if (task.notes && task.notes.trim() !== '') {
    notesPanel.innerText = task.notes;
    notesSection.style.display = 'block';
  } else {
    notesPanel.innerText = '';
    notesSection.style.display = 'none';
  }

  // Header Tags/Pill rendering inside Modal
  const tagsContainer = document.getElementById('modal-tags-container');
  tagsContainer.innerHTML = '';

  // Category Tag
  let catClass = 'tag-other';
  if (task.category === 'Personal') catClass = 'tag-personal';
  else if (task.category === 'Medical') catClass = 'tag-medical';
  else if (task.category === 'Work') catClass = 'tag-work';
  const catTag = document.createElement('span');
  catTag.className = `task-category-tag ${catClass}`;
  catTag.innerText = task.category;
  tagsContainer.appendChild(catTag);

  // Open the drawer/modal overlay
  modal.classList.add('open');
}

function closeModal() {
  const modal = document.getElementById('task-modal');
  modal.classList.remove('open');
}

// --- Kanban Drag and Drop Sub-Engine ---
function setupKanbanDragAndDrop() {
  const wrappers = document.querySelectorAll('.kanban-cards-wrapper');

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
    if (card) {
      card.classList.remove('dragging');
    }
  });

  wrappers.forEach(wrapper => {
    wrapper.addEventListener('dragover', (e) => {
      e.preventDefault();
      wrapper.classList.add('drag-over');
    });

    wrapper.addEventListener('dragleave', () => {
      wrapper.classList.remove('drag-over');
    });

    wrapper.addEventListener('drop', (e) => {
      e.preventDefault();
      wrapper.classList.remove('drag-over');
      
      const taskId = e.dataTransfer.getData('text/plain');
      const targetStatus = wrapper.getAttribute('data-status');
      
      if (taskId && targetStatus) {
        updateTaskStatus(taskId, targetStatus);
      }
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

// --- Utility Functions ---
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
