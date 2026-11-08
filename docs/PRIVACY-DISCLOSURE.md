# VCH Web Extension privacy disclosure — proposed public copy

This text describes the extension branch in this repository. Review it alongside VCH's public privacy policy and actual server practices before publishing.

VCH Web Extension is an independent tool and is not affiliated with or endorsed by the U.S. Department of Veterans Affairs.

When you first use VA features, the extension asks permission to read information available through your existing signed-in VA.gov session. This can include claims and appeals, disability ratings, and profile information such as name, date of birth, phone, military service periods, and the last four digits of an SSN. The extension saves approved tracker information in local browser extension storage so you can review it later. These local records are not encrypted by the extension. Use a private browser profile on a trusted device.

Your VA.gov password is never requested or stored. VA.gov requests use your existing VA.gov session; VA passwords and VA session cookies are not sent to VCH servers.

Optional VCH imports are separate from local access. The extension reads your VCH sign-in cookie to authenticate approved requests to your account; it does not send that token to VA.gov or unrelated websites. Unlocked ratings/profile and selected decision letters share one Save VA data approval in VA Profile. Locked ratings are excluded, and Select all letters selects only the listed PDFs. Sharing saved claims and appeals with ClaimBuilder/Track requires a separate account-scoped permission in VA Profile → Data controls, followed by the cloud sync confirmation on the VCH page. Cloud grants expire after 30 days and do not apply to a different VCH account.

Decision-letter discovery lists metadata from VA.gov locally. The extension downloads and sends decision PDFs only after you select letters (individually or with Select all), approve the shared Save VA data disclosure, and click **Save to my VCH account**. It does not maintain a local PDF library or download PDFs during routine page checks. Selected PDFs are stored in your private VCH document library and processed by the same document-analysis services described in VCH's privacy policy. A letter is not automatically attached to a claim merely because it was imported. The extension does not modify claims, submit forms, or change your VA.gov profile.

The optional saved-items view reads the Hub's `savedItems` value from an open Hub tab. Opening a saved item or loading its image contacts that item's website or image host. The extension does not inspect general browsing outside its declared VA and VCH hosts.

In **VA Profile → Data controls**, you can revoke cloud access or clear local VA data and permissions. Clearing local records does not delete documents or other records already saved to VCH; manage those in your VCH account. Removing the extension removes its local extension storage. Clear local data before another veteran uses the same browser profile.

The extension executes only bundled code and does not include advertising or analytics trackers. Imported cloud records remain subject to VCH's published storage, analysis, access, retention, and deletion practices. The publisher must verify those statements and the Chrome Web Store's Limited Use declarations before submission.
