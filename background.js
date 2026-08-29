const DEFAULT_BG = "#eccf6f";

const matches = (host, key) => ("." + host).endsWith(key);

function hostOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") {
      return u.hostname.replace(/\.$/, "");
    }
  } catch { }
  return null;
}

async function bestNote(host, store) {
  const all = store ?? (await browser.storage.local.get(null));
  let best = null;
  for (const [key, note] of Object.entries(all)) {
    if (matches(host, key) && (!best || key.length > best.key.length)) {
      best = {key, note};
    }
  }
  return best;
}

const isDue = (note) => note.remindAt && Date.now() >= note.remindAt;

function inkFor(bg) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.4 ? "#221f1a" : "#f6f2e7";
}

async function refresh(tab, isArrival, store) {
  if (!tab?.id || tab.id === browser.tabs.TAB_ID_NONE) return;
  const host = hostOf(tab.url);
  const found = host ? await bestNote(host, store) : null;
  if (!found) {
    browser.action.setBadgeText({tabId: tab.id, text: ""});
    return;
  }
  const due = isDue(found.note);
  browser.action.setBadgeText({tabId: tab.id, text: due ? "!" : "•"});
  const card = found.note.color || DEFAULT_BG;
  browser.action.setBadgeBackgroundColor({tabId: tab.id, color: due ? inkFor(card) : card});
  browser.action.setBadgeTextColor({tabId: tab.id, color: due ? card : inkFor(card)});
  if (due && isArrival && tab.active) {
    // Let the page settle first so the popup doesn't fight it for focus
    setTimeout(() => openIfStillDue(tab.id, host), 400);
  }
}

async function openIfStillDue(tabId, host) {
  const tab = await browser.tabs.get(tabId).catch(() => null);
  if (!tab?.active || hostOf(tab.url) !== host) return;
  // Never pop the popup into a window the user isn't looking at
  const win = await browser.windows.get(tab.windowId).catch(() => null);
  if (!win?.focused) return;
  const found = await bestNote(host);
  if (!found || !isDue(found.note)) return;
  browser.action.openPopup({windowId: tab.windowId}).catch(() => { });
}

browser.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "complete") refresh(tab, true);
});

browser.tabs.onActivated.addListener(async ({tabId}) => {
  const tab = await browser.tabs.get(tabId).catch(() => null);
  if (tab) refresh(tab, true);
});

browser.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === browser.windows.WINDOW_ID_NONE) return;
  const [tab] = await browser.tabs.query({active: true, windowId});
  if (tab) refresh(tab, true);
});

browser.storage.onChanged.addListener(async () => {
  const store = await browser.storage.local.get(null);
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) refresh(tab, false, store);
});

browser.runtime.onInstalled.addListener(async () => {
  const tabs = await browser.tabs.query({active: true});
  for (const tab of tabs) refresh(tab, false);
});
