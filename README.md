# Personal Expenses Tracker — Personal Finance Dashboard

A premium, banking-style expense tracker built with **plain HTML, CSS, and JavaScript** — no frameworks, no build step. All data lives in your browser's **Local Storage**, so it survives refreshes and works fully offline (after Chart.js loads once).

![Stack](https://img.shields.io/badge/HTML5-CSS3-JS-blue) ![No frameworks](https://img.shields.io/badge/frameworks-none-success)

## Features

- **Dashboard** — total balance, income, expenses and savings rate with animated counters
- **Charts** — category doughnut + 6-month income/expense bar chart (Chart.js)
- **Transactions** — add, edit, delete, search, and filter by name, type, category, and month
- **Budget planner** — set a monthly limit per category and watch the bars fill (with over-budget warnings)
- **Savings goals** — animated progress rings toward each target
- **Statistics** — average expense, top category, and full category breakdown
- **Dark / Light mode** — remembered between visits
- **Export to CSV**, **clear all**, **confirmation popups**, and **toast notifications**
- **Glassmorphism UI**, fully responsive with a collapsible mobile sidebar

## Project structure

```
Expense_Tracker/
├── index.html        # markup & layout
├── style.css         # glassmorphism design system + theming
├── script.js         # all logic, state, charts, persistence
├── assets/
│   ├── images/
│   └── icons/
└── README.md
```

## How to run

No server or install is required.

1. **Easiest:** double-click `index.html` to open it in any modern browser.
2. **Recommended (avoids browser file restrictions):** run a tiny local server from the project folder:
   ```bash
   # Python 3
   python -m http.server 8000
   # then open http://localhost:8000
   ```
   Or in VS Code, use the **Live Server** extension → *Open with Live Server*.

> The charts load Chart.js from a CDN, so an internet connection is needed the **first** time. Everything else (your data, theme, budgets, goals) works offline.

## How Local Storage works

Local Storage is a small key–value store built into every browser. Values are strings, scoped to the site's origin, and persist until cleared.

This app saves four keys:

| Key                       | Holds                                   |
|---------------------------|-----------------------------------------|
| `pet.transactions.v1`   | every transaction                       |
| `pet.budgets.v1`        | per-category monthly limits             |
| `pet.goals.v1`          | savings goals                           |
| `pet.theme.v1`          | `"dark"` or `"light"`                   |

The flow is simple:

```js
// Save — objects are serialised to JSON first
localStorage.setItem("pet.transactions.v1", JSON.stringify(transactions));

// Load — parse the string back into objects on startup
const data = JSON.parse(localStorage.getItem("pet.transactions.v1"));
```

On launch the app reads these keys (`load()` in `script.js`). After any change it calls `persist()`, which writes them back. Because the data lives in your browser, it stays on **your device** — clearing browser data or using a different browser/device starts fresh. To wipe everything manually, open DevTools → *Application* → *Local Storage*.

## Deploy on GitHub Pages

1. Create a new repository on GitHub and push the project:
   ```bash
   git init
   git add .
   git commit -m "Personal Expenses Tracker finance dashboard"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo>.git
   git push -u origin main
   ```
2. On GitHub: **Settings → Pages**.
3. Under *Build and deployment*, set **Source → Deploy from a branch**, pick **main** branch and **/ (root)** folder, then **Save**.
4. Wait a minute — your app goes live at:
   ```
   https://<your-username>.github.io/<repo>/
   ```

Since the project is fully static (no backend), GitHub Pages serves it as-is.

## Customising

- **Currency:** change the `CURRENCY` constant near the top of `script.js` (e.g. `"₹"`, `"€"`).
- **Categories:** edit the `CATEGORIES` object — each one has a colour, emoji, and type.
- **Colours/theme:** tweak the CSS variables in `:root`, `[data-theme="dark"]`, and `[data-theme="light"]` in `style.css`.

---

Built as a static, dependency-light reference for a modern finance UI.
