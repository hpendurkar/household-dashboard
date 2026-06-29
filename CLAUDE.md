# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

This is a **zero-dependency, no-build** project. Open `index.html` directly in a browser — no npm, no bundler, no server required. The README's `npm install` / `npm run dev` instructions are incorrect; ignore them.

## Architecture

The entire application is three files:

- `index.html` — static shell with all markup; DOM elements are pre-declared and populated by JS at runtime
- `app.js` — all application logic (~700 lines, no modules/imports)
- `styles.css` — all styles, including CSS custom properties for light/dark theming via `[data-theme]` attribute on `<html>`

### State

A single `appState` object is the source of truth:

```js
appState = {
  tasks: [],          // full task list (mirrors localStorage)
  filteredTasks: [],  // subset after filters applied
  currentView: 'grid' | 'kanban',
  activeFilters: { search, category, priority, status },
  theme: 'light' | 'dark'
}
```

Tasks are persisted to `localStorage` under the key `household_tasks` on every mutation. On load, `localStorage` is checked first; if empty, demo data is loaded via `loadDemoData()`.

### Data Flow

CSV upload or demo load → `parseCSV()` → `processTasksFromCSV()` → `appState.tasks` → `saveToLocalStorage()` → `filterAndRender()` → `renderGridView()` or `renderKanbanView()`

`filterAndRender()` is the single render trigger — call it whenever `appState.tasks` or `appState.activeFilters` changes.

### CSV Parsing

`parseCSV()` is a custom character-by-character parser that handles quoted fields containing commas and embedded newlines.

`mapHeaders()` uses regex heuristics to map arbitrary column names to the standard fields (`title`, `category`, `status`, `priority`, `dueDate`, `description`, `notes`). `processTasksFromCSV()` normalizes raw values:
- Category → `Personal` / `Medical` / `Work` / `Other`
- Status → `To Do` / `In Progress` / `Completed`
- Priority → `High` / `Medium` / `Low`

### CSV Format

The expected column order (flexible via header matching):

```
Task, Category, Status, Priority, Due Date, Description, Notes
```

See `sample-tasks.csv` for a working example.

### Kanban Drag-and-Drop

Set up in `setupKanbanDragAndDrop()` using native HTML5 drag events delegated to `document`. Dropping a card onto a column wrapper calls `updateTaskStatus(taskId, newStatus)`, which mutates `appState.tasks`, saves, and re-renders.

### Theme

Applied early via an inline blocking script in `<head>` (reads `localStorage`) to prevent flash-of-wrong-theme. JS toggles the `data-theme` attribute on `<html>` and CSS variables handle all color switching.
