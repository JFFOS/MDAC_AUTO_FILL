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
    sel.innerHTML = '<option value="">-- select --</option>';
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
  if (!stateSel || !citySel) return () => {};
  const lower = {};
  for (const k of Object.keys(citiesByState || {})) lower[k.toLowerCase().trim()] = citiesByState[k];
  
  const update = (preserveValue) => {
    const v = (stateSel.value || "").toLowerCase().trim();
    const list = (citiesByState && citiesByState[stateSel.value]) || lower[v] || [];
    fillSelectOptions(citySel, list);
    if (preserveValue) {
      citySel.value = preserveValue;
      if (citySel.value !== preserveValue) {
        const o = document.createElement("option");
        o.value = preserveValue;
        o.textContent = `${preserveValue} (saved)`;
        citySel.prepend(o);
        citySel.value = preserveValue;
      }
    }
  };
  
  stateSel.addEventListener("change", () => update(null));
  return update;
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
  populateSelects(opts);
  const updateCity = wireStateToCity(opts.cities_by_state || (hardcoded && hardcoded.cities_by_state) || {});
  wireDateModeControls();

  if (editingId) {
    const t = travellers.find((x) => x.id === editingId);
    if (!t) {
      titleEl.textContent = "Traveller not found";
      return;
    }
    const display = t.nickname || t.personal?.full_name || "(unnamed)";
    titleEl.textContent = `Edit: ${display}`;
    writeForm(t);
    if (t.accommodation?.state) {
      updateCity(t.accommodation.city);
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

function showBanner(html, type = "info") {
  document.querySelectorAll(".banner").forEach((n) => n.remove());
  const div = document.createElement("div");
  div.classList.add("banner");
  if (type !== "info") div.classList.add(type);
  div.innerHTML = `<div>${html}</div><span class="close">×</span>`;
  div.querySelector(".close").addEventListener("click", () => div.remove());
  document.body.appendChild(div);
}

function getNormalizedData(obj) {
  const clean = (val) => {
    if (val === null || val === undefined) return "";
    if (typeof val === "object" && !Array.isArray(val)) {
      const c = {};
      Object.keys(val).sort().forEach((k) => {
        if (k === "id") return;
        const v = clean(val[k]);
        if (v !== "") c[k] = v;
      });
      return Object.keys(c).length > 0 ? c : "";
    }
    return String(val).trim();
  };
  const out = {};
  Object.keys(obj).sort().forEach((k) => {
    if (k === "id") return;
    const v = clean(obj[k]);
    if (v !== "") out[k] = v;
  });
  return out;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btnSave = form.querySelector('button[type="submit"]');
  if (btnSave.disabled) return;
  btnSave.disabled = true;

  try {
    const data = readForm();
    const { travellers = [] } = await chrome.storage.local.get("travellers");

    const newNorm = JSON.stringify(getNormalizedData(data));

    // 1. Check if it's an exact duplicate of ANOTHER entry
    const otherDuplicate = travellers.some((t) => {
      if (t.id === data.id) return false;
      return JSON.stringify(getNormalizedData(t)) === newNorm;
    });

    if (otherDuplicate) {
      showBanner("<strong>Duplicate!</strong> An identical entry already exists.", "warn");
      btnSave.disabled = false;
      return;
    }

    // 2. If editing, check if anything actually changed
    const existing = travellers.find((t) => t.id === data.id);
    if (existing && JSON.stringify(getNormalizedData(existing)) === newNorm) {
      showBanner("<strong>No changes.</strong> Information is already up to date.");
      btnSave.disabled = false;
      return;
    }

    const idx = travellers.findIndex((t) => t.id === data.id);
    if (idx >= 0) travellers[idx] = data;
    else travellers.push(data);

    await chrome.storage.local.set({ travellers, currentId: data.id });

    const blanks = listBlankPaths(data);
    const msg = blanks.length
      ? `<strong>Saved.</strong> ${blanks.length} field(s) blank: ${blanks.join(", ")} — <strong>you can close this tab.</strong>`
      : "<strong>Saved.</strong> You can close this tab.";

    showBanner(msg, "success");
    statusEl.textContent = "";
  } catch (err) {
    console.error("Save failed:", err);
    showBanner("<strong>Error:</strong> Could not save.", "error");
  } finally {
    btnSave.disabled = false;
  }
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
  wireStateToCity(newOpts.cities_by_state || (hardcoded && hardcoded.cities_by_state) || {});
  writeForm(snapshot);
  warningEl.style.display = "none";
});

init();
