const $ = (id) => document.getElementById(id);
const matches = (host, key) => ("." + host).endsWith(key);
const DAY = 86400000;

// Not a public suffix list: just enough to keep bbc.co.uk from collapsing to co.uk
const PUBLIC_SLDS = new Set(["co", "com", "net", "org", "gov", "edu", "ac", "mil", "sch"]);

const CARDS = [
  {name: "butter", bg: "#eccf6f"},
  {name: "blush", bg: "#f0b7c3"},
  {name: "mint", bg: "#b7d9b0"},
  {name: "sky", bg: "#a6c8e4"},
  {name: "lavender", bg: "#c6b8e8"},
  {name: "pine", bg: "#2e5241"},
  {name: "plum", bg: "#5b3a63"},
  {name: "indigo", bg: "#2f3f66"},
  {name: "red", bg: "#b30e22"},
];

const DEFAULT_BG = CARDS[0].bg;

let host = null;
let key = null;
let note = null;
let color = DEFAULT_BG;
let saveTimer = null;

function hostOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") {
      return u.hostname.replace(/\.$/, "");
    }
  } catch { }
  return null;
}

const isAtomic = (h) => h.includes(":") || /^\d+(\.\d+)*$/.test(h);

function registrableKey(h) {
  if (isAtomic(h)) return h;
  const labels = h.split(".");
  const n = labels.length > 2 && PUBLIC_SLDS.has(labels[labels.length - 2]) ? 3 : 2;
  return labels.slice(-n).join(".");
}

function fmt(ts) {
  const d = new Date(ts);
  const opts = {month: "short", day: "numeric"};
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  let s = d.toLocaleDateString(undefined, opts);
  if (d.getHours() || d.getMinutes()) {
    s += " " + d.toLocaleTimeString(undefined, {hour: "numeric", minute: "2-digit"});
  }
  return s;
}

function inkFor(bg) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.4 ? "#221f1a" : "#f6f2e7";
}

function applyTheme() {
  const root = document.documentElement.style;
  const ink = inkFor(color);
  root.setProperty("--bg", color);
  root.setProperty("--ink", ink);
  root.setProperty("--faint", `color-mix(in srgb, ${ink} 55%, ${color})`);
  root.setProperty("--edge", `color-mix(in srgb, ${ink} 28%, ${color})`);
  root.setProperty("--olive", ink);
  root.setProperty("--rust", ink);
  root.setProperty("--rust-ink", color);
}

function show(view) {
  $("editor").hidden = view !== "editor";
  $("list").hidden = view !== "list";
  $("adder").hidden = view !== "list";
  $("empty").hidden = view !== "empty";
  $("export").hidden = view !== "editor";
  $("all").textContent = view === "list" ? "back" : "all notes";
}

async function init() {
  const [tab] = await browser.tabs.query({active: true, currentWindow: true});
  host = hostOf(tab?.url);
  if (!host) {
    color = DEFAULT_BG;
    applyTheme();
    show("empty");
    return;
  }
  const all = await browser.storage.local.get(null);
  let best = null;
  for (const [k, n] of Object.entries(all)) {
    if (matches(host, k) && (!best || k.length > best.k.length)) best = {k, n};
  }
  if (best) {
    key = best.k;
    note = best.n;
  } else {
    key = "." + registrableKey(host);
    note = null;
  }
  color = note?.color ?? DEFAULT_BG;
  show("editor");
  render();
}

function render() {
  $("domain").textContent = key.slice(1);
  $("note").value = note?.text ?? "";
  $("note").placeholder = `A note for ${key.slice(1)}…`;
  applyTheme();
  renderColors();
  renderReminder();
  grow();
  $("note").focus();
}

function renderColors() {
  const row = $("colors");
  row.replaceChildren();
  for (const card of CARDS) {
    const b = document.createElement("button");
    b.className = "swatch" + (card.bg === color ? " sel" : "");
    b.style.background = card.bg;
    b.style.color = card.bg;
    b.title = card.name;
    b.setAttribute("aria-label", `Card color: ${card.name}`);
    b.addEventListener("click", () => setColor(card.bg));
    row.append(b);
  }
}

async function setColor(bg) {
  color = bg;
  applyTheme();
  renderColors();
  if (note) {
    note.color = bg;
    note.updatedAt = Date.now();
    try {
      await browser.storage.local.set({[key]: note});
      status("saved");
    } catch {
      status("save failed", true);
    }
  }
}

