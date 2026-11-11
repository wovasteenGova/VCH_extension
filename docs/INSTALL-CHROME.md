# Install VCH Web Extension (Chrome or Edge)

No coding required. Use the pre-built zip from GitHub Releases.

**Download:** [veteranscentralhub.com/downloads/vch-web-extension-chrome.zip](https://www.veteranscentralhub.com/downloads/vch-web-extension-chrome.zip)

Install walkthrough: [veteranscentralhub.com/extension](https://www.veteranscentralhub.com/extension)

## Chrome

1. Download the zip from the Hub link above (or the **Download** button on the extension page).
2. Unzip it into a folder you will keep (for example `VCH Web Extension`). The folder must contain **`manifest.json`** at the top level.
3. Open **`chrome://extensions`**
4. Turn on **Developer mode** (top right).
5. Click **Load unpacked** and choose that folder.
6. Pin **VCH Web Extension** from the puzzle icon.

## Microsoft Edge

Same steps, but open **`edge://extensions`** instead of Chrome.

## After install

1. Sign in at [VA.gov](https://www.va.gov/) (Login.gov, ID.me, etc.).
2. Open [Manage claims](https://www.va.gov/track-claims/your-claims/) at least once.
3. Click the extension icon and approve local VA data access. **VA Profile** is the first tab, with ratings and decision letters together. Claims, Track, and Hub have their own tabs.

Optional: sign in to [Veterans Central Hub](https://www.veteranscentralhub.com) in the same browser. In **VA Profile**, find decision letters, select individual PDFs or **Select all letters**, and review the shared **Save VA data to your VCH account** approval before clicking Save. Only unlocked ratings/profile and selected letters are included. **VA Profile → Data controls** manages revocation, local deletion, and optional Track sharing.

## Local development (changing code)

If you edit the extension in this repo, use **`npm run dev`** and load  
`.output/chrome-mv3-dev` (hot reload). See [DEV-WORKFLOW.md](./DEV-WORKFLOW.md).

## Updates

When a new release is published, download the new zip, remove the old extension in `chrome://extensions`, unzip the new folder, and **Load unpacked** again. Or replace the files in your existing folder and click **Reload** on the extension card.

## Privacy

The extension does not ask for your VA password. See the Hub [Privacy Policy](https://www.veteranscentralhub.com/privacy#vch-web-extension).
