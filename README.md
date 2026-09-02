# Veterans Central Hub Extension

**Claim tracker** plus a shortcut to **[Veterans Central Hub](https://veteranscentralhub.com)** and **[ClaimBuilder](https://claimbuilder.veteranscentralhub.com)**.

Built with [WXT](https://wxt.dev) (Manifest V3) and [Nuxt UI v4](https://ui.nuxt.com).

## What it does

- **Claims tab (default):** Lists your VA benefits claims via `https://api.va.gov/v0/benefits_claims` using your existing VA.gov browser session
- **Ratings tab:** Rated disabilities from `api.va.gov/v0/rated_disabilities`
- **Appeals tab:** Appeals from `api.va.gov/v0/appeals`
- **Hub tab:** Quick links to VCH and ClaimBuilder

**You must sign in at VA.gov first** (Login.gov, ID.me, etc.) and ideally open [Manage claims](https://www.va.gov/track-claims/your-claims/) once. The extension does not ask for your VA password and does not send VA data to VCH servers.

**Canonical install & help URL:** https://veteranscentralhub.com/extension

## Privacy

- VA API calls run in the extension background with `credentials: include` — session cookies stay between your browser and VA
- No VA passwords stored
- Not affiliated with the U.S. Department of Veterans Affairs

## Setup

```bash
cp .env.example .env
npm install
npm run build
```

Load in Chrome: **Extensions → Developer mode → Load unpacked** → `.output/chrome-mv3`

For development, `npm run dev` loads `.output/chrome-mv3-dev` (requires the dev server running).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev build with HMR |
| `npm run build` | Production build |
| `npm run zip` | Zip for Chrome Web Store |

## Repo

https://github.com/wovasteenGova/VCH_extension
