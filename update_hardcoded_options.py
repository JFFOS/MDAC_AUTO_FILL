#!/usr/bin/env python3
"""
Scrape MDAC dropdown options and update chrome_extension/options-data.js directly.

Setup (one-time):
    pip install playwright
    playwright install chromium

Usage:
    python3 update_hardcoded_options.py           # headless
    python3 update_hardcoded_options.py --show    # visible browser (debug)
"""

import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("playwright not installed. Run:")
    print("  pip install playwright && playwright install chromium")
    sys.exit(1)

MDAC_URL = "https://imigresen-online.imi.gov.my/mdac/main?registerMain"

# Same label → key mapping used in content.js
LABELS = {
    "nationality":              "Nationality",
    "place_of_birth":           "Place of Birth",
    "sex":                      "Sex",
    "phone_country_code":       "Country / Region Code",
    "mode":                     "Mode of Travel",
    "last_port_of_embarkation": "Last Port of Embarkation",
    "accommodation":            "Accommodation of Stay",
    "state":                    "State",
}

# Reuse the same XPath helper from content.js, but written with string concat
# instead of template literals so it works safely inside Playwright evaluate().
_JS_FIND_SELECT = r"""
    function findSelect(label) {
        var q = '//label[contains(normalize-space(string(.)), "' + label + '")]';
        var r = document.evaluate(q, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (r) {
            var id = r.getAttribute('for');
            if (id) { var t = document.getElementById(id); if (t && t.tagName === 'SELECT') return t; }
        }
        return document.evaluate(
            '(' + q + '/following::select)[1]',
            document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
        ).singleNodeValue;
    }
"""

JS_GET_OPTIONS = f"""
(label) => {{
    {_JS_FIND_SELECT}
    var sel = findSelect(label);
    if (!sel) return [];
    return Array.from(sel.options)
        .map(function(o) {{ return o.text.trim(); }})
        .filter(function(t) {{ return t && !/please choose/i.test(t) && !/^--/.test(t); }});
}}
"""

JS_GET_STATE_ENTRIES = f"""
() => {{
    {_JS_FIND_SELECT}
    var sel = findSelect('State');
    if (!sel) return [];
    return Array.from(sel.options)
        .filter(function(o) {{ return o.value && !/please choose/i.test(o.text); }})
        .map(function(o) {{ return {{ value: o.value, text: o.text.trim() }}; }});
}}
"""

JS_SET_STATE = f"""
(value) => {{
    {_JS_FIND_SELECT}
    var sel = findSelect('State');
    if (!sel) return;
    var setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, value);
    ['input', 'change', 'blur'].forEach(function(e) {{
        sel.dispatchEvent(new Event(e, {{ bubbles: true }}));
    }});
    try {{ var $ = window.jQuery || window.$; if ($ && $.fn) $(sel).val(value).trigger('change'); }} catch (_) {{}}
}}
"""

JS_GET_CITY_OPTIONS = f"""
() => {{
    {_JS_FIND_SELECT}
    var sel = findSelect('City');
    if (!sel) return [];
    return Array.from(sel.options)
        .map(function(o) {{ return o.text.trim(); }})
        .filter(function(t) {{ return t && !/please choose/i.test(t) && !/^--/.test(t); }});
}}
"""


async def wait_for_selects(page, min_count=4, timeout=40):
    """Poll until at least min_count <select> elements are in the DOM."""
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        count = await page.evaluate("() => document.querySelectorAll('select').length")
        if count >= min_count:
            return count
        await asyncio.sleep(0.5)
    return 0


async def main():
    show = "--show" in sys.argv

    print(f"Opening {MDAC_URL} ...")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=not show,
            args=["--disable-blink-features=AutomationControlled"],
        )
        ctx = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 900},
        )
        page = await ctx.new_page()

        # Use "load" — SPA may keep the network busy, so "networkidle" can hang
        await page.goto(MDAC_URL, wait_until="load", timeout=30_000)

        print("Waiting for form to render...")
        count = await wait_for_selects(page, min_count=4, timeout=40)
        if count < 4:
            await page.screenshot(path="mdac_debug.png")
            print(f"ERROR: only {count} <select> element(s) found after 40 s.")
            print("A screenshot was saved to mdac_debug.png for inspection.")
            print("Try running with --show to see the browser.")
            await browser.close()
            sys.exit(1)

        # Extra settle time for dynamic dropdowns
        await asyncio.sleep(2)
        print(f"Form ready ({count} selects found).")

        # --- Basic dropdowns ---
        options: dict = {}
        for key, label in LABELS.items():
            opts = await page.evaluate(JS_GET_OPTIONS, label)
            options[key] = opts or []
            print(f"  {key}: {len(options[key])}")

        # --- Cities per state ---
        states = await page.evaluate(JS_GET_STATE_ENTRIES)
        if not states:
            print("WARNING: no state options found — cities_by_state will be empty.")
        print(f"\nScraping cities for {len(states)} states...")

        cities_by_state: dict = {}
        for i, state in enumerate(states):
            await page.evaluate(JS_SET_STATE, state["value"])

            city_opts: list = []
            for _ in range(50):      # poll up to 10 s
                await asyncio.sleep(0.2)
                city_opts = await page.evaluate(JS_GET_CITY_OPTIONS) or []
                if city_opts:
                    break

            cities_by_state[state["text"]] = city_opts
            print(f"  [{i + 1}/{len(states)}] {state['text']}: {len(city_opts)} cities")

        options["cities_by_state"] = cities_by_state
        await browser.close()

    # --- Write options-data.js ---
    out = Path(__file__).parent / "chrome_extension" / "options-data.js"
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    out.write_text(
        f"// Hard-coded MDAC dropdown options (built-in defaults).\n"
        f"// To refresh: python3 update_hardcoded_options.py\n"
        f"// Last generated: {now}\n"
        f"const HARDCODED_OPTIONS = {json.dumps(options, indent=2, ensure_ascii=False)};\n",
        encoding="utf-8",
    )

    counts = {k: len(v) for k, v in options.items() if k != "cities_by_state" and isinstance(v, list)}
    city_total = sum(len(v) for v in cities_by_state.values())
    print(f"\nWritten: {out}")
    print("Options:", ", ".join(f"{k}={n}" for k, n in counts.items()))
    print(f"Cities:  {city_total} across {len(cities_by_state)} states")
    print("\nDone — reload the unpacked extension in Chrome to pick up the changes.")


if __name__ == "__main__":
    asyncio.run(main())
