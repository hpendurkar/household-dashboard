# Household Tasks Dashboard

An interactive dashboard for tracking household, personal, and medical tasks. Data is sourced live from a Google Sheet — no backend required.

## Features

| Feature | Status |
|---|---|
| Task statistics (total, to-do, in-progress, completed) | ✅ Done |
| Multi-dimensional filters (Category, Sub-Category, Owner, Priority, Milestone, Status, Search) | ✅ Done |
| Grid and Kanban board views | ✅ Done |
| Light / Dark theme | ✅ Done |
| Live read from Google Sheets on page load and refresh | ✅ Done |
| Milestone filter populated dynamically from a milestones sheet | ✅ Done |
| Edit existing tasks on the dashboard, synced back to Google Sheets | 🔲 Not started |
| Add / remove tasks from the dashboard, synced to Google Sheets | 🔲 Not started |
| Charts and graphs (tasks per owner, tasks per milestone) | 🔲 Not started |
| Activity history and trend tracking | 🔲 Not started |

## Setup

This is a zero-dependency static site — no npm, no build step.

### View locally

Open `index.html` directly in a browser, or run the included server script for local-network access:

```
start-server.bat        # Windows — starts Python HTTP server on port 8080
```

The dashboard fetches data live from Google Sheets on every load. The sheet must be shared as **"Anyone with the link can view"**.

### Deploy

The site is hosted on GitHub Pages from the `master` branch. Every merge to `master` automatically updates the live deployment.

Live URL: https://hpendurkar.github.io/household-dashboard/

### Google Sheet

Both the task list and milestone summary are tabs in the same Google Spreadsheet. The sheet ID is configured at the top of `app.js`.

| Tab | Purpose |
|---|---|
| Sheet 1 (gid=0) | Task list — one row per task |
| Milestones (gid=23811170) | Milestone name → date mapping |
