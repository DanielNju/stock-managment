# Getting the app onto Google Play

The app is ready to be packaged. This guide covers what is **done**, what **only you can do**, and the exact steps in order.

## 1. What is already done and verified

| Done | How it was checked |
|---|---|
| Starts empty for a real shop (setup screen). Demo data is optional | Browser tests on a clean install |
| Backup to a file, restore from a file, safe erase (type DELETE) | Unit tests and browser tests, including bad and tampered files being refused |
| Installable web app: manifest, icons (incl. maskable), screenshots, shortcuts | Chrome's own installability check reports no errors; every icon and screenshot fetched and measured |
| Works offline, including after closing and reopening | Browser tests in real offline mode |
| Privacy policy page (`/privacy.html`), served as a real page, offline too | Browser tests |
| The app makes no requests to any other website | Browser test records every request |
| Store assets: 512 icon, 1024x500 feature graphic, six 1080x1920 screenshots, listing text | `npm run check:release` checks sizes; listing limits counted |
| Text contrast in light and dark mode | Unit and browser tests |

## 2. What I could not do, and why

- **Build the Android file (.aab).** It needs the Android SDK and Google's servers, which I can't reach from here.
- **Create your Google Play account, pay the fee, or upload anything.** Those need your identity and payment.
- **Test on a real phone or on Play.** Everything above was tested in a desktop-grade browser at phone size.

## 3. Decide these first (they are hard to change later)

1. **App name.** "Stockly" is already used by other inventory apps on Google Play, so choose a distinctive name. Check the Play Store and a web search for it first. I have not checked any alternative names. Change it in `brand.json`.
2. **Package ID**, such as `com.yourname.shopapp` (lowercase, dots, no spaces). **It can never be changed after your first upload.** Put it in `brand.json` as `packageId`.
3. **Developer name and contact email** in `brand.json`. The email is printed in the privacy policy and shown on your Play page.
4. **A stable web address.** The Android app opens your website. The `vercel.app` address works, but a custom domain you control is safer. If you rename or recreate the Vercel project, the address changes and the installed app breaks.

## 4. Before you build the package

```bash
# 1. edit brand.json (name, packageId, developerName, contactEmail)
python3 scripts/make-icons.py                       # only if you changed the look
npm run build                                       # also regenerates privacy.html with your details
npx vite preview --port 4176 &                      # needs Playwright installed once: npm i -D playwright && npx playwright install chromium
node scripts/make-store-assets.mjs http://localhost:4176   # re-takes the screenshots and feature graphic with your new name
npm run check:release                               # lists anything still missing
```
Deploy to your host (`vercel.json` makes direct links like `/customers` work). Then open these in a normal browser tab and confirm:
- `https://YOUR-SITE/privacy.html` shows the policy (not the app).
- `https://YOUR-SITE/manifest.webmanifest` shows JSON.

## 5. Google Play account

1. Create a Play Console developer account. There is a **one-time registration fee (reported as USD 25)** and identity verification.
2. **New personal accounts must run a closed test first.** Third-party guides in 2026 report that a personal account created after November 2023 needs **at least 12 testers opted in continuously for 14 days** before it can apply for production access. Rules change, so read what your own Play Console says. Organization accounts are described differently. Check which type suits you.
3. Do not buy fake testers. Use real people. Your shop-owner testers from the validation kit are exactly the right group.

## 6. Build the Android package (no coding)

This uses PWABuilder, a free service that wraps your website as an Android app (a "Trusted Web Activity").

1. Go to **pwabuilder.com**, enter your site address, and start. It should show your manifest and service worker as passing.
2. Choose **Package for stores > Android**. Fill in:
   - Package ID: the one from `brand.json`
   - App name: from `brand.json`
   - App version `1.0.0`, version code `1`
   - Display mode: standalone; orientation: portrait
   - Signing key: **Create new**. Download the zip and **keep the keystore file and its password in two safe places**. Losing them makes updates painful.
3. **Target Android 16 (API 36).** Google requires new apps to target it. Third-party reports say PWABuilder now does, but **check**: the package page or Play Console will warn you if not.
4. The zip contains the `.aab` file and a `assetlinks.json` for your upload key.

## 7. Make the app open full-screen (Digital Asset Links)

Without this the app shows a browser address bar.

1. Upload the `.aab` to **Internal testing** in Play Console (turn on Play App Signing, which is the default).
2. In Play Console open **Test and release > App integrity > App signing** and copy the **SHA-256 certificate fingerprint**.
3. Copy `store/assetlinks.template.json` to `public/.well-known/assetlinks.json`. Fill in your package ID and **both** fingerprints (the Play app signing key and your upload key).
4. Redeploy. Open `https://YOUR-SITE/.well-known/assetlinks.json`. You must see the JSON, not the app. Then reinstall from the testing link and confirm there is no address bar.

## 8. Create the listing

1. Play Console > Create app. Name, language, App, Free.
2. **Main store listing:** paste text from `store/LISTING.md` and upload `icon-512.png`, `feature-graphic.png` and the screenshots from `store/phone-screenshots/`.
3. **Privacy policy URL:** `https://YOUR-SITE/privacy.html`
4. **App content:** the Data safety, Content rating and Target audience answers are suggested in `store/LISTING.md`. Read each question yourself. You are the one declaring it.

## 9. Test, then release

1. **Internal testing** (you and a few people): install from the link and run Part A of `VALIDATION-KIT.md` on a real phone, including airplane mode and backup and restore.
2. **Closed testing:** add at least 12 real testers (email list or a Google Group), send the opt-in link, keep them in for 14 days, and collect feedback.
3. When Play Console offers it, **apply for production access** and answer its questions honestly.
4. Release to production, ideally with a staged rollout (for example 20%).

## 10. After launch

- **Web updates reach users automatically** when you deploy. The Android file only needs a new version if you change the package ID, icons or manifest settings, or when Google raises the target Android version (yearly).
- Reply to reviews and keep the support email working.
- Tell users to **back up**. This is the biggest risk for them: there is no online copy.

## 11. Known limits to be honest about

- **No sync, no sign-in, no cloud backup.** One phone, one set of data. Backups are files the user makes.
- **No encryption** of the data or backup files beyond the phone's own security.
- **First install needs internet** (to fetch the app). After that it works offline.
- **The data lives in Chrome's storage for your site.** If the user clears Chrome's data for the site, or app storage, it is erased. Backups are the protection.
- **Android only.** iPhone users can use the website, but storage there can be cleared by Safari after a week without a visit unless the app is added to the Home Screen.
- If you later need **no network requests at all**, native backup sharing or notifications, a bundled (Capacitor) build is the next step. It is a bigger change.