async function persist(final = false) {
  const text = $("note").value;
  const now = Date.now();
  try {
    if (!text && !note?.remindAt) {
      if (!note) return;
      // Deleting only on close leaves the whole session for ctrl-Z to undo a stray select-all-delete
      if (final) {
        await browser.storage.local.remove(key);
        note = null;
      } else {
        status("empty | deleted when closed", true);
      }
      return;
    }
    note = {
      text,
      color,
      createdAt: note?.createdAt ?? now,
      updatedAt: now,
      remindAt: note?.remindAt ?? null,
    };
    await browser.storage.local.set({[key]: note});
    status("saved");
  } catch {
    status("save failed", true);
  }
}

async function setReminder(ts) {
  const now = Date.now();
  note = {
    text: $("note").value,
    color,
    createdAt: note?.createdAt ?? now,
    updatedAt: now,
    remindAt: ts,
  };
  try {
    if (!note.text && !ts) {
      await browser.storage.local.remove(key);
      note = null;
    } else {
      await browser.storage.local.set({[key]: note});
    }
    status("saved");
  } catch {
    status("save failed", true);
  }
  renderReminder();
}

function renderReminder() {
  const due = !!(note?.remindAt && Date.now() >= note.remindAt);
  $("duebar").hidden = !due;
  if (due) {
    const d = new Date(note.remindAt);
    const opts = {month: "short", day: "numeric"};
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
    $("due-since").textContent = `due ${d.toLocaleDateString(undefined, opts)}`;
  }
  $("rem-none").hidden = !!note?.remindAt;
  $("rem-set").hidden = !(note?.remindAt && !due);
  if (note?.remindAt && !due) $("rem-date").textContent = `notify ${fmt(note.remindAt)}`;
}

let statusTimer = null;

function status(msg, sticky = false) {
  const el = $("saved");
  el.textContent = msg;
  el.classList.add("on");
  clearTimeout(statusTimer);
  if (!sticky) statusTimer = setTimeout(() => el.classList.remove("on"), 600);
}

function grow() {
  const t = $("note");
  t.style.height = "auto";
  t.style.height = Math.min(t.scrollHeight, 320) + "px";
}

function addMonths(n) {
  const d = new Date();
  const day = d.getDate();
  // Aug 31 + 1 month must clamp to Sep 30, not roll over into Oct 1
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.getTime();
}

function openNote(k, n) {
  key = k;
  note = n;
  color = n?.color ?? DEFAULT_BG;
  show("editor");
  render();
}

function domainKeyOf(raw) {
  const s = raw.trim().toLowerCase().replace(/^\.+/, "");
  if (!s) return null;
  try {
    // URL() can't parse a bare "example.com" without a scheme
    const u = new URL(s.includes("://") ? s : "https://" + s);
    const h = u.hostname.replace(/\.$/, "");
    if (h) return "." + h;
  } catch { }
  return null;
}

async function showList() {
  const all = await browser.storage.local.get(null);
  const listEl = $("list");
  listEl.replaceChildren();
  const entries = Object.entries(all).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) {
    const p = document.createElement("p");
    p.className = "none";
    p.textContent = "No notes yet.";
    listEl.append(p);
  }
  for (const [k, n] of entries) {
    const row = document.createElement("button");
    row.className = "row";
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = n.color ?? DEFAULT_BG;
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = k.slice(1);
    const when = document.createElement("span");
    when.className = "when";
    if (n.remindAt) {
      if (Date.now() >= n.remindAt) {
        when.textContent = "due";
        when.classList.add("overdue");
      } else {
        when.textContent = fmt(n.remindAt);
      }
    }
    row.append(dot, name, when);
    row.addEventListener("click", () => openNote(k, n));
    listEl.append(row);
  }
  $("duebar").hidden = true;
  show("list");
  $("add-domain").value = "";
  $("add-domain").focus();
}

$("note").addEventListener("input", () => {
  grow();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 250);
});

// Popup teardown can outrun the debounce; flush so the last keystrokes survive
// Both events, because Firefox doesn't reliably deliver blur on every teardown path
const flush = () => {
  if (!key) return;
  clearTimeout(saveTimer);
  persist(true);
};
window.addEventListener("blur", flush);
window.addEventListener("pagehide", flush);

for (const btn of document.querySelectorAll(".preset")) {
  btn.addEventListener("click", () => {
    const ts = btn.dataset.days
      ? Date.now() + btn.dataset.days * DAY
      : addMonths(Number(btn.dataset.months));
    setReminder(ts);
  });
}

// Drawn by hand as a full-popup overlay: Firefox opens native date pickers in an OS window that stacks behind the popup
const pad = (n) => String(n).padStart(2, "0");
let pick = {y: 0, m: 0, d: 1, hh: 9, mm: 0};

const pickTs = () => new Date(pick.y, pick.m, pick.d, pick.hh, pick.mm).getTime();
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();

