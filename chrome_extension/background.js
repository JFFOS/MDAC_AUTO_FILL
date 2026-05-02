// Service worker. Drives the foreground-tab scrape via the content script.

const MDAC_URL = "https://imigresen-online.imi.gov.my/mdac/main?registerMain";

async function waitForTabComplete(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Tab load timeout"));
    }, timeoutMs);
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((t) => {
      if (t.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }).catch(() => {});
  });
}

async function sendToContent(tabId, message, retries = 10, delayMs = 1500) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await chrome.tabs.sendMessage(tabId, message);
      if (resp !== undefined) return resp;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error("Content script did not respond: " + (lastErr?.message || ""));
}

async function scrapeMDAC({ active = true, closeWhenDone = true } = {}) {
  let win;
  try { win = await chrome.windows.getLastFocused(); } catch (_) {}
  const tab = await chrome.tabs.create({
    url: MDAC_URL,
    active,
    ...(win ? { windowId: win.id } : {}),
  });

  try {
    await waitForTabComplete(tab.id, 30000);
    // Give the SPA a moment after document load
    await new Promise((r) => setTimeout(r, 1500));

    const result = await sendToContent(tab.id, { type: "scrape_full" });
    if (!result || !result.ok) {
      throw new Error(result?.error || "scrape failed");
    }

    const data = {
      options: result.options,
      scraped_at: new Date().toISOString(),
    };
    await chrome.storage.local.set({ mdac_options: data });
    return data;
  } finally {
    if (closeWhenDone) chrome.tabs.remove(tab.id).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "scrape") {
    scrapeMDAC({ active: msg.active !== false })
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
  if (msg && msg.type === "save_scraped_options") {
    chrome.storage.local.get("mdac_options").then(({ mdac_options }) => {
      // Merge basic options without clobbering cities_by_state
      const prev = (mdac_options && mdac_options.options) || {};
      const merged = { ...prev, ...msg.options };
      if (prev.cities_by_state && !msg.options.cities_by_state) {
        merged.cities_by_state = prev.cities_by_state;
      }
      chrome.storage.local.set({
        mdac_options: { options: merged, scraped_at: new Date().toISOString() },
      });
      sendResponse({ ok: true });
    });
    return true;
  }
});
