const MDAC_URL = "https://imigresen-online.imi.gov.my/mdac/main?registerMain";

const sel = document.getElementById("travellerSelect");
const status = document.getElementById("status");

function setStatus(msg, isError = false) {
  status.textContent = msg || "";
  status.classList.toggle("error", !!isError);
}

async function loadTravellers() {
  const { travellers = [], currentId = "" } = await chrome.storage.local.get([
    "travellers",
    "currentId",
  ]);
  sel.innerHTML = "";
  if (travellers.length === 0) {
    const opt = document.createElement("option");
    opt.textContent = "(no travellers saved)";
    opt.value = "";
    sel.appendChild(opt);
    sel.disabled = true;
  } else {
    sel.disabled = false;
    for (const t of travellers) {
      const opt = document.createElement("option");
      opt.value = t.id;
      const nick = t.nickname ? `[${t.nickname}] ` : "";
      const name = (t.personal && t.personal.full_name) || "(unnamed)";
      const passport = (t.personal && t.personal.passport_number) || "";
      opt.textContent = `${nick}${name}${passport ? "  •  " + passport : ""}`;
      sel.appendChild(opt);
    }
    if (currentId && travellers.some((t) => t.id === currentId)) {
      sel.value = currentId;
    }
  }
}

async function currentWindowId() {
  const win = await chrome.windows.getCurrent();
  return win.id;
}

async function openInCurrentWindow(url) {
  const windowId = await currentWindowId();
  return chrome.tabs.create({ url, windowId });
}


sel.addEventListener("change", () => {
  chrome.storage.local.set({ currentId: sel.value });
});

document.getElementById("btnAdd").addEventListener("click", () => {
  openInCurrentWindow(chrome.runtime.getURL("traveller-form.html"));
});

document.getElementById("btnEdit").addEventListener("click", () => {
  if (!sel.value) return setStatus("Select a traveller first.", true);
  openInCurrentWindow(
    chrome.runtime.getURL(`traveller-form.html?id=${encodeURIComponent(sel.value)}`)
  );
});

document.getElementById("btnDelete").addEventListener("click", async () => {
  if (!sel.value) return setStatus("Select a traveller first.", true);
  if (!confirm("Delete this traveller?")) return;
  const { travellers = [] } = await chrome.storage.local.get("travellers");
  const next = travellers.filter((t) => t.id !== sel.value);
  await chrome.storage.local.set({ travellers: next, currentId: next[0]?.id || "" });
  await loadTravellers();
  setStatus("Deleted.");
});

document.getElementById("btnFill").addEventListener("click", async () => {
  const { travellers = [] } = await chrome.storage.local.get("travellers");
  const t = travellers.find((x) => x.id === sel.value);
  if (!t) return setStatus("Select a traveller first.", true);

  await chrome.storage.local.set({ pendingFill: t });

  const windowId = await currentWindowId();
  const tabs = await chrome.tabs.query({ windowId });
  const onRegister = tabs.find(
    (tab) => tab.url && tab.url.includes("registerMain")
  );
  const onAnyMdac = tabs.find(
    (tab) => tab.url && tab.url.startsWith(MDAC_URL.split("?")[0])
  );
  if (onRegister) {
    // Already on the registration page — just focus, no reload. The content
    // script's storage listener will pick up pendingFill and start filling.
    await chrome.tabs.update(onRegister.id, { active: true });
    await chrome.windows.update(windowId, { focused: true });
    setStatus("Filling current MDAC tab...");
  } else if (onAnyMdac) {
    await chrome.tabs.update(onAnyMdac.id, { active: true, url: MDAC_URL });
    await chrome.windows.update(windowId, { focused: true });
    setStatus("Navigating to registration...");
  } else {
    await chrome.tabs.create({ url: MDAC_URL, windowId });
    setStatus("Opening MDAC...");
  }
  setTimeout(() => window.close(), 400);
});


document.getElementById("btnDownload").addEventListener("click", async () => {
  const { mdac_options } = await chrome.storage.local.get("mdac_options");
  if (!mdac_options) return setStatus("Nothing cached yet.", true);
  const json = JSON.stringify(mdac_options, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const a = document.createElement("a");
  a.href = url;
  a.download = `mdac_options_${stamp}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  setStatus("Downloaded.");
});

loadTravellers();

// devSection (Download) is only shown when running unpacked (no update_url)
if (chrome.runtime.getManifest().update_url) {
  document.getElementById("devSection").style.display = "none";
}