function drawPicker() {
  const now = new Date();
  $("pick-month").textContent = new Date(pick.y, pick.m, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  $("pick-prev").disabled = pick.y === now.getFullYear() && pick.m === now.getMonth();
  const grid = $("pick-grid");
  grid.replaceChildren();
  for (let i = 0; i < 7; i++) {
    const dow = document.createElement("span");
    dow.className = "pick-dow";
    // Jan 1 2023 was a Sunday, giving locale weekday names for a Sunday-first week
    dow.textContent = new Date(2023, 0, i + 1).toLocaleDateString(undefined, {weekday: "narrow"});
    grid.append(dow);
  }
  for (let i = 0; i < new Date(pick.y, pick.m, 1).getDay(); i++) {
    grid.append(document.createElement("span"));
  }
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  for (let d = 1; d <= daysIn(pick.y, pick.m); d++) {
    const b = document.createElement("button");
    b.className = "pick-day";
    b.textContent = d;
    const ts = new Date(pick.y, pick.m, d).getTime();
    if (ts < todayStart) b.disabled = true;
    if (ts === todayStart) b.classList.add("today");
    if (d === pick.d) b.classList.add("sel");
    b.addEventListener("click", () => {
      pick.d = d;
      drawPicker();
      applyPick();
    });
    grid.append(b);
  }
  $("pick-h").textContent = pad(pick.hh);
  $("pick-m").textContent = pad(pick.mm);
  const past = pickTs() <= Date.now();
  $("pick-h").classList.toggle("past", past);
  $("pick-m").classList.toggle("past", past);
}

// Changes apply live, so closing the popup mid-pick keeps the last choice; cancel restores this
let pickPrev = null;
let pickDirty = false;

function applyPick() {
  const ts = pickTs();
  if (ts <= Date.now()) return;
  pickDirty = true;
  setReminder(ts);
}

const stepPick = (field, delta, mod) => {
  pick[field] = (pick[field] + delta + mod) % mod;
  drawPicker();
  applyPick();
};

$("h-up").addEventListener("click", () => stepPick("hh", 1, 24));
$("h-dn").addEventListener("click", () => stepPick("hh", -1, 24));
$("m-up").addEventListener("click", () => stepPick("mm", 5, 60));
$("m-dn").addEventListener("click", () => stepPick("mm", -5, 60));

$("custom-toggle").addEventListener("click", () => {
  // Rounding now up to the steppers' 5-minute grain keeps the starting point valid
  const t = new Date(Date.now() + 60000);
  t.setMinutes(Math.ceil(t.getMinutes() / 5) * 5, 0, 0);
  pick = {y: t.getFullYear(), m: t.getMonth(), d: t.getDate(), hh: t.getHours(), mm: t.getMinutes()};
  pickPrev = note?.remindAt ?? null;
  pickDirty = false;
  $("picker").hidden = false;
  drawPicker();
});

$("pick-prev").addEventListener("click", () => {
  pick.m--;
  if (pick.m < 0) (pick.m = 11), pick.y--;
  pick.d = Math.min(pick.d, daysIn(pick.y, pick.m));
  drawPicker();
});

$("pick-next").addEventListener("click", () => {
  pick.m++;
  if (pick.m > 11) (pick.m = 0), pick.y++;
  pick.d = Math.min(pick.d, daysIn(pick.y, pick.m));
  drawPicker();
});

$("pick-cancel").addEventListener("click", () => {
  if (pickDirty) setReminder(pickPrev);
  $("picker").hidden = true;
});

$("add-domain").addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  const k = domainKeyOf($("add-domain").value);
  if (!k) {
    status("that doesn't look like a domain", true);
    return;
  }
  const existing = await browser.storage.local.get(k);
  openNote(k, existing[k] ?? null);
});

$("rem-clear").addEventListener("click", () => setReminder(null));

// The due bar's job is over once acted on; leaving the popup open would invite re-reading a handled reminder
const actAndClose = async (ts) => {
  await setReminder(ts);
  window.close();
};
$("done").addEventListener("click", () => actAndClose(null));
$("snooze1").addEventListener("click", () => actAndClose(Date.now() + DAY));
$("snooze7").addEventListener("click", () => actAndClose(Date.now() + 7 * DAY));

$("all").addEventListener("click", () => {
  if (!$("list").hidden) {
    init();
  } else {
    showList();
  }
});

$("export").addEventListener("click", () => {
  const blob = new Blob([$("note").value], {type: "text/plain"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = key.slice(1) + ".txt";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});

// Import/export-all live on the options page: an OS file dialog steals focus and kills the popup
$("backup").addEventListener("click", () => {
  browser.runtime.openOptionsPage();
  window.close();
});

init();
