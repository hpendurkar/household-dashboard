# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Workflow

This project uses **GitHub Flow**:

- `master` is the stable branch and the GitHub Pages deployment source — never commit directly to it
- All work happens on a short-lived feature branch cut from `master`
- Feature branches are pushed to `origin` and merged into `master` via a pull request
- `master` has branch protection enabled: direct pushes are blocked, a PR is required to merge

**Typical workflow:**

```bash
git checkout master && git pull          # start from latest stable
git checkout -b feature/my-feature      # create feature branch
# ... make changes, commit ...
git push -u origin feature/my-feature   # push branch to GitHub
gh pr create --base master              # open PR via GitHub CLI
# review, then merge PR on GitHub — master auto-deploys via GitHub Pages
git checkout master && git pull         # sync local master after merge
git branch -d feature/my-feature       # clean up local branch
```

Branch naming convention: `feature/<short-description>` (e.g. `feature/task-editing`, `feature/milestone-dates`).

## Running the App

**No build step.** Open `index.html` directly in a browser, or serve the folder with:

```
python -m http.server 8080   # then visit http://localhost:8080
# or double-click start-server.bat on Windows
```

For local-network access use `start-server.bat` (starts Python's HTTP server and prints the LAN URL).

## Architecture

Three source files — no framework, no bundler, no dependencies:

- `index.html` — static shell; all DOM elements are pre-declared and updated by JS at runtime
- `app.js` — all application logic (~400 lines)
- `styles.css` — all styles; light/dark theme via CSS custom properties on `[data-theme]` on `<html>`

### Data Source

Data is fetched live from a single Google Spreadsheet on every page load and Refresh click. Two tabs are used:

| Tab | gid | Content |
|-----|-----|---------|
| Task list | `0` | One row per task |
| Milestone summary | `23811170` | Milestone name → date mapping |

Both are fetched as CSV via Google's `/export?format=csv&gid=<gid>` endpoint. **The sheet must be shared as "Anyone with the link can view"** for the fetch to succeed from the browser.

Constants at the top of `app.js`:
```js
const SHEET_ID = '18n_93cw2RA-8-h79nKVnzeEhu-dndUp6V3FycuGjVrY';
const TASKS_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
const MILESTONES_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=23811170`;
```

### State

```js
appState = {
  tasks: [],          // parsed from tasks sheet on each fetch
  filteredTasks: [],  // subset after filters applied
  milestones: {},     // { 'Seattle Trip': 'Jul 4, 2026', ... } from milestones sheet
  currentView: 'grid' | 'kanban',
  activeFilters: { search, category, subCategory, owner, priority, milestone, status },
  theme: 'light' | 'dark'   // persisted to localStorage
}
```

Theme preference is the only thing kept in `localStorage`. Task data is never cached — always fetched fresh.

### Data Flow (read path)

```
loadSheetData()
  → fetch(TASKS_URL) + fetch(MILESTONES_URL)   [parallel]
  → parseCSV() → processTasksFromCSV()          [tasks]
  → parseMilestonesCSV() → populateMilestoneFilter()  [milestones]
  → filterAndRender()
      → renderAnalytics()
      → renderGridView() | renderKanbanView()
```

`filterAndRender()` is the single render trigger — call it whenever `appState.tasks` or `appState.activeFilters` changes.

### Task Schema

Columns in the task sheet (order flexible — `mapHeaders()` uses regex heuristics):

| Sheet column | Normalized field | Values |
|---|---|---|
| ID | `id` | numeric |
| Category | `category` | House / Personal / Medical / Work / Other |
| SubCategory | `subCategory` | raw string (Plumbing, Electrical, …) |
| Task Description | `title` | raw string |
| Owner | `owner` | raw string (Minu, Hrishi, …) |
| Date Set | `dateSet` | formatted date string |
| Status | `status` | To Do / In Progress / Completed |
| Priority | `priority` | P0 / P1 |
| Milestone | `milestone` | raw string (must match milestones sheet) |
| Date Completed | `dateCompleted` | raw string; if set, overrides status → Completed |
| Comments | `notes` | raw string |

### CSV Parsing

`parseCSV()` is a character-by-character parser that correctly handles quoted fields with embedded commas and newlines. `mapHeaders()` finds each column by regex so column order in the sheet doesn't matter.

### Milestone Filter

`populateMilestoneFilter()` rebuilds the milestone `<select>` from `appState.milestones` after each fetch — new milestones added to the sheet appear automatically without code changes.

### Kanban Drag-and-Drop

Native HTML5 drag events delegated to `document`. Dropping a card calls `updateTaskStatus(taskId, newStatus)` — **this is in-memory only and resets on the next Refresh**, because there is currently no write path back to the sheet.

### Theme

An inline blocking `<script>` in `<head>` applies the saved theme before first paint to prevent flash-of-wrong-theme. `toggleTheme()` in `app.js` keeps `localStorage` and the `data-theme` attribute in sync.

---

## Planned Feature: Task Editing, Addition, and Removal

Currently the dashboard is **read-only** — all mutations (including Kanban drag-and-drop) are ephemeral and discarded on the next fetch. The plan below describes the full write path.

### Approach: Google Apps Script Web App

A pure static GitHub Pages site cannot hold credentials, so writes to Google Sheets must go through an intermediary that owns the OAuth scope. The recommended approach is a **Google Apps Script (GAS) Web App** deployed from within the same Google account:

- Free, no separate server, tied to the existing spreadsheet
- Exposes a single HTTPS endpoint (`doPost`) that the dashboard calls with `fetch()`
- Handles auth via the script owner's session — no OAuth flow in the browser

### Steps to implement

**1. Google Apps Script backend**

In the Google Sheet: `Extensions → Apps Script`. Create a script with:

```js
// doGet — used for health-check / ping
function doGet() {
  return ContentService.createTextOutput('OK');
}

// doPost — handles all write operations
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.openById('<SHEET_ID>').getSheetByName('Tasks'); // adjust tab name
  const { action, row, values } = data;

  if (action === 'add') {
    sheet.appendRow(values);
  } else if (action === 'update') {
    const range = sheet.getRange(row, 1, 1, values.length);
    range.setValues([values]);
  } else if (action === 'delete') {
    sheet.deleteRow(row);
  }

  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

Deploy as **Web App → Execute as: Me → Who has access: Anyone**. Copy the deployment URL into `app.js`:

```js
const GAS_URL = 'https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec';
```

**2. Write helper in `app.js`**

```js
async function sheetWrite(action, rowIndex, values) {
  await fetch(GAS_URL, {
    method: 'POST',
    body: JSON.stringify({ action, row: rowIndex, values })
  });
}
```

Note: GAS Web Apps redirect POST requests, and `fetch()` with `mode: 'no-cors'` is needed to avoid CORS preflight errors (the response will be opaque but the write still succeeds).

**3. UI changes**

- **Edit task** — convert the read-only modal into an editable form. On save: call `sheetWrite('update', ...)`, update `appState.tasks` in place, re-render (no full refetch needed).
- **Add task** — "Add Task" button opens a blank form. On save: call `sheetWrite('add', ...)`, push the new task into `appState.tasks`, re-render.
- **Delete task** — trash icon in the modal with a confirmation step. On confirm: call `sheetWrite('delete', ...)`, remove from `appState.tasks`, close modal, re-render.

**4. Row index tracking**

`processTasksFromCSV()` currently discards the source row number. Each task object will need a `sheetRow` field (the 1-based row index in the sheet, accounting for the header row) so the GAS script knows which row to update or delete.

**5. Kanban persistence**

Once the write path exists, `updateTaskStatus()` should also call `sheetWrite('update', ...)` so drag-and-drop status changes persist to the sheet.
