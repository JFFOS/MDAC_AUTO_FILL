const form = document.getElementById("travellerForm");
const titleEl = document.getElementById("formTitle");
const statusEl = document.getElementById("status");
const warningEl = document.getElementById("optionsWarning");

const params = new URLSearchParams(location.search);
const editingId = params.get("id");

function setNested(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] = cur[parts[i]] || {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function getNested(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}

function fillSelectOptions(sel, list) {
  if (!list || list.length === 0) {
    sel.innerHTML = '<option value="">(refresh options from popup)</option>';
    return false;
  }
  sel.innerHTML =
    '<option value="">-- select --</option>' +
    list.map((v) => `<option value="${v.replace(/"/g, "&quot;")}">${v}</option>`).join("");
  return true;
}

function populateSelects(opts) {
  const selects = form.querySelectorAll("select[data-options]");
  const missing = [];
  for (const sel of selects) {
    const key = sel.dataset.options;
    if (key === "city") continue; // city is populated when state changes
    const ok = fillSelectOptions(sel, opts[key]);
    if (!ok) missing.push(key);
  }
  return missing;
}

function wireStateToCity(citiesByState) {
  const stateSel = form.querySelector('[name="accommodation.state"]');
  const citySel = form.querySelector('[name="accommodation.city"]');
  if (!stateSel || !citySel) return;
  const lower = {};
  for (const k of Object.keys(citiesByState || {})) lower[k.toLowerCase().trim()] = citiesByState[k];
  const update = (preserveValue) => {
    const v = (stateSel.value || "").toLowerCase().trim();
    const list = (citiesByState && citiesByState[stateSel.value]) || lower[v] || [];
    fillSelectOptions(citySel, list);
    if (preserveValue && list.includes(preserveValue)) citySel.value = preserveValue;
  };
  stateSel.addEventListener("change", () => update(null));
  update();
}

function readForm() {
  const data = { id: editingId || crypto.randomUUID() };
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === "radio") {
      if (el.checked) setNested(data, el.name, el.value);
    } else {
      setNested(data, el.name, el.value);
    }
  }
  return data;
}

function writeForm(data) {
  for (const el of form.elements) {
    if (!el.name) continue;
    const v = getNested(data, el.name);
    if (v == null) continue;
    if (el.type === "radio") {
      el.checked = el.value === v;
    } else {
      el.value = v;
    }
  }
  // Restore date-mode controls from the hidden value
  for (const modeSel of form.querySelectorAll(".date-mode")) {
    const target = modeSel.dataset.target;
    const hidden = form.querySelector(`input[type=hidden][name="${target}"]`);
    const offset = form.querySelector(`.date-offset[data-target="${target}"]`);
    const v = (hidden?.value || "").trim().toLowerCase();
    if (v === "" ) {
      modeSel.value = "blank";
      if (offset) offset.style.display = "none";
    } else if (v === "today") {
      modeSel.value = "today";
      if (offset) offset.style.display = "none";
    } else {
      const m = v.match(/^today\s*\+\s*(\d+)$/);
      if (m) {
        modeSel.value = "offset";
        if (offset) { offset.value = m[1]; offset.style.display = ""; }
      }
    }
  }
}

function wireDateModeControls() {
  function recompute(target) {
    const modeSel = form.querySelector(`.date-mode[data-target="${target}"]`);
    const offset = form.querySelector(`.date-offset[data-target="${target}"]`);
    const hidden = form.querySelector(`input[type=hidden][name="${target}"]`);
    if (!modeSel || !hidden) return;
    let val = "";
    if (modeSel.value === "today") val = "today";
    else if (modeSel.value === "offset") {
      const n = parseInt(offset?.value, 10);
      val = isNaN(n) || n === 0 ? "today" : `today+${n}`;
    }
    hidden.value = val;
    if (offset) offset.style.display = modeSel.value === "offset" ? "" : "none";
  }
  for (const el of form.querySelectorAll(".date-mode, .date-offset")) {
    el.addEventListener("input", () => recompute(el.dataset.target));
    el.addEventListener("change", () => recompute(el.dataset.target));
  }
}

async function init() {
  const { mdac_options, travellers = [] } = await chrome.storage.local.get([
    "mdac_options",
    "travellers",
  ]);
  const hardcoded = (typeof HARDCODED_OPTIONS !== "undefined" && HARDCODED_OPTIONS.nationality?.length)
    ? HARDCODED_OPTIONS : null;
  const opts = (mdac_options && mdac_options.options) || hardcoded || {};
  const missing = populateSelects(opts);
  wireStateToCity(opts.cities_by_state || {});
  wireDateModeControls();
  if (missing.length > 0) {
    warningEl.style.display = "block";
    warningEl.textContent = `Dropdown options missing: ${missing.join(", ")}.`;
  }

  if (editingId) {
    const t = travellers.find((x) => x.id === editingId);
    if (!t) {
      titleEl.textContent = "Traveller not found";
      return;
    }
    const display = t.nickname || t.personal?.full_name || "(unnamed)";
    titleEl.textContent = `Edit: ${display}`;
    writeForm(t);
    const stateSel = form.querySelector('[name="accommodation.state"]');
    const citySel = form.querySelector('[name="accommodation.city"]');
    if (stateSel && t.accommodation?.state) {
      // Repopulate city for the saved state, preserving the saved city value
      const opts = (await chrome.storage.local.get("mdac_options")).mdac_options?.options || {};
      wireStateToCity(opts.cities_by_state || {});
      stateSel.dispatchEvent(new Event("change"));
      if (citySel && t.accommodation.city) {
        // Try setting; if not in current options, add it as a transient option
        citySel.value = t.accommodation.city;
        if (citySel.value !== t.accommodation.city) {
          const o = document.createElement("option");
          o.value = t.accommodation.city;
          o.textContent = `${t.accommodation.city} (saved)`;
          citySel.prepend(o);
          citySel.value = t.accommodation.city;
        }
      }
    }
  }
}

function listBlankPaths(data) {
  const paths = [];
  function walk(obj, prefix) {
    for (const [k, v] of Object.entries(obj)) {
      if (k === "id") continue;
      const path = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) walk(v, path);
      else if (v == null || v === "") paths.push(path);
    }
  }
  walk(data, "");
  return paths;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = readForm();
  const { travellers = [] } = await chrome.storage.local.get("travellers");
  const idx = travellers.findIndex((t) => t.id === data.id);
  if (idx >= 0) travellers[idx] = data;
  else travellers.push(data);
  await chrome.storage.local.set({ travellers, currentId: data.id });
  const blanks = listBlankPaths(data);
  statusEl.textContent = blanks.length
    ? `Saved. ${blanks.length} field(s) blank: ${blanks.join(", ")} — you can close this tab.`
    : "Saved — you can close this tab.";
});

document.getElementById("btnCancel").addEventListener("click", () => window.close());

// Re-populate dropdowns whenever the cached MDAC options change (e.g. after
// the user clicks Refresh in the popup while this form is open).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.mdac_options) return;
  const hardcoded = (typeof HARDCODED_OPTIONS !== "undefined" && HARDCODED_OPTIONS.nationality?.length)
    ? HARDCODED_OPTIONS : null;
  const newOpts = changes.mdac_options.newValue?.options || hardcoded || {};
  const snapshot = readForm();
  populateSelects(newOpts);
  wireStateToCity(newOpts.cities_by_state || {});
  writeForm(snapshot);
  warningEl.style.display = "none";
});

init();
