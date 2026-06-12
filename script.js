/* =========================================================================
   Aurum — Personal Finance Dashboard
   script.js  ·  Vanilla JavaScript, no frameworks.
   Data persists in the browser's Local Storage.
   ========================================================================= */

"use strict";

/* ------------------------------------------------------------------ *
 * 1. CONFIG
 * ------------------------------------------------------------------ */

// Every category carries a colour + emoji icon so the whole UI stays consistent.
const CATEGORIES = {
  Food:          { color: "#ff6b8a", icon: "🍔", type: "expense" },
  Travel:        { color: "#38bdf8", icon: "✈️", type: "expense" },
  Shopping:      { color: "#c084fc", icon: "🛍️", type: "expense" },
  Bills:         { color: "#fb923c", icon: "🧾", type: "expense" },
  Entertainment: { color: "#f472b6", icon: "🎬", type: "expense" },
  Health:        { color: "#34d399", icon: "🩺", type: "expense" },
  Education:     { color: "#60a5fa", icon: "🎓", type: "expense" },
  Salary:        { color: "#19d3a2", icon: "💰", type: "income"  },
  Other:         { color: "#94a3b8", icon: "📌", type: "both"    },
};

// Local Storage keys — bumped if the data shape ever changes.
const KEYS = {
  tx: "aurum.transactions.v1",
  budgets: "aurum.budgets.v1",
  goals: "aurum.goals.v1",
  theme: "aurum.theme.v1",
};

const CURRENCY = "$"; // change to "₹", "€", etc. to localise

/* ------------------------------------------------------------------ *
 * 2. STATE  (loaded from Local Storage, falls back to sample data)
 * ------------------------------------------------------------------ */

let transactions = load(KEYS.tx, null);
let budgets      = load(KEYS.budgets, {});      // { Food: 400, ... }
let goals        = load(KEYS.goals, null);

// Seed friendly demo data the very first time the app is opened.
if (transactions === null) { transactions = sampleTransactions(); save(KEYS.tx, transactions); }
if (goals === null)        { goals = sampleGoals(); save(KEYS.goals, goals); }

let charts = { donut: null, bar: null };        // Chart.js instances
let confirmAction = null;                        // pending callback for confirm modal

/* ------------------------------------------------------------------ *
 * 3. SMALL HELPERS
 * ------------------------------------------------------------------ */

