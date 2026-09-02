# VCH Extension

Browser extension for **Veterans Central Hub** — connect VA.gov activity with [VCH Hub](https://veteranscentralhub.us) and [ClaimBuilder](https://claimbuilder.veteranscentralhub.us).

Built with [WXT](https://wxt.dev) (Manifest V3) and [Nuxt UI v4](https://ui.nuxt.com) (Vue + Vite plugin — the same component stack as VCH / ClaimBuilder, without running a Nuxt server inside the extension).

## What works today (MVP)

- Popup UI with VCH branding (Nuxt UI)
- Content script on `https://www.va.gov/*`
- Read active tab context (title, URL, selected text)
- Save selected text to extension local storage
- Quick links to VCH Hub and ClaimBuilder
- Opens VCH benefits page on first install

## Requirements

- Node.js 20+
- pnpm (recommended) or npm

## Setup

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Load the unpacked extension in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select `.output/chrome-mv3-dev` (path shown in terminal after `pnpm dev`)

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Dev build with HMR |
| `pnpm build` | Production build |
| `pnpm zip` | Zip for Chrome Web Store upload |
| `pnpm compile` | Vue/TS typecheck |

## Project layout

```
entrypoints/
  background.ts    # service worker — messaging, install hook
  content.ts       # runs on VA.gov pages
  popup/           # Nuxt UI popup (Vue)
shared/            # URLs and shared constants
utils/             # extension messaging helpers
public/            # icons + VCH logo
```

## Next steps (product)

1. **VCH auth** — connect signed-in Hub/ClaimBuilder session via `externally_connectable`
2. **Clip to ClaimBuilder** — POST clips to a VCH API instead of local storage only
3. **VA.gov detection** — map URL patterns to checklist updates in ClaimBuilder
4. **Side panel** — persistent VCH assistant while filing on VA.gov

## Repo

https://github.com/wovasteenGova/VCH_extension
