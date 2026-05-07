// Runs on the MDAC pages. If a `pendingFill` exists in storage, fills the form.

(function () {
  function fieldAfterLabel(text, nth = 0) {
    const xpath =
      `(//label[contains(normalize-space(string(.)), ${JSON.stringify(text)})]` +
      `/following::*[self::input or self::textarea][not(@type='hidden')])` +
      `[${nth + 1}]`;
    return document.evaluate(
      xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
    ).singleNodeValue;
  }

  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, value);
    ["input", "change", "blur"].forEach((e) =>
      el.dispatchEvent(new Event(e, { bubbles: true }))
    );
  }

  function fillText(label, value, nth = 0) {
    if (!value) return true;
    const el = fieldAfterLabel(label, nth);
    if (!el) {
      console.warn(`[MDAC] no input for '${label}'`);
      return false;
    }
    el.scrollIntoView({ block: "center" });
    setNativeValue(el, value);
    return true;
  }

  function findSelect(label) {
    const labelEl = document.evaluate(
      `//label[contains(normalize-space(string(.)), ${JSON.stringify(label)})]`,
      document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
    ).singleNodeValue;
    if (labelEl) {
      const forId = labelEl.getAttribute("for");
      if (forId) {
        const t = document.getElementById(forId);
        if (t && t.tagName === "SELECT") return t;
      }
    }
    return document.evaluate(
      `(//label[contains(normalize-space(string(.)), ${JSON.stringify(label)})]` +
        `/following::select)[1]`,
      document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
    ).singleNodeValue;
  }

  function fillSelect(label, value) {
    if (!value) return true;
    const sel = findSelect(label);
    if (!sel) {
      console.warn(`[MDAC] no <select> for '${label}'`);
      return false;
    }
    const target = String(value).toUpperCase();
    const short = (String(value).split(" - ")[0] || "").trim().toUpperCase();
    for (const opt of sel.options) {
      const hay = (opt.text + " " + opt.value).toUpperCase();
      if ((target && hay.includes(target)) || (short && hay.includes(short))) {
        sel.value = opt.value;
        ["input", "change", "blur"].forEach((e) =>
          sel.dispatchEvent(new Event(e, { bubbles: true }))
        );
        return true;
      }
    }
    console.warn(`[MDAC] '${label}': no option matched '${value}'`);
    return false;
  }

  function toDdmmyyyy(v) {
    if (!v) return "";
    const s = String(v).trim().toLowerCase();
    const offsetMatch = s.match(/^today\s*([+-])\s*(\d+)$/);
    if (s === "today" || offsetMatch) {
      const d = new Date();
      if (offsetMatch) {
        const sign = offsetMatch[1] === "+" ? 1 : -1;
        d.setDate(d.getDate() + sign * parseInt(offsetMatch[2], 10));
      }
      return [d.getDate(), d.getMonth() + 1, d.getFullYear()]
        .map((n, i) => (i < 2 ? String(n).padStart(2, "0") : n)).join("/");
    }
    const isoMatch = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return v;
    return v;
  }

  function fillDate(label, value) {
    if (!value) return true; // blank means "fill manually"
    const v = toDdmmyyyy(value);
    if (!v) return true;
    return fillText(label, v);
  }

  function showBanner(html, kind = "info") {
    document.querySelectorAll(".mdac-autofill-banner").forEach((n) => n.remove());
    const bg = kind === "warn" ? "#f1c50e" : "#4a72c9";
    const fg = kind === "warn" ? "#1f2433" : "#ffffff";
    const div = document.createElement("div");
    div.className = "mdac-autofill-banner";
    div.style.cssText =
      `position:fixed; top:0; left:0; right:0; padding:10px 40px 10px 16px;` +
      `background:${bg}; color:${fg}; z-index:2147483647;` +
      `font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;` +
      `box-shadow:0 2px 8px rgba(0,0,0,0.15);`;
    const close = document.createElement("span");
    close.textContent = "×";
    close.style.cssText =
      "position:absolute; top:6px; right:14px; cursor:pointer;" +
      "font-size:20px; font-weight:bold; line-height:1;";
    close.addEventListener("click", () => div.remove());
    const body = document.createElement("div");
    body.innerHTML = html;
    div.appendChild(body);
    div.appendChild(close);
    document.body.appendChild(div);
    if (kind !== "warn") setTimeout(() => div.remove(), 12000);
  }

  async function fillForm(t) {
    const p = t.personal || {};
    const tr = t.travel || {};
    const a = t.accommodation || {};
    const c = t.contact || {};

    console.log("[MDAC] auto-filling for", p.full_name || "(unnamed)");

    const blanks = [];
    function attempt(label, value, fn) {
      if (value === "" || value == null) {
        blanks.push(label);
        return;
      }
      fn(label, value);
    }

    attempt("Name", p.full_name, fillText);
    attempt("Passport No.", p.passport_number, fillText);
    attempt("Nationality", p.nationality, fillSelect);
    attempt("Date of Birth", p.date_of_birth, fillDate);
    attempt("Place of Birth", p.place_of_birth || p.nationality, fillSelect);
    attempt("Sex", p.gender, fillSelect);
    attempt("Date of Passport Expiry", p.passport_expiry, fillDate);
    attempt("Email Address", c.email, fillText);
    attempt("Confirm Email Address", c.email, fillText);
    attempt("Mobile No.", c.phone_number, fillText);

    attempt("Date of Arrival", tr.arrival_date, fillDate);
    attempt("Mode of Travel", tr.mode, fillSelect);
    attempt("Date of Departure", tr.departure_date, fillDate);
    attempt("Last Port of Embarkation", tr.last_port_of_embarkation, fillSelect);
    attempt("Flight / Vessel / Transportation No.", tr.transport_number, fillText);
    attempt("Accommodation of Stay", a.type, fillSelect);
    attempt("Address (In Malaysia)", a.address, fillText);
    attempt("State", a.state, fillSelect);
    attempt("Postcode", a.postcode, fillText);

    await new Promise((r) => setTimeout(r, 700));
    attempt("City", a.city, fillSelect);
    attempt("Country / Region Code", c.phone_country_code, fillSelect);

    console.log(
      `[MDAC] done. ${blanks.length} field(s) left blank:`,
      blanks
    );
    if (blanks.length === 0) {
      showBanner(
        "<strong>MDAC Auto-Fill complete.</strong> Solve the CAPTCHA and click SUBMIT."
      );
    } else {
      showBanner(
        `<strong>MDAC Auto-Fill: ${blanks.length} field(s) left blank — fill manually:</strong><br>` +
          blanks.map((b) => `&nbsp;• ${b}`).join("<br>"),
        "warn"
      );
    }
  }

  function scrapeOptionsFromPage() {
    const labels = {
      nationality: "Nationality",
      place_of_birth: "Place of Birth",
      sex: "Sex",
      phone_country_code: "Country / Region Code",
      mode: "Mode of Travel",
      last_port_of_embarkation: "Last Port of Embarkation",
      accommodation: "Accommodation of Stay",
      state: "State",
    };
    const out = {};
    for (const [key, label] of Object.entries(labels)) {
      const sel = findSelect(label);
      out[key] = sel
        ? Array.from(sel.options)
            .map((o) => o.text.trim())
            .filter((t) => t && !/please choose/i.test(t) && !/^--/.test(t))
        : null;
    }
    return out;
  }

  function extensionAlive() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id && chrome.storage && chrome.storage.local);
    } catch (_) {
      return false;
    }
  }

  async function runFullScrape() {
    // Wait for State select to be present
    const startReady = Date.now();
    while (!findSelect("State") && Date.now() - startReady < 25000) {
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!findSelect("State")) throw new Error("State select did not render");

    const opts = scrapeOptionsFromPage();

    const stateSel = findSelect("State");
    const states = Array.from(stateSel.options).filter(
      (o) => o.value && !/please choose/i.test(o.text || "")
    );

    function setSelectValue(sel, value) {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype, "value"
      ).set;
      setter.call(sel, value);
      ["input", "change", "blur"].forEach((e) =>
        sel.dispatchEvent(new Event(e, { bubbles: true }))
      );
      try {
        const $ = window.jQuery || window.$;
        if ($ && $.fn) $(sel).val(value).trigger("change");
      } catch (_) {}
    }

    const cities = {};
    for (let i = 0; i < states.length; i++) {
      const s = states[i];
      try {
        chrome.runtime.sendMessage({
          type: "scrape_progress",
          current: i + 1,
          total: states.length,
          state: s.text.trim(),
        });
      } catch (_) {}

      setSelectValue(stateSel, s.value);

      let cityOpts = [];
      const start = Date.now();
      while (Date.now() - start < 10000) {
        await new Promise((r) => setTimeout(r, 200));
        const citySel = findSelect("City");
        if (!citySel) continue;
        cityOpts = Array.from(citySel.options)
          .map((o) => o.text.trim())
          .filter((t) => t && !/please choose/i.test(t) && !/^--/.test(t));
        if (cityOpts.length > 0) break;
      }
      cities[s.text.trim()] = cityOpts;
      console.log(`[MDAC scrape] ${s.text.trim()} -> ${cityOpts.length} cities`);
    }
    opts.cities_by_state = cities;
    return opts;
  }

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg && msg.type === "scrape_full") {
        runFullScrape()
          .then((options) => sendResponse({ ok: true, options }))
          .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
        return true;
      }
    });
  }

  async function refreshOptionsCache() {
    if (!extensionAlive()) return;
    const start = Date.now();
    while (document.querySelectorAll("select").length < 4 && Date.now() - start < 15000) {
      await new Promise((r) => setTimeout(r, 400));
    }
    const opts = scrapeOptionsFromPage();
    const filled = Object.values(opts).filter((v) => v && v.length).length;
    if (filled > 0 && extensionAlive()) {
      try {
        await chrome.runtime.sendMessage({ type: "save_scraped_options", options: opts });
      } catch (_) {}
    }
  }

  async function tryFill() {
    if (!extensionAlive()) {
      console.warn("[MDAC] extension context not available — reload the page.");
      return;
    }
    let pendingFill;
    try {
      ({ pendingFill } = await chrome.storage.local.get("pendingFill"));
    } catch (e) {
      console.warn("[MDAC] storage read failed:", e.message || e);
      return;
    }
    if (!pendingFill) {
      refreshOptionsCache();
      return;
    }
    try {
      await chrome.storage.local.remove("pendingFill");
    } catch (_) {}
    const start = Date.now();
    while (!fieldAfterLabel("Name") && Date.now() - start < 15000) {
      await new Promise((r) => setTimeout(r, 250));
    }
    await new Promise((r) => setTimeout(r, 600));
    refreshOptionsCache();
    fillForm(pendingFill);
  }

  if (document.readyState === "complete") tryFill();
  else window.addEventListener("load", tryFill);

  // Also react when pendingFill is set after the page is already loaded
  // (popup clicked Auto-Fill while we were already on the registration page).
  if (extensionAlive()) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.pendingFill && changes.pendingFill.newValue) {
        tryFill();
      }
    });
  }
})();
