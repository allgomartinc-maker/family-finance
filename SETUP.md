# Family app

Live: https://allgomartinc-maker.github.io/family-finance/  
Firebase project: `family-finance-75f11` (already set up — steps below are for reference).

Free Firebase "Spark" plan. No credit card. About 10 minutes.

## 1. Create the Firebase project (you do this — needs your Google account)
1. Open https://console.firebase.google.com → **Create a project**.
2. Name: `family-finance` (any name). Turn **Google Analytics off**. Create.

## 2. Turn on anonymous sign-in
Nobody types a password; each phone gets an invisible ID.
1. Left menu **Build → Authentication → Get started**.
2. **Sign-in method → Anonymous → Enable → Save**.

## 3. Create the database
1. **Build → Firestore Database → Create database**.
2. Edition: **Standard**. Location: pick the closest region to the family (for Afghanistan: `asia-south1` Mumbai). This cannot be changed later.
3. Start in **production mode**.
4. Open the **Rules** tab, delete everything, paste the whole content of `firestore.rules` from this folder, **Publish**.

## 4. Get the web config
1. ⚙️ **Project settings → General → Your apps → `</>` (Web)**.
2. Nickname `family`. Do **not** tick Firebase Hosting. Register.
3. Copy the `firebaseConfig = { ... }` block and send it to Claude (or paste it into `config.js`
   in place of `null`). This key is public by design; the rules in step 3 protect the data.

## 5. Put the app online
Hosted free on GitHub Pages (same as Dari POS). Claude does this step once the config is in.
Then add the Pages domain in **Authentication → Settings → Authorized domains**.

## How the family uses it
- Admin opens the app first → **🆕 فامیل نو می‌سازم** → it creates the family (needs internet once).
  A brand-new phone never makes a family by itself; it always asks first.
- Tabs: **💰 پول** (income, spending, money in hand carried month to month) · **🤝 قرض** (loans,
  separate from money in hand) · **🗝️ مدیر** (admin: report, people, invite, loan book, summary).
- Works with no internet; ☁️⏳ means "waiting to upload", ☁️✅ means everyone has it, 📴 offline.
- On iPhone: Safari → Share → **Add to Home Screen**. On Android: Chrome menu → **Install app**.

### Adding a family member (pick one)
1. **Username + password (best for the home-screen app):** 🗝️ → اعضای فامیل → 🔑 next to the
   person → type a username → the app makes a password → 💬 send by WhatsApp. They open the
   link → 🔑 ورود → type both → they are in, as themselves. Making a new password cancels the old one.
2. **Invite link:** 🗝️ → 📲 دعوت → 📤 share or 📋 copy. They open it in the browser, or in the
   home-screen app tap the green **📋 لینک دعوت دارم** to paste it, then pick their face.

### Forgot PIN
PIN screen → **🔑 رمز را فراموش کردم** → that person's username + password → make a new PIN.
The admin should make a login for themselves too, or a forgotten admin PIN can't be reset.
The admin can also reset anyone else's PIN: اعضای فامیل → 🔒↩️.

## Keep secret
The invite link/QR is the family key. Anyone with it can join. Don't post it publicly.
Usernames + passwords are personal; the cloud only keeps an encrypted record that can't be read
without them (see `login.js`).

## For developers
- `npm test` — logic, sync diff, PIN and login (encryption) tests.
- `npm run test:rules` — security rules on the local emulator (needs Java in ~/.local/share/jdk21).
- Local two-phone test: `http://localhost:5178/?emu` and `http://127.0.0.1:5178/?emu` with
  `firebase emulators:start --only firestore,auth --project demo-family`.
- Every deploy: bump `VERSION` in `sw.js` or phones keep the old files.
