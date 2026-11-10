# Ely Kitties — WL application site

Static site (no build). Deploy the folder to Vercel/Netlify as-is.

## Setup (5 min)
1. **Backend:** new Google Sheet → Extensions → Apps Script → paste `apps-script/Code.gs` → run `setup` →
   Deploy → Web app (Execute as: Me, Access: Anyone) → copy the `/exec` URL.
2. **Config:** `assets/js/config.js` → `sheetEndpoint` (the /exec URL), `tweetId` (intro post id), `siteUrl`.
   Empty `sheetEndpoint` = demo mode (saves only in the visitor's browser).
3. Deploy.

Sheet columns: Timestamp, Code (EK-XXXXXX), X Handle, Wallet, Reply Link, Referred By, Referrals, Queue.
One wallet / one handle per entry. Referral links: `?ref=EK-XXXXXX`.
