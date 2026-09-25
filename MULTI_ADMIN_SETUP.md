# Multi-admin setup (Render)

The app now uses one Google OAuth client for sign-in, while each admin grants their own Google account Drive access. Firebase Firestore stores class settings and encrypted refresh tokens. Each admin creates a class, enters a Drive folder ID and roster, then shares that class's student link.

## 1. Create the Firestore store

1. The Firebase project and Firestore database are already created: [CSM PPT Multi Admin](https://console.firebase.google.com/project/csm-ppt-multi-admin-2026/overview) (`csm-ppt-multi-admin-2026`). The database is Standard, in `asia-south1` (Mumbai), and Google marks it as free tier. No billing account was linked.
2. In **Project settings → Service accounts**, generate a private key. Keep the downloaded JSON private; do not commit it to GitHub.

## 2. Configure Google OAuth

Use a Google OAuth **Web application** client. Add this exact Authorized redirect URI, replacing the host with the Render URL serving this app:

```
https://YOUR-RENDER-SERVICE.onrender.com/auth/google/callback
```

The Google OAuth consent screen must allow the admins who will use the app. This app requests Google Drive access because admins choose a folder and the app creates folders and files within it.

## 3. Add Render environment variables

In the Render service's **Environment** settings, add:

| Variable | Value |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | The complete downloaded Firebase service-account JSON, on one line |
| `GOOGLE_OAUTH_CREDENTIALS_JSON` | The complete Google OAuth client JSON, on one line |
| `MULTI_ADMIN_ENCRYPTION_KEY` | A fresh 64-character hexadecimal secret (32 random bytes) |
| `SUPER_ADMIN_EMAIL` | The verified Google email that owns and manages this app's admin accounts |

Generate the encryption key locally with Node.js:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Never commit these values or paste them into source files. Keep a secure backup of the encryption key: changing or losing it makes saved Google refresh tokens unreadable, and admins will need to sign in again.

After saving the variables, let Render redeploy. Open `/admin.html` on the Render URL and sign in with Google.

The account matching `SUPER_ADMIN_EMAIL` sees all admins and classes, can manage any class and view its submissions, and can disable or re-enable admin access. Disabling an admin removes the app's saved Drive token and active sessions; the admin must sign in again after re-enabling. This grants app-level control only; Google Drive and Cloud Console permissions remain governed by Google.

## 4. Add a class

1. Create or choose a folder in the signed-in admin's Google Drive. Copy the ID from its URL (`/folders/FOLDER_ID`).
2. In the admin page, enter a class name, the folder ID, categories and subjects as JSON, and student roll numbers (one per line).
3. Create the class. Share the generated student link with that class. Drive category and subject folders are created inside the chosen folder when the first upload arrives.

Admins need to sign in to open a class's submissions dashboard. Deleting a class removes its app configuration only; it does not delete the Drive folder or uploaded files.

## Notes

- Render Free has ephemeral service filesystems, so app state and Google tokens are stored in Firestore rather than local files. Render's free Postgres expires after 30 days, so it is not used here. [Render free service limits](https://render.com/docs/free)
- Firebase's Spark plan includes no-cost Firestore usage limits. Keep an eye on the Firebase usage page if the app grows. [Firebase pricing](https://firebase.google.com/pricing)
- Uploads still pass through the Render web service in this version. The app supports multiple admins, but it does not remove Render Free's CPU, memory, or bandwidth limits.