const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function load(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Format a number as currency, e.g. 1234.5 -> "$1,234.50"
function money(n) {
  const sign = n < 0 ? "-" : "";
  return sign + CURRENCY + Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

// "2025-06-09" -> "9 Jun 2025"
function prettyDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

const monthKey = (iso) => iso.slice(0, 7);          // "2025-06"
const todayISO = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => todayISO().slice(0, 7);

/* ------------------------------------------------------------------ *
 * 4. ANIMATED COUNTERS
 * ------------------------------------------------------------------ */

// Counts a number element up to its target value over ~900ms.
function animateCounter(el, target, { prefix = CURRENCY, suffix = "" } = {}) {
  const from = parseFloat(el.dataset.current || "0");
  const start = performance.now();
  const dur = 900;
  el.dataset.current = target;

  function frame(now) {
    const p = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);            // easeOutCubic
    const val = from + (target - from) * eased;
    el.textContent = prefix + val.toLocaleString("en-US", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }) + suffix;
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ *
 * 5. TOASTS  (notification messages)
 * ------------------------------------------------------------------ */

function toast(message, type = "success") {
  const host = $("#toasts");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast__dot"></span><span>${escapeHtml(message)}</span>`;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    el.addEventListener("animationend", () => el.remove());
  }, 2800);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ------------------------------------------------------------------ *
 * 6. CALCULATIONS
 * ------------------------------------------------------------------ */

function totals(list = transactions) {
  let income = 0, expense = 0;
  for (const t of list) {
    if (t.type === "income") income += t.amount;
    else expense += t.amount;
  }
  return { income, expense, balance: income - expense };
}

// Sum of expenses per category, sorted high -> low.
function expenseByCategory(list = transactions) {
  const map = {};
  for (const t of list) {
    if (t.type !== "expense") continue;
    map[t.category] = (map[t.category] || 0) + t.amount;
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

// Income & expense grouped by month, last 6 months.
function monthlyFlow() {
  const map = {};
  for (const t of transactions) {
    const k = monthKey(t.date);
    if (!map[k]) map[k] = { income: 0, expense: 0 };
    map[k][t.type] += t.amount;
  }
  // Build a continuous range of the last 6 months ending this month.
  const months = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 5; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const k = m.toISOString().slice(0, 7);
    months.push({
      key: k,
      label: m.toLocaleDateString("en-US", { month: "short" }),
      income: map[k]?.income || 0,
      expense: map[k]?.expense || 0,
    });
  }
  return months;
}

/* ------------------------------------------------------------------ *
 * 7. RENDER: DASHBOARD
 * ------------------------------------------------------------------ */

function renderDashboard() {
  const { income, expense, balance } = totals();
  const savingsRate = income > 0 ? ((income - expense) / income) * 100 : 0;

  animateCounter($("#statBalance"), balance);
  animateCounter($("#statIncome"), income);
  animateCounter($("#statExpense"), expense);
  animateCounter($("#statSavings"), Math.max(0, savingsRate), { prefix: "", suffix: "%" });

  // Balance chip shows positive/negative state.
  const chip = $("#chipBalance");
  chip.textContent = balance >= 0 ? "Healthy" : "Overspent";
  chip.classList.toggle("neg", balance < 0);

  $("#incomeFoot").textContent  = `${transactions.filter(t => t.type === "income").length} income entries`;
  $("#expenseFoot").textContent = `${transactions.filter(t => t.type === "expense").length} expense entries`;
  $("#savingsFoot").textContent = balance >= 0
    ? `${money(balance)} kept this period`
    : `Spending exceeds income`;

  renderDonut();
  renderBar();
  renderRecent();
}

// Recent 6 transactions
function renderRecent() {
  const list = [...transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 6);
  const host = $("#recentList");
  if (!list.length) { host.innerHTML = `<div class="empty"><p>No transactions yet. Add your first one!</p></div>`; return; }
  host.innerHTML = list.map(rowMarkup).join("");
}

function rowMarkup(t) {
  const cat = CATEGORIES[t.category] || CATEGORIES.Other;
  const isInc = t.type === "income";
  return `
    <div class="recent__row">
      <div class="tx-ic" style="background:${cat.color}22">${cat.icon}</div>
      <div class="tx-meta">
        <strong>${escapeHtml(t.name)}</strong>
        <span>${escapeHtml(t.category)} · ${prettyDate(t.date)}</span>
      </div>
      <div class="tx-amt ${isInc ? "pos" : "neg"}">${isInc ? "+" : "−"}${money(t.amount)}</div>
    </div>`;
}

/* ------------------------------------------------------------------ *
 * 8. RENDER: CHARTS (Chart.js)
 * ------------------------------------------------------------------ */

// Reads a CSS variable from :root so chart text matches the active theme.
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function renderDonut() {
  const data = expenseByCategory();
  const total = data.reduce((s, [, v]) => s + v, 0);

  $("#donutCenterVal").textContent = money(total);
  $("#donutTotalLabel").textContent = total > 0 ? `${data.length} categories` : "No spending yet";

  // Legend
  $("#donutLegend").innerHTML = data.map(([cat, val]) => {
    const c = (CATEGORIES[cat] || CATEGORIES.Other).color;
    const pct = total ? Math.round((val / total) * 100) : 0;
    return `<span class="legend__item"><span class="legend__dot" style="background:${c}"></span>${cat} · ${pct}%</span>`;
  }).join("");

  const ctx = $("#donutChart");
  if (!ctx || typeof Chart === "undefined") return;
  charts.donut?.destroy();

  charts.donut = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: data.map(([c]) => c),
      datasets: [{
        data: data.map(([, v]) => v),
        backgroundColor: data.map(([c]) => (CATEGORIES[c] || CATEGORIES.Other).color),
        borderWidth: 0, hoverOffset: 8,
      }],
    },
    options: {
      cutout: "72%", responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (i) => ` ${i.label}: ${money(i.parsed)}` },
          padding: 10, cornerRadius: 10,
        },
      },
    },
  });
}

