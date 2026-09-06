# Deployment

Three accounts, all free tiers, roughly 20 minutes. Do them in this order —
each step needs something from the one before it.

Everything here is a one-time setup. After this, pushing to `main` deploys
automatically.

## Before you start

Have a terminal open in this folder. You will generate one secret and paste it
into two different places, so keep a scratch note open.

Generate the secret now:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the 64-character output. This is your `CRON_SECRET`. It stops strangers
from triggering the sync job. It is a password: do not commit it.

---

## 1. Neon — the database

1. Go to [neon.tech](https://neon.tech) and sign up. Signing in with GitHub is
   the least friction since you need a GitHub account anyway.
2. Create a project. Name it `nfl-pickem`. Take the default Postgres version,
   and pick the region closest to you (`AWS us-east-1` if you are on the east
   coast).
3. On the project dashboard, find the **Connection string** panel. Select
   **Pooled connection** from the dropdown, then copy the string. It looks like:

   ```
   postgresql://neondb_owner:PASSWORD@ep-something-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```

   Save it to your scratch note. This is your `DATABASE_URL`.

4. Create the tables. In the Neon sidebar, open **SQL Editor**. Open
   [`db/schema.sql`](db/schema.sql) from this project, copy its entire
   contents, paste into the editor, and click **Run**.

   You should see it complete without errors. To confirm, run:

   ```sql
   select id, name from players;
   ```

   You should get three rows: Dad, John, Nick.

> **Note:** Neon's free tier suspends the database after five minutes of
> inactivity, so the very first page load after a quiet spell takes an extra
> half second. The sync job runs often enough that you will rarely notice.

---

## 2. GitHub — the code and the scheduler

1. Go to [github.com/new](https://github.com/new).
2. Name it `nfl-pickem`. **Do not** tick "Add a README" or add a `.gitignore` —
   this project already has both, and it would create a conflict.
3. Set it to **Public** — see the note below for why.
4. Create the repository, then push:

```bash
git remote add origin https://github.com/YOUR-USERNAME/nfl-pickem.git
```

```bash
git push -u origin main
```

### Why public

The schedule runs on GitHub Actions, and public repositories get unlimited free
Actions minutes. Private ones get 2,000 a month, and polling every 30 minutes
costs about 1,440 — it fits, but with little headroom, and going over stops the
sync silently in the middle of the season.

Nothing sensitive is in the code, and the history has been checked. The database
password and the cron secret live in Vercel and GitHub Secrets, never in the
repository. `.env.local` and `.pglite/` are both gitignored.

What public does *not* mean: the pool itself is not listed anywhere. The app
sits at an unlisted URL and is marked `noindex`. Anyone who reads the source
learns how the scoring works — which is the point of the Rules page anyway —
but they cannot reach your pool without the link, and they cannot touch the
database.

---

## 3. Vercel — hosting

1. Go to [vercel.com](https://vercel.com) and sign up **with GitHub**.
2. Click **Add New → Project**. Find `nfl-pickem` and click **Import**.
3. Vercel will detect Next.js on its own. Leave the build settings alone.
4. Before clicking Deploy, expand **Environment Variables** and add two:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the pooled Neon string from step 1 |
   | `CRON_SECRET` | the 64-character secret you generated |

   Leave them applied to all environments (Production, Preview, Development).

5. Click **Deploy** and wait for the build.
6. Copy your production URL — something like
   `https://nfl-pickem-abc123.vercel.app`. Save it to your scratch note.

> If you want a nicer address, go to **Settings → Domains** and rename the
> project. A less guessable name is slightly better here, since the pool has no
> password.

At this point the site is live but empty — it has no games yet, because nothing
has run the sync.

---

## 4. GitHub — the two secrets

Back in your GitHub repository: **Settings → Secrets and variables → Actions →
New repository secret**. Add two:

| Name | Value |
|---|---|
| `CRON_SECRET` | the same 64-character secret you gave Vercel |
| `APP_URL` | your Vercel URL, with no trailing slash |

`CRON_SECRET` must match Vercel exactly. If the two differ, every sync returns
401 and no games ever load — that is the single most likely thing to go wrong.

---

## 5. The first sync

Go to the **Actions** tab in your repository. If it asks you to enable
workflows, do that. Select **Sync schedule, lines and scores** in the sidebar,
then **Run workflow → Run workflow**.

Give it about thirty seconds, then open your app URL. You should see Week 1
with 16 games, grouped by lock window.

If you would rather do it from the terminal:

```bash
curl -X POST "https://YOUR-APP.vercel.app/api/cron/sync" -H "Authorization: Bearer YOUR-CRON-SECRET"
```

A healthy response looks like:

```json
{"ok":true,"season":2026,"week":1,"games":16,"snapshots":16,"frozen":0}
```

From here it runs itself every 30 minutes.

---

## 6. Check it over

- [ ] The app loads and shows this week's games with spreads.
- [ ] Tapping **Dad**, **John** or **Nick** highlights that name.
- [ ] Tapping a team selects it, and it survives a page refresh.
- [ ] The **Upset** button is greyed out on a favorite and available on a dog.
- [ ] Deadlines read sensibly in your own time zone.
- [ ] Open the URL on your phone and confirm it looks right there too.

Then send the link to John and Nick.

---

## Troubleshooting

**The app says "No week loaded yet."**
The sync has not run successfully. Check the Actions tab for a red run.

**Every sync fails with 401.**
`CRON_SECRET` in GitHub does not match the one in Vercel. Re-enter both.

**The sync returns 502.**
ESPN was unreachable or returned something unexpected. It is safe to re-run;
nothing is half-written.

**Games appear but have no spread.**
ESPN has not posted a line for that game yet. It fills in on a later sync. A
game with no line cannot be picked, by design.

**A game is wrong — bad line, postponed, wrong score.**
There is no commissioner page yet. For now, fix it in the Neon SQL editor and
tell me, so the fix ends up in the app instead of in your head.

---

## What happens from here

- Every push to `main` redeploys automatically.
- The sync job keeps the schedule, the lines and the scores current.
- Lines freeze on their own as each lock window passes.
- Nobody needs to log in, ever.
