# Chrome Web Store submission preparation

This branch is a review candidate, not a submitted or approved store listing.

## Single purpose

Help a signed-in veteran review their VA claims, ratings, and decision letters and, with explicit consent, import selected information into their private VCH account. Hub links and saved items support that same claims workflow.

## What changed in this audit

- Added a dedicated Letters tab. It uses VA.gov's authenticated `GET /v0/claim_letters` list and `GET /v0/claim_letters/:documentId?document_type=:docType` PDF request. Numeric decision types 184 and 27 are supported even when VA omits descriptive labels.
- Finding letters reads metadata locally. It does not upload or download PDFs. The user selects letters, accepts the disclosure, and clicks **Send selected to VCH**. Each selected PDF is then sent to the existing private document-library endpoint, with `va_decision` as its classification hint. Existing server file validation and content-hash deduplication still apply.
- No letters are automatically assigned to the first completed claim. The library remains the destination when VA omits a claim ID; users can attach the right document later.
- Removed background PDF downloads on page probes and raw PDF persistence in extension storage. An install/update clears the old pending-PDF key. Failed imports stay selected for retry; per-letter results report only confirmed server responses.
- Added local-data consent before mounting VA-reading UI, separate account-scoped cloud grants, revocation, and local-data deletion. Letters always require the selection and send action, regardless of earlier imports. Track bridge access and ratings imports have separate permissions.
- Restricted VA requests to known read endpoints and exact HTTPS origins. Removed arbitrary POST proxies, unrestricted MAIN-world fetch fallback, wildcard VCH host access, unused external messaging, and environment-controlled production destinations.
- Added response timeouts, bounded JSON/PDF reads, PDF-header validation, and redirect rejection. Invalid sign-in HTML is never accepted as a successful API result.
- Serialized cache writes in the service worker so ratings, claims, and appeals cannot overwrite one another's concurrent updates. Cache deletion notifies active views. A failed VA request is no longer reported as a fresh saved sync.
- Corrected icon dimensions, fixed existing type errors, upgraded vulnerable build tools, and added repeatable checks before release artifacts are created.

## Required dashboard disclosures

Accurately declare personally identifiable information, health information, authentication information (VCH sign-in tokens), and website content read to provide the extension. Do not select “no user data” merely because some records stay on-device. Do not claim that local VA records are encrypted by this extension. No VA passwords or VA session cookies are sent to VCH.

Use the privacy policy URL `https://www.veteranscentralhub.com/privacy#vch-web-extension`. Before submission, the public policy and install/help page must describe the new **Letters** selection flow, local profile fields, consent/revocation controls, and VCH's existing document analysis processors and retention/deletion practices. A matching draft is included in `PRIVACY-DISCLOSURE.md`; deploying the extension does not publish that draft.

Confirm the dashboard's Limited Use certifications against actual VCH server practices. Do not invent guarantees about human access, encryption, retention, regulatory compliance, or third-party processors.

## Permission justifications

| Permission/access | Purpose |
| --- | --- |
| `storage` | Locally cache approved VA data, privacy choices, and display preferences; session storage holds a short-lived navigation intent, not PDFs. |
| `cookies` | Read the signed-in VCH session to authenticate optional imports. No VA password collection or VA cookie export. |
| `scripting` | Load the bundled isolated VA helper into tabs opened before installation and read the Hub's `savedItems` value. No remote code execution or arbitrary page inspection. |
| Exact VA.gov hosts and `api.va.gov` | Use the user's existing authenticated VA.gov session for approved read operations. |
| Exact Hub/ClaimBuilder/Track hosts | Signed-in account checks, selected imports, and the consent-gated cache bridge. Legacy `.us` hosts support existing installations. |

## Verification before submitting

Run Node 24 with the committed npm lockfile:

```sh
npm ci
npm run compile
npm test
npm run zip
npm run verify:package
npm audit
```

The ZIP is `.output/vch-extension-<version>-chrome.zip`. Upload that ZIP, never a dev build or source archive. `verify:package` checks Manifest V3, exact hosts, local script entry points, icon dimensions, accidental development URLs, and unwanted package files. CI produces the review artifact without submitting it to the Web Store.

For an authenticated acceptance test, use your own VA.gov and VCH accounts; never put veteran credentials in reviewer instructions or fixtures:

1. Load the production build unpacked in a clean browser profile. Before local consent there must be no VA API calls. Confirm the disclosure is readable at all display sizes.
2. Sign in on VA.gov normally. Open **Letters → Find decision letters**. Compare the available decisions against VA.gov's own claim letters page. Verify metadata with numeric `docType` and no label appears.
3. Confirm no PDF downloads or VCH uploads happen just from finding, refreshing, switching tabs, or leaving an unchecked consent box.
4. Select one letter, approve the disclosure, and send it. Confirm exactly that PDF appears in the correct VCH account's private library. Confirm its contents and scan/classification. An unrelated claim must not receive a link.
5. Repeat the import to verify server deduplication; test a failed download, expired VCH sign-in, and partial multi-letter success. A failed import must not show “Saved.” Keep the extension window open until the server confirms; popup uploads are not durable background jobs.
6. Switch VCH accounts: previous cloud permissions must not carry across. Revoke all cloud access and confirm bridge/status imports stop. Clear local VA data and confirm no in-flight refresh repopulates it without re-enabling access.
7. Test account switching on VA.gov in a shared browser profile. VA reads verify the current VA user identifier; a changed account clears the prior cache, rotates its write generation, and revokes cloud grants. Late responses from the old generation must not refill the new cache. Validate this against live VA sessions before release; use clear-local-data when sharing a browser profile.
8. Review the existing ratings screen-lock behavior. It is a viewing gate, not local encryption or a substitute for a private OS/browser profile.

## Live API verification

The authenticated VA.gov letter index and a PDF download were verified manually in the user's browser during this audit. The observed index uses `document_id`, `doc_type`, `type_id`, `type_description`, and `received_at`, and omits claim associations. The user response supplies `user_account.id`. Tests use synthetic fixtures with that schema; no real document identifiers, account identifiers, PDF contents, or credentials are committed. Selected-letter upload was separately exercised with fake browser/network fixtures. A real VCH cloud import still requires the user's explicit selection and approval.

## Remaining release items

- Authenticated VA.gov → VCH acceptance test (unit fixtures do not prove live access for every veteran).
- Publish the matching privacy/help copy; verify its live URL.
- Provide an accurate store description, support contact, 128px icon, and at least one current screenshot. Chrome requires at least one screenshot; use its documented dimensions and no real veteran data.
- Review the existing broad Hub shortcut/bookmark content against the claimed single purpose and remove unrelated surface area if requested during store review.
- Submit through the publisher dashboard only after the above checks. Store approval is Google's decision.

References: [Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies), [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), [Listing images](https://developer.chrome.com/docs/webstore/images), [Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage).