function renderBar() {
  const months = monthlyFlow();
  const ctx = $("#barChart");
  if (!ctx || typeof Chart === "undefined") return;
  charts.bar?.destroy();

  const grid = cssVar("--glass-border");
  const text = cssVar("--text-dim");

  charts.bar = new Chart(ctx, {
    type: "bar",
    data: {
      labels: months.map((m) => m.label),
      datasets: [
        { label: "Income",  data: months.map((m) => m.income),  backgroundColor: cssVar("--c-income"),  borderRadius: 6, maxBarThickness: 18 },
        { label: "Expense", data: months.map((m) => m.expense), backgroundColor: cssVar("--c-expense"), borderRadius: 6, maxBarThickness: 18 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: text, usePointStyle: true, pointStyle: "circle", boxWidth: 8 } },
        tooltip: { callbacks: { label: (i) => ` ${i.dataset.label}: ${money(i.parsed.y)}` }, cornerRadius: 10 },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: text } },
        y: { grid: { color: grid }, ticks: { color: text, callback: (v) => CURRENCY + v } },
      },
    },
  });
}

/* ------------------------------------------------------------------ *
 * 9. RENDER: TRANSACTIONS TABLE (+ search & filters)
 * ------------------------------------------------------------------ */

function filteredTransactions() {
  const q     = ($("#txSearch").value || $("#globalSearch").value || "").trim().toLowerCase();
  const type  = $("#filterType").value;
  const cat   = $("#filterCategory").value;
  const month = $("#filterMonth").value;

  return transactions
    .filter((t) => !q || t.name.toLowerCase().includes(q))
    .filter((t) => type === "all" || t.type === type)
    .filter((t) => cat === "all" || t.category === cat)
    .filter((t) => !month || monthKey(t.date) === month)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

function renderTable() {
  const list = filteredTransactions();
  const body = $("#txBody");
  $("#txEmpty").hidden = list.length > 0;

  body.innerHTML = list.map((t) => {
    const cat = CATEGORIES[t.category] || CATEGORIES.Other;
    const isInc = t.type === "income";
    return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:11px">
            <div class="tx-ic" style="background:${cat.color}22;width:34px;height:34px;border-radius:10px">${cat.icon}</div>
            <strong>${escapeHtml(t.name)}</strong>
          </div>
        </td>
        <td><span class="cat-pill" style="background:${cat.color}1f;color:${cat.color}">
          <span class="dot" style="background:${cat.color}"></span>${escapeHtml(t.category)}</span></td>
        <td style="color:var(--text-dim)">${prettyDate(t.date)}</td>
        <td class="num"><span class="tx-amt ${isInc ? "pos" : "neg"}">${isInc ? "+" : "−"}${money(t.amount)}</span></td>
        <td class="actions-col">
          <div class="row-actions">
            <button class="edit" data-edit="${t.id}" aria-label="Edit"><svg viewBox="0 0 24 24" class="ic"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
            <button class="del" data-del="${t.id}" aria-label="Delete"><svg viewBox="0 0 24 24" class="ic"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
          </div>
        </td>
      </tr>`;
  }).join("");
}

/* ------------------------------------------------------------------ *
 * 10. RENDER: BUDGET PLANNER
 * ------------------------------------------------------------------ */

function renderBudget() {
  $("#budgetMonthLabel").textContent = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // How much was spent in each expense category THIS month.
  const spentThisMonth = {};
  for (const t of transactions) {
    if (t.type === "expense" && monthKey(t.date) === thisMonth()) {
      spentThisMonth[t.category] = (spentThisMonth[t.category] || 0) + t.amount;
    }
  }

  const expenseCats = Object.keys(CATEGORIES).filter((c) => CATEGORIES[c].type !== "income");

  $("#budgetList").innerHTML = expenseCats.map((cat) => {
    const c = CATEGORIES[cat].color;
    const limit = budgets[cat] || 0;
    const spent = spentThisMonth[cat] || 0;
    const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
    const over = limit > 0 && spent > limit;
    return `
      <div class="budget-item">
        <div class="budget-item__top">
          <span class="budget-item__name"><span class="dot" style="background:${c}"></span>${cat}</span>
          <span class="budget-item__nums">
            <b>${money(spent)}</b> of
            <input class="budget-input" type="number" min="0" step="10" placeholder="0"
                   value="${limit || ""}" data-budget="${cat}" />
          </span>
        </div>
        <div class="bar"><div class="bar__fill ${over ? "over" : ""}" style="width:${pct}%;background:${c}"></div></div>
        ${over ? `<div class="hint" style="color:var(--c-expense);margin:6px 0 0">Over budget by ${money(spent - limit)}</div>` : ""}
      </div>`;
  }).join("");
}

/* ------------------------------------------------------------------ *
 * 11. RENDER: SAVINGS GOALS (progress rings)
 * ------------------------------------------------------------------ */

function renderGoals() {
  const grid = $("#goalsGrid");
  $("#goalsEmpty").hidden = goals.length > 0;

  grid.innerHTML = goals.map((g) => {
    const pct = g.target > 0 ? Math.min((g.saved / g.target) * 100, 100) : 0;
    const r = 34, circ = 2 * Math.PI * r;
    const offset = circ - (pct / 100) * circ;
    return `
      <div class="goal-card">
        <div class="goal-card__head">
          <h3>${escapeHtml(g.name)}</h3>
          <div class="goal-card__actions">
            <button class="edit" data-goal-edit="${g.id}" aria-label="Edit goal" style="width:30px;height:30px;border-radius:8px;border:1px solid var(--glass-border);background:var(--glass);color:var(--text-dim);cursor:pointer">
              <svg viewBox="0 0 24 24" class="ic" style="width:14px;height:14px;margin:auto"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
            <button class="del" data-goal-del="${g.id}" aria-label="Delete goal" style="width:30px;height:30px;border-radius:8px;border:1px solid var(--glass-border);background:var(--glass);color:var(--text-dim);cursor:pointer">
              <svg viewBox="0 0 24 24" class="ic" style="width:14px;height:14px;margin:auto"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
          </div>
        </div>
        <div class="ring-wrap">
          <svg class="ring" viewBox="0 0 84 84">
            <circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--glass-strong)" stroke-width="8"/>
            <circle cx="42" cy="42" r="${r}" fill="none" stroke="${pct >= 100 ? "var(--c-income)" : "var(--c-gold)"}"
              stroke-width="8" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
              transform="rotate(-90 42 42)" style="transition:stroke-dashoffset .9s var(--ease)"/>
            <text x="42" y="47" text-anchor="middle" class="ring__pct">${Math.round(pct)}%</text>
          </svg>
          <div class="goal-card__nums">
            <b>${money(g.saved)}</b><br>of ${money(g.target)}
          </div>
        </div>
      </div>`;
  }).join("");
}

/* ------------------------------------------------------------------ *
 * 12. RENDER: STATISTICS
 * ------------------------------------------------------------------ */

function renderStats() {
  const expenses = transactions.filter((t) => t.type === "expense");
  const data = expenseByCategory();
  const total = data.reduce((s, [, v]) => s + v, 0);

  $("#statCount").textContent = transactions.length;
  $("#statAvg").textContent = money(expenses.length ? expenses.reduce((s, t) => s + t.amount, 0) / expenses.length : 0);
  $("#statTop").textContent = data.length ? data[0][0] : "—";
  $("#statTopAmt").textContent = data.length ? money(data[0][1]) : "—";

  $("#catBreakdown").innerHTML = data.length ? data.map(([cat, val]) => {
    const c = (CATEGORIES[cat] || CATEGORIES.Other).color;
    const pct = total ? (val / total) * 100 : 0;
    return `
      <div class="breakdown__row">
        <div class="breakdown__name"><span class="dot" style="background:${c}"></span>${cat}</div>
        <div class="bar"><div class="bar__fill" style="width:${pct}%;background:${c}"></div></div>
        <div class="breakdown__amt">${money(val)}</div>
      </div>`;
  }).join("") : `<div class="empty"><p>No expense data yet.</p></div>`;
}

/* ------------------------------------------------------------------ *
 * 13. MASTER RENDER  +  PERSISTENCE
 * ------------------------------------------------------------------ */

function persist() { save(KEYS.tx, transactions); save(KEYS.budgets, budgets); save(KEYS.goals, goals); }

function renderAll() {
  renderDashboard();
  renderTable();
  renderBudget();
  renderGoals();
  renderStats();
}

/* ------------------------------------------------------------------ *
 * 14. TRANSACTION CRUD
 * ------------------------------------------------------------------ */

let formType = "expense"; // current selection in the Add/Edit form

function openTxModal(editId = null) {
  const form = $("#txForm");
  form.reset();
  $("#txId").value = "";

  if (editId) {
    const t = transactions.find((x) => x.id === editId);
    if (!t) return;
    $("#txModalTitle").textContent = "Edit transaction";
    $("#txId").value = t.id;
    $("#txName").value = t.name;
    $("#txAmount").value = t.amount;
    $("#txDate").value = t.date;
    setFormType(t.type);
    populateCategorySelect($("#txCategory"), t.type, t.category);
  } else {
    $("#txModalTitle").textContent = "Add transaction";
    $("#txDate").value = todayISO();
    setFormType("expense");
    populateCategorySelect($("#txCategory"), "expense");
  }
  openModal("#txModal");
}

function setFormType(type) {
  formType = type;
  $$("#txModal .toggle__btn").forEach((b) => b.classList.toggle("is-active", b.dataset.type === type));
  populateCategorySelect($("#txCategory"), type, $("#txCategory").value);
}

// Build the category dropdown filtered by income/expense.
function populateCategorySelect(select, type, selected) {
  const opts = Object.keys(CATEGORIES).filter((c) => {
    const ct = CATEGORIES[c].type;
    return ct === "both" || ct === type;
  });
  select.innerHTML = opts.map((c) =>
    `<option value="${c}" ${c === selected ? "selected" : ""}>${CATEGORIES[c].icon}  ${c}</option>`).join("");
}

function submitTx(e) {
  e.preventDefault();
  const id = $("#txId").value;
  const name = $("#txName").value.trim();
  const amount = parseFloat($("#txAmount").value);
  const date = $("#txDate").value;
  const category = $("#txCategory").value;

  if (!name || !(amount > 0) || !date) { toast("Please fill in every field.", "error"); return; }

  if (id) {
    // EDIT
    const t = transactions.find((x) => x.id === id);
    Object.assign(t, { name, amount, date, category, type: formType });
    toast("Transaction updated.", "info");
  } else {
    // ADD
    transactions.push({ id: uid(), name, amount, date, category, type: formType });
    toast("Transaction added.", "success");
  }

  persist();
  renderAll();
  closeModal("#txModal");
}

function deleteTx(id) {
  const t = transactions.find((x) => x.id === id);
  askConfirm("Delete transaction?", `“${t?.name}” will be permanently removed.`, () => {
    transactions = transactions.filter((x) => x.id !== id);
    persist(); renderAll();
    toast("Transaction deleted.", "info");
  });
}

/* ------------------------------------------------------------------ *
 * 15. GOAL CRUD
 * ------------------------------------------------------------------ */

function openGoalModal(editId = null) {
  $("#goalForm").reset();
  $("#goalId").value = "";
  if (editId) {
    const g = goals.find((x) => x.id === editId);
    if (!g) return;
    $("#goalModalTitle").textContent = "Edit goal";
    $("#goalId").value = g.id;
    $("#goalName").value = g.name;
    $("#goalTarget").value = g.target;
    $("#goalSaved").value = g.saved;
  } else {
    $("#goalModalTitle").textContent = "New savings goal";
  }
  openModal("#goalModal");
}

function submitGoal(e) {
  e.preventDefault();
  const id = $("#goalId").value;
  const name = $("#goalName").value.trim();
  const target = parseFloat($("#goalTarget").value);
  const saved = parseFloat($("#goalSaved").value);
  if (!name || !(target > 0) || saved < 0) { toast("Please complete the goal details.", "error"); return; }

  if (id) {
    const g = goals.find((x) => x.id === id);
    Object.assign(g, { name, target, saved });
    toast("Goal updated.", "info");
  } else {
    goals.push({ id: uid(), name, target, saved });
    toast("Goal created.", "success");
  }
  persist(); renderGoals(); closeModal("#goalModal");
}

function deleteGoal(id) {
  const g = goals.find((x) => x.id === id);
  askConfirm("Delete goal?", `“${g?.name}” will be removed.`, () => {
    goals = goals.filter((x) => x.id !== id);
    persist(); renderGoals();
    toast("Goal deleted.", "info");
  });
}

/* ------------------------------------------------------------------ *
 * 16. CONFIRM MODAL
 * ------------------------------------------------------------------ */

function askConfirm(title, text, onOk) {
  $("#confirmTitle").textContent = title;
  $("#confirmText").textContent = text;
  confirmAction = onOk;
  openModal("#confirmModal");
}

/* ------------------------------------------------------------------ *
 * 17. EXPORT CSV  /  CLEAR ALL
 * ------------------------------------------------------------------ */

function exportCSV() {
  if (!transactions.length) { toast("Nothing to export yet.", "error"); return; }
  const header = ["Name", "Type", "Category", "Amount", "Date"];
  const rows = transactions.map((t) =>
    [t.name, t.type, t.category, t.amount, t.date].map(csvCell).join(","));
  const csv = [header.join(","), ...rows].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `aurum-transactions-${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast("CSV exported.", "success");
}
// Wrap a cell in quotes if it contains commas/quotes.
function csvCell(v) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function clearAll() {
  if (!transactions.length) { toast("Already empty.", "info"); return; }
  askConfirm("Clear all transactions?", "Every transaction will be permanently deleted. Goals and budgets are kept.", () => {
    transactions = [];
    persist(); renderAll();
    toast("All transactions cleared.", "info");
  });
}

/* ------------------------------------------------------------------ *
 * 18. NAVIGATION  /  THEME  /  MODAL PLUMBING
 * ------------------------------------------------------------------ */

const VIEW_META = {
  dashboard:    { title: "Dashboard",      sub: "Your money at a glance" },
  transactions: { title: "Transactions",   sub: "Search, filter and manage every entry" },
  budget:       { title: "Budget",         sub: "Plan limits for the month" },
  goals:        { title: "Savings Goals",  sub: "Track progress toward your targets" },
  stats:        { title: "Statistics",     sub: "Where your money goes" },
};

function switchView(name) {
  $$(".view").forEach((v) => v.classList.toggle("is-active", v.id === `view-${name}`));
  $$(".nav__item").forEach((n) => n.classList.toggle("is-active", n.dataset.view === name));
  const meta = VIEW_META[name];
  $("#viewTitle").textContent = meta.title;
  $("#viewSub").textContent = meta.sub;
  closeSidebar();
  // Re-render charts when returning to dashboard (canvas needs a visible parent).
  if (name === "dashboard") { renderDonut(); renderBar(); }
}

function openModal(sel)  { $(sel).classList.add("is-open"); $(sel).setAttribute("aria-hidden", "false"); }
function closeModal(sel) { $(sel).classList.remove("is-open"); $(sel).setAttribute("aria-hidden", "true"); }

function openSidebar()  { $("#sidebar").classList.add("is-open"); $("#backdrop").classList.add("is-open"); }
function closeSidebar() { $("#sidebar").classList.remove("is-open"); $("#backdrop").classList.remove("is-open"); }

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  save(KEYS.theme, theme);
  // Charts read CSS vars, so re-render them after a theme flip.
  renderDonut(); renderBar();
}

/* ------------------------------------------------------------------ *
 * 19. EVENT WIRING
 * ------------------------------------------------------------------ */

function init() {
  // Restore saved theme (default dark).
  applyTheme(load(KEYS.theme, "dark"));

  // Populate the category filter dropdown with an "All" option.
  $("#filterCategory").innerHTML =
    `<option value="all">All categories</option>` +
    Object.keys(CATEGORIES).map((c) => `<option value="${c}">${c}</option>`).join("");

  // --- Sidebar nav ---
  $$(".nav__item").forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.view)));
  $$("[data-jump]").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.jump)));

  // --- Topbar ---
  $("#addBtn").addEventListener("click", () => openTxModal());
  $("#menuBtn").addEventListener("click", openSidebar);
  $("#backdrop").addEventListener("click", closeSidebar);
  $("#themeBtn").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
  });

  // --- Sidebar footer actions ---
  $("#exportBtn").addEventListener("click", exportCSV);
  $("#clearBtn").addEventListener("click", clearAll);

  // --- Transaction form ---
  $("#txForm").addEventListener("submit", submitTx);
  $$("#txModal .toggle__btn").forEach((b) => b.addEventListener("click", () => setFormType(b.dataset.type)));

  // --- Goal form ---
  $("#addGoalBtn").addEventListener("click", () => openGoalModal());
  $("#goalForm").addEventListener("submit", submitGoal);

  // --- Table actions (event delegation) ---
  $("#txBody").addEventListener("click", (e) => {
    const edit = e.target.closest("[data-edit]");
    const del  = e.target.closest("[data-del]");
    if (edit) openTxModal(edit.dataset.edit);
    if (del)  deleteTx(del.dataset.del);
  });

  // --- Goal card actions ---
  $("#goalsGrid").addEventListener("click", (e) => {
    const edit = e.target.closest("[data-goal-edit]");
    const del  = e.target.closest("[data-goal-del]");
    if (edit) openGoalModal(edit.dataset.goalEdit);
    if (del)  deleteGoal(del.dataset.goalDel);
  });

  // --- Budget inputs (live save on change) ---
  $("#budgetList").addEventListener("change", (e) => {
    const inp = e.target.closest("[data-budget]");
    if (!inp) return;
    const cat = inp.dataset.budget;
    const val = parseFloat(inp.value) || 0;
    if (val > 0) budgets[cat] = val; else delete budgets[cat];
    persist(); renderBudget();
    toast(`Budget for ${cat} saved.`, "success");
  });

  // --- Filters & search ---
  ["txSearch", "filterType", "filterCategory", "filterMonth"].forEach((id) =>
    $("#" + id).addEventListener("input", renderTable));
  $("#globalSearch").addEventListener("input", () => {
    switchView("transactions");
    $("#txSearch").value = $("#globalSearch").value;
    renderTable();
  });
  $("#resetFilters").addEventListener("click", () => {
    $("#txSearch").value = ""; $("#filterType").value = "all";
    $("#filterCategory").value = "all"; $("#filterMonth").value = "";
    renderTable();
  });

  // --- Modal closing (X, Cancel, click backdrop, Esc) ---
  $$("[data-close-modal]").forEach((b) => b.addEventListener("click", () => $$(".modal").forEach((m) => closeModal("#" + m.id))));
  $$(".modal").forEach((m) => m.addEventListener("click", (e) => { if (e.target === m) closeModal("#" + m.id); }));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $$(".modal").forEach((m) => closeModal("#" + m.id)); });

  // --- Confirm modal OK button ---
  $("#confirmOk").addEventListener("click", () => {
    if (typeof confirmAction === "function") confirmAction();
    confirmAction = null;
    closeModal("#confirmModal");
  });

  // First paint.
  renderAll();
}

