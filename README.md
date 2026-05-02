# MDAC Auto-Fill

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-v1.1.0-blue.svg)](https://chrome.google.com/webstore)

**MDAC Auto-Fill** is a Chrome extension designed to simplify the process of filling out the [Malaysia Digital Arrival Card (MDAC)](https://imigresen-online.imi.gov.my/mdac/main) form. It allows frequent travelers to save their profile details locally and auto-fill the entire registration form with a single click.

## Features

- **Profile Management:** Save multiple traveler profiles (Personal, Travel, and Accommodation details).
- **One-Click Auto-Fill:** Automatically populate the MDAC registration form.
- **Dynamic Option Syncing:** Scrapes dropdown options (Nationalities, States, Ports of Embarkation) directly from the live MDAC site to ensure data consistency.
- **Privacy-First:** All traveler data is stored locally in your browser's `chrome.storage.local`. No data is synced to the cloud or sent to external servers.
- **Smart Date Handling:** Handles date conversions automatically for the form's required `DD/MM/YYYY` format.

## Installation

### From Chrome Web Store
*(Coming Soon)* - Search for "MDAC Auto-Fill" and click "Add to Chrome".

### Developer / Manual Install
If you wish to run the code from the source:
1. Download or clone this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** and select the `chrome_extension` folder from this project.
5. Pin the extension to your toolbar for easy access.

## How to Use

1. **Add a Profile:** Click the extension icon and select **+ Add Traveler**. This opens a form where you can input traveler details.
2. **Sync Options:** On the first run, the extension may need to "Refresh Options" to fetch the latest lists of countries and states from the official MDAC website.
3. **Auto-Fill:** 
   - Select a traveler from the dropdown in the extension popup.
   - Click **Open MDAC & Auto-Fill**.
   - The extension will navigate to the MDAC site and populate the fields.
4. **Finalize:** For security reasons, the **CAPTCHA** must be solved manually. Once solved, click **Submit**.

## Technical Details

- **Dynamic Scraping:** The extension includes a background scraper that navigates the MDAC form programmatically to cache valid options. This prevents "Invalid Option" errors if the official site updates its lists.
- **Content Scripts:** Uses non-intrusive content scripts that only activate on `imigresen-online.imi.gov.my`.
- **Manifest V3:** Built using the latest Chrome Extension standards for better performance and security.

## Privacy & Security

- **Data Locality:** Your passport numbers, emails, and phone numbers are sensitive. This extension **never** transmits this data. It only exists within your local browser storage.
- **Permissions:** 
  - `storage`: To save your traveler profiles.
  - `tabs`: To open and communicate with the MDAC registration page.
  - `host_permissions`: Limited strictly to the official Malaysian Immigration site.

## Contributing

Contributions are welcome! If you find a bug or have a feature request, please open an issue or submit a pull request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

Distributed under the MIT License. See `LICENSE` for more information.

---
*Disclaimer: This extension is an independent project and is not affiliated with the Malaysian Immigration Department or any government entity.*
