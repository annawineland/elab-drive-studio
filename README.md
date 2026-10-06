# Engineering Studio

The digital operating system for VW eLab STEM III: missions, engineering notebooks, team
sprints, evidence, and assessment in one place.

## How it runs

- **Hosting:** a static React app (Vite + TanStack Router) published to **GitHub Pages** by
  `.github/workflows/deploy.yml` on every push to `main`.
- **Login/logout:** **Firebase Authentication** — email and password (with email confirmation)
  and Google sign-in.
- **Database:** **Cloud Firestore**. Access control lives in `firestore.rules`, which carries
  over the row-level security policies the app had on Supabase.
- There is no server. Everything runs in the browser, so the free Firebase **Spark** plan is
  enough (50,000 reads and 20,000 writes a day).

## One-time setup

### 1. Firebase project

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. **Project settings → General → Your apps → Add app → Web.** Keep the config values it shows
   (`apiKey`, `authDomain`, `projectId`, `appId`, …).
3. **Authentication → Sign-in method:** enable **Email/Password** and **Google**.
4. **Authentication → Settings → Authorized domains:** add `<your-github-user>.github.io` (and
   your custom domain, if you use one).
5. **Firestore Database → Create database** (production mode, any region).
6. Deploy the security rules from this folder:

   ```bash
   npx firebase-tools login
   ```

   ```bash
   npx firebase-tools deploy --only firestore --project <your-project-id>
   ```

   Run the deploy again whenever `firestore.rules` changes.

### 2. Data and teacher accounts

The admin scripts need a service-account key: **Project settings → Service accounts → Generate
new private key**. Save it outside this folder (or as `service-account.json`, which git ignores)
and never commit or share it — it bypasses the security rules.

- **Starting fresh:** load the mods, stage guides and missions, rubrics, resource library and
  pacing guide:

  ```bash
  npm run firebase:import -- --credentials service-account.json --seed
  ```

- **Moving from Lovable Cloud:** see [Moving your data](#moving-your-data-from-lovable-cloud).

Then sign in to the studio once with your teacher account and make it a teacher (as before,
nobody can make themselves a teacher from the app):

```bash
npm run firebase:set-teacher -- --credentials service-account.json you@school.edu
```

### 3. GitHub Pages

1. Create a repository on GitHub and push this folder to its `main` branch.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Settings → Secrets and variables → Actions → Variables:** add `VITE_FIREBASE_API_KEY`,
   `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`,
   `VITE_FIREBASE_STORAGE_BUCKET` and `VITE_FIREBASE_MESSAGING_SENDER_ID` from step 1.2. These
   are public by design; the rules protect the data.
4. Push to `main` (or run the workflow from the **Actions** tab). The studio appears at
   `https://<your-github-user>.github.io/<repository>/`.

Using a custom domain? Add a `BASE_PATH` variable with the value `/`.

### 4. Optional: Google Drive

The Evidence Vault can attach files from a student's own Drive, and teachers can sync their
Drive guides and templates into the Resource Library. Both use read-only access granted in a
Google popup; nothing is stored on a server.

1. In the [Google Cloud console](https://console.cloud.google.com) for your Firebase project,
   enable the **Google Drive API**.
2. **APIs & Services → OAuth consent screen:** add the `.../auth/drive.readonly` scope. For a
   school Google Workspace, choose **Internal** so no Google review is needed.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.**
   Authorized JavaScript origins: `https://<your-github-user>.github.io` and
   `http://localhost:5173`.
4. Add the client ID as a `VITE_GOOGLE_CLIENT_ID` repository variable (and to `.env.local`).

A Drive connection lasts about an hour per browser tab; students click **Connect Google Drive**
again after that. In the Resource Library, teachers click **Sync from my Drive** to refresh the
list students see.

### 5. Optional: email links that open the studio

By default Firebase's confirmation and password-reset emails open a Firebase-hosted page. To
open the studio instead, set **Authentication → Templates → (pencil) → Customize action URL** to
`https://<your-github-user>.github.io/<repository>/reset-password`.

## Moving your data from Lovable Cloud

1. **Export each table** from Lovable Cloud's database view as CSV into one folder, named after
   the table: `entries.csv`, `teams.csv`, `mod_enrollments.csv`, and so on.
2. **Export the accounts** so everyone keeps their own work. In the SQL editor run the query
   below and save the result as `auth_users.csv` in the same folder:

   ```sql
   select id, email, email_confirmed_at from auth.users;
   ```

   If you can't, students are still matched through the rosters, and you can name anyone else
   with `--user <old-user-id>=<email>` (repeatable).

3. **Preview**, then import:

   ```bash
   npm run firebase:import -- --from ./export --dry-run
   ```

   ```bash
   npm run firebase:import -- --credentials service-account.json --from ./export
   ```

Passwords can't be exported, so imported accounts have none: people sign in with **Continue
with Google**, or use **Forgot your password?** once to set a new one. Then grant teacher roles
with `firebase:set-teacher` as above.

## Local development

Needs Node.js 22.12 or newer.

```bash
cp .env.example .env.local
```

Fill in `.env.local`, then:

```bash
npm install
```

```bash
npm run dev
```

Also: `npm test` (data layer tests), `npm run typecheck`, `npm run lint`, `npm run build`.

## How the data layer works

The pages still query data the way they did on Supabase —
`db.from("entries").select("*, mods(name)").eq("team_id", id)` — through
`src/integrations/firebase/`:

| File | What it does |
| --- | --- |
| `schema.ts` | Every collection's columns, defaults, unique keys and foreign keys, from the Postgres migrations |
| `db.ts` | The query API over Firestore, plus what Postgres did on its own: defaults, unique keys, `updated_at`, cascading deletes, and the triggers (roster linking, teacher notifications, join codes) |
| `access.ts` | Which rows each user may read, mirroring `firestore.rules` |
| `auth.ts` | Sign-up, sign-in, password reset and first-sign-in account setup |
| `types.ts` | Row types for every collection |

When you add or change a table, update `schema.ts`, `types.ts` and `firestore.rules` (and
`scopeFor` in `access.ts` if not everyone may read it), then deploy the rules.
`supabase/migrations` is the original Postgres schema, kept for reference.

## Differences from the Lovable version

- **Deleting a student** removes their profile, role and all of their work, but their Firebase
  login stays until you delete it under **Authentication → Users**. Signing in again would start
  a brand-new, empty account.
- **Google Drive** connects per browser tab instead of being stored on a server, and the
  Resource Library shows the Drive files a teacher last synced.
- **Students can see which accounts are teachers**, so their mission posts can notify teachers
  (a database trigger did this before).
- This version no longer runs on Lovable Cloud. Keep it in its own GitHub repository rather than
  the one Lovable syncs, or Lovable's edits and this code will overwrite each other.
