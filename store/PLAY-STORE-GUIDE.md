# Getting the app onto Google Play and the App Store

The app is now a **Capacitor hybrid** — the same React PWA is wrapped in a native shell for both Android and iOS. This guide covers what is **done**, what **only you can do**, and the exact steps in order.

## 0. Build commands

| Command | What it does |
|---|---|
| `npm run cap:sync` | Build web assets and copy them into the native projects |
| `npm run cap:android` | Build and launch the Android project (needs Android Studio) |
| `npm run cap:ios` | Build and launch the iOS project (needs macOS + Xcode) |
| `npm run cap:open:android` | Open the Android project in Android Studio |
| `npm run cap:open:ios` | Open the iOS project in Xcode (macOS only) |

The web build (`npm run build`) is the single source of truth. The native projects just serve the files in `dist/`.

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

- **Build the Android `.aab` or iOS `.ipa`.** Building needs the Android SDK (any machine) and macOS + Xcode (iOS only). I can't reach those from here.
- **Create your Google Play or App Store account, pay the fee, or upload anything.** Those need your identity and payment.
- **Test on a real phone or on Play.** Everything above was tested in a desktop-grade browser at phone size.

## 3. Decide these first (they are hard to change later)

1. **App name.** "Stockly" is already used by other inventory apps on Google Play, so choose a distinctive name. Check the Play Store and a web search for it first. I have not checked any alternative names. Change it in `brand.json`.
2. **Package ID**, such as `com.yourname.shopapp` (lowercase, dots, no spaces). **It can never be changed after your first upload.** Put it in `brand.json` as `packageId`. The same ID is used for both Android and iOS.
3. **Developer name and contact email** in `brand.json`. The email is printed in the privacy policy and shown on your Play page.
4. **A stable web address for the PWA.** Native Capacitor builds bundle the web app and do not depend on the website URL to launch. Keep a stable URL for users who install the PWA from a browser and for the privacy-policy link in each store listing.

## 4. Prepare the native app

```bash
npm run check:release
npm run cap:sync
```

Choose the final app name and identifier before the first store upload. The app ID must match `brand.json`, `android/app/build.gradle`, and the iOS target's bundle identifier. Set the display name in the Android app resources and iOS `CFBundleDisplayName` too; `cap:sync` does not change those native project settings. Keep the Android `versionCode` and iOS `CURRENT_PROJECT_VERSION` increasing for each release. After changing web assets, run `npm run cap:sync` again.

## 5. Google Play account

1. Create a Play Console developer account. There is a **one-time registration fee (reported as USD 25)** and identity verification.
2. **New personal accounts must run a closed test first.** Third-party guides in 2026 report that a personal account created after November 2023 needs **at least 12 testers opted in continuously for 14 days** before it can apply for production access. Rules change, so read what your own Play Console says. Organization accounts are described differently. Check which type suits you.
3. Do not buy fake testers. Use real people. Your shop-owner testers from the validation kit are exactly the right group.

## 6. Build for Android

On Windows, macOS, or Linux with Android Studio and the Android SDK installed:

1. Run `npm run cap:sync`, then `npm run cap:open:android`.
2. In Android Studio, wait for Gradle sync and select a device or emulator to test.
3. For Play, select **Build > Generate Signed Bundle / APK**, choose **Android App Bundle**, and create or select your upload key. Keep the keystore and passwords in secure backups.
4. Upload the signed `.aab` to Play Console internal testing first. Check Play Console's current target API requirement before release; this project is configured for API 36.

## 7. Build for iOS

iOS app builds and signing require **macOS with Xcode**; they cannot be produced on Windows.

1. On a Mac, install the project dependencies and run `npm run cap:sync`.
2. Run `npm run cap:open:ios` to open `ios/App/App.xcodeproj` in Xcode.
3. In Xcode, select the App target, set your Apple Developer team and a unique bundle identifier, then choose an iPhone simulator or connected iPhone and run the app.
4. For TestFlight/App Store, select **Product > Archive**, resolve any signing or privacy prompts, then distribute the archive through App Store Connect.
5. Test install, offline use, data persistence, backup and restore, and deep links on a real iPhone before submitting. iOS 15 or newer is the configured deployment target.

## 8. Create the store listings

### Google Play

1. Play Console > Create app. Name, language, App, Free.
2. **Main store listing:** paste text from `store/LISTING.md` and upload `icon-512.png`, `feature-graphic.png` and the screenshots from `store/phone-screenshots/`.
3. **Privacy policy URL:** `https://YOUR-SITE/privacy.html`
4. **App content:** the Data safety, Content rating and Target audience answers are suggested in `store/LISTING.md`. Read each question yourself. You are the one declaring it.

### Apple App Store

1. In App Store Connect, create the app using the iOS bundle identifier and SKU.
2. Prepare iPhone screenshots in the exact pixel sizes currently accepted by App Store Connect, plus a support URL and `https://YOUR-SITE/privacy.html` as the privacy-policy URL.
3. Complete the privacy, age-rating, pricing, and export-compliance questions accurately, then submit the Xcode archive for review.

## 9. Test, then release

1. **Internal testing** (you and a few people): install from the link and run Part A of `VALIDATION-KIT.md` on a real phone, including airplane mode and backup and restore.
2. **Closed testing:** add at least 12 real testers (email list or a Google Group), send the opt-in link, keep them in for 14 days, and collect feedback.
3. When Play Console offers it, **apply for production access** and answer its questions honestly.
4. Release to production, ideally with a staged rollout (for example 20%).

## 10. After launch

- The native app contains bundled web assets. Web changes do **not** reach native-app users just by deploying the website: rebuild, increase the platform version, and submit an update to each store.
- Reply to reviews and keep the support email working.
- Tell users to **back up**. This is the biggest risk for them: there is no online copy.

## 11. Known limits to be honest about

- **No sync, no sign-in, no cloud backup.** One phone, one set of data. Backups are files the user makes.
- **No encryption** of the data or backup files beyond the phone's own security.
- A bundled native app can start offline after installation; sign-in and invitations still need internet when Supabase is configured.
- **The data lives in the app's local WebView storage.** Uninstalling or clearing app data erases it; backups are the protection.
- iPhone users can install the native iOS app through the App Store or add the PWA from Safari using **Share > Add to Home Screen**. These are separate install paths.
