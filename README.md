# VCH Web Extension

Review VA claims, ratings, and decision letters in a Manifest V3 extension. Optional imports send approved information to your private VCH account. Not affiliated with or endorsed by the U.S. Department of Veterans Affairs.

## Privacy and permissions

VA data access requires the local disclosure and approval before the extension reads your VA.gov session. Claims, ratings, appeals, and selected profile fields are cached locally. VA passwords and session cookies are never sent to VCH. Optional cloud imports read your VCH sign-in cookie to authenticate your approved requests.

- **VA Profile (first tab):** review ratings and decision letters together. Find letters, select individual PDFs or **Select all letters**, then review the destination account and the shared **Save VA data to your VCH account** approval. One Save action imports the unlocked ratings/profile and selected PDFs. Locked ratings are excluded. The existing ratings screen lock is not local encryption.
- **Claims / Track:** review saved claims and appeals. Optional Track sharing is managed in **VA Profile → Data controls**, followed by the VCH Track page's cloud sync confirmation.
- **Hub:** open related VCH tools and saved items.
- **Data controls:** revoke cloud access or clear local VA records and permissions from VA Profile. This does not delete records already imported into VCH.
- **Notifications:** slide-down notices at the top report user-requested refreshes, saves, partial failures, and permission/data changes. Long saves keep one progress notice visible and replace it with the confirmed result.


Sign in on [VA.gov](https://www.va.gov/track-claims/your-claims/) normally in the same browser. The extension uses VA.gov's own authenticated read endpoints, including `/v0/claim_letters` and `/v0/claim_letters/:documentId?document_type=:docType`. Endpoint changes or unavailable VA records can affect results; failures are shown instead of being reported as successful imports.

Install/help: [VCH extension](https://www.veteranscentralhub.com/extension). Privacy: [VCH privacy policy](https://www.veteranscentralhub.com/privacy#vch-web-extension).

## Development and verification

Use Node 24 and the committed npm lockfile. No API keys or other secrets are needed. Production destinations are fixed in `shared/urls.ts`.

```sh
npm ci
npm run compile
npm test
npm run zip
npm run verify:package
npm audit
```

`npm run dev` starts WXT development mode. Production builds are in `.output/chrome-mv3`; the Web Store ZIP is `.output/vch-extension-<version>-chrome.zip`. Load the production directory unpacked for acceptance testing. Displayed version comes from `package.json`.

Pull requests and master run type checks, tests, and package verification. Version tags create a GitHub review release after those checks; they do not submit to the Chrome Web Store. The release tag must match `package.json`.

## Web Store review

[Submission checklist and audit findings](docs/WEBSTORE-REVIEW.md) include permission justifications, live acceptance checks, and remaining listing/privacy work. [Proposed privacy disclosure](docs/PRIVACY-DISCLOSURE.md) must be reviewed against actual VCH server practices and published with the release. A local build and automated tests do not constitute Web Store approval or an authenticated live VA acceptance test.
