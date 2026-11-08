# VCH Web Extension

Review VA claims, ratings, and decision letters in a Manifest V3 extension. Optional imports send approved information to your private VCH account. Not affiliated with or endorsed by the U.S. Department of Veterans Affairs.

## Privacy and permissions

VA data access requires the local disclosure and approval before the extension reads your VA.gov session. Claims, ratings, appeals, and selected profile fields are cached locally. VA passwords and session cookies are never sent to VCH. Optional cloud imports read your VCH sign-in cookie to authenticate your approved requests.

- **Claims / Track:** review saved claims and appeals. Enable optional Track sharing in **Privacy**, then approve cloud sync on the VCH Track page.
- **Ratings:** review rated disabilities behind the existing screen lock and explicitly approve any ratings/profile import. The screen lock is not local encryption.
- **Letters:** click **Find decision letters**, choose PDFs, check the disclosure, and click **Send selected to VCH**. Finding letters alone sends no PDFs. Confirmed imports appear in the private document library without inventing claim associations. Keep the extension window open until each import is confirmed.
- **Hub:** open related VCH tools and saved items.
- **Privacy:** revoke cloud access or clear local VA records and permissions. This does not delete records already imported into VCH.

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