// Chart.js is loaded with `defer`, so wait for the window to be fully ready.
window.addEventListener("DOMContentLoaded", init);
window.addEventListener("load", () => { renderDonut(); renderBar(); });

/* ------------------------------------------------------------------ *
 * 20. SAMPLE DATA  (only used on first launch)
 * ------------------------------------------------------------------ */

function sampleTransactions() {
  const d = (offset) => {
    const x = new Date(); x.setDate(x.getDate() - offset);
    return x.toISOString().slice(0, 10);
  };
  return [
    { id: uid(), name: "Monthly salary",   amount: 4200, date: d(2),  category: "Salary",        type: "income"  },
    { id: uid(), name: "Freelance project", amount: 850, date: d(9),  category: "Salary",        type: "income"  },
    { id: uid(), name: "Grocery shopping",  amount: 124.5, date: d(1), category: "Food",          type: "expense" },
    { id: uid(), name: "Electricity bill",  amount: 88,   date: d(3),  category: "Bills",         type: "expense" },
    { id: uid(), name: "Train pass",        amount: 65,   date: d(4),  category: "Travel",        type: "expense" },
    { id: uid(), name: "New headphones",    amount: 199,  date: d(6),  category: "Shopping",      type: "expense" },
    { id: uid(), name: "Cinema night",      amount: 32,   date: d(7),  category: "Entertainment", type: "expense" },
    { id: uid(), name: "Pharmacy",          amount: 24.9, date: d(8),  category: "Health",        type: "expense" },
    { id: uid(), name: "Online course",     amount: 49,   date: d(11), category: "Education",     type: "expense" },
    { id: uid(), name: "Dinner out",        amount: 58,   date: d(12), category: "Food",          type: "expense" },
  ];
}

function sampleGoals() {
  return [
    { id: uid(), name: "Emergency fund", target: 5000, saved: 3200 },
    { id: uid(), name: "Holiday trip",   target: 2000, saved: 650  },
  ];
}
