# Family app — turn on sharing between phones

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
- Admin opens the app first → it creates the family automatically (needs internet once).
- Admin: 👨‍👩‍👧 → 📲 shows a **QR code** / 📤 share link (WhatsApp).
- Each person scans the QR on their phone → taps ➕ and picks their face → done.
- Works with no internet; ☁️⏳ means "waiting to upload", ☁️✅ means everyone has it, 📴 offline.
- On iPhone: Safari → Share → **Add to Home Screen**. On Android: Chrome menu → **Install app**.

## Keep secret
The invite link/QR is the family key. Anyone with it can join. Don't post it publicly.

## For developers
- `npm test` — logic + sync diff tests.
- `npm run test:rules` — security rules on the local emulator (needs Java in ~/.local/share/jdk21).
- Local two-phone test: `http://localhost:5178/?emu` and `http://127.0.0.1:5178/?emu` with
  `firebase emulators:start --only firestore,auth --project demo-family`.
- Every deploy: bump `VERSION` in `sw.js` or phones keep the old files.
