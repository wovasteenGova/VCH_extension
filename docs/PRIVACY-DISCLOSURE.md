# VCH Web Extension privacy disclosure — proposed public copy

This text describes the extension branch in this repository. Review it alongside VCH's public privacy policy and actual server practices before publishing.

VCH Web Extension is an independent tool and is not affiliated with or endorsed by the U.S. Department of Veterans Affairs.

When you first use VA features, the extension asks permission to read information available through your existing signed-in VA.gov session. With that permission, the extension refreshes the local cache when you open a supported VA.gov page. This can include claims and appeals, disability ratings, decision letter metadata, and profile information such as name, date of birth, phone, military service periods, and the last four digits of an SSN. By default, the extension holds these records and import receipts in memory for the browser session. In Data controls, you can set a passphrase to keep an encrypted copy between sessions. The extension keeps the key in memory until you lock the cache, restart the browser, or reload the extension. If you forget the passphrase, clear the local data and sync again.

Your VA.gov password is never requested or stored. VA.gov requests use your existing VA.gov session; VA passwords and VA session cookies are not sent to VCH servers.

Optional VCH imports are separate from local access. The extension reads your VCH sign-in cookie to authenticate approved requests to your account. The token is used only for VCH requests. Claims and appeals, unlocked ratings and profile details, and selected claim letters share one account-specific approval in VA Profile. Uploads are manual by default. You can separately enable automatic uploads of claims and appeals for the current VA.gov account and the VCH destination shown in the approval card. To send PDFs, select the letters and choose Import to VCH.

Claim-letter discovery lists metadata from VA.gov locally. The extension downloads and sends PDFs only after you select letters, approve saving VA data to your VCH account, and request the import. Selected PDFs are stored in your private VCH document library. ClaimBuilder reviews each PDF and applies full decision analysis only when the letter content supports it.

The optional saved-items view reads the Hub's `savedItems` value from an open Hub tab. Opening a saved item or loading its image contacts that item's website or image host. The extension does not inspect general browsing outside its declared VA and VCH hosts.

In **VA Profile → Data controls**, you can revoke cloud access or clear local VA data and permissions. Clearing local records does not delete documents or other records already saved to VCH; manage those in your VCH account. Removing the extension removes its local extension storage. Clear local data before another veteran uses the same browser profile.

The extension executes only bundled code and does not include advertising or analytics trackers. Imported cloud records remain subject to VCH's published storage, analysis, access, retention, and deletion practices. The publisher must verify those statements and the Chrome Web Store's Limited Use declarations before submission.
