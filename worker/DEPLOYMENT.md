# Bursa Review Reminder — Worker Deployment

This is the backend piece for the "remind customer to leave a Google review 1 hour after ordering" push notification. It's a separate Cloudflare Worker from your main Pages site, because Pages (static hosting) can't run scheduled background jobs on its own.

**Works on:** Android (Chrome/Edge). **Does not work on:** iOS Safari (Apple blocks background web push entirely) or desktop unless the customer specifically opts in there too.

## What you're deploying
- `src/index.js` — the Worker: one endpoint (`/schedule-review`) that saves a pending reminder, plus a cron job that runs every 10 minutes to send any that are due.
- Uses [`@pushforge/builder`](https://github.com/draphy/pushforge) — a lightweight, Workers-native Web Push library (no server needed beyond this Worker).

## One-time setup (Cloudflare Dashboard — no CLI needed)

### 1. Create the Worker
1. Go to **Workers & Pages** → **Create** → **Workers** → **Create Worker**
2. Name it `bursa-review-reminder`, click **Deploy** (deploys a blank placeholder first)
3. Click **Edit code** — delete the placeholder code, paste in the full contents of `src/index.js`
4. You also need the `@pushforge/builder` package bundled in. Easiest path: use the dashboard's "Quick Edit" if it supports npm imports, OR install Wrangler locally once to deploy:
   ```bash
   npm install -g wrangler
   cd bursa-worker
   npm install
   wrangler login
   wrangler deploy
   ```
   (Wrangler bundles the `@pushforge/builder` import automatically — this is the more reliable path if the dashboard editor doesn't resolve npm imports for you.)

### 2. Create the KV namespace (stores pending reminders)
1. **Workers & Pages** → **KV** → **Create namespace** → name it `REVIEW_KV`
2. Copy its ID
3. Open `wrangler.toml`, replace `REPLACE_WITH_YOUR_KV_NAMESPACE_ID` with that ID
4. In the Worker's **Settings → Bindings**, add a KV binding: variable name `REVIEW_KV`, pointing to that namespace (if not already picked up from wrangler.toml on deploy)

### 3. Set the VAPID private key as a secret
This is the sensitive key — never put it in the code or GitHub.

1. Worker → **Settings → Variables and Secrets**
2. Add secret: name `VAPID_PRIVATE_KEY`, value:
   ```
   {"alg":"ES256","key_ops":["sign"],"ext":true,"kty":"EC","x":"EjNMjJ6tWpcAgt1t4sAz0egDSpY55DJUM1KL98qJL5Y","y":"-Y5b7QuOSCbndNdtbjURVQrjezU3QWwitiMnbg1piRg","crv":"P-256","d":"sWa56BR33yy3-zG9RLxdlVinAihGmPF7DZlZbqM_TT0"}
   ```
   (This matches the public key already embedded in the site's `index.html` — don't regenerate unless you also update the site.)

### 4. Enable the Cron Trigger
1. Worker → **Settings → Triggers → Cron Triggers → Add Cron Trigger**
2. Schedule: `*/10 * * * *` (every 10 minutes — already in `wrangler.toml`, but confirm it shows up here after deploy)

### 5. Connect the site to the Worker
1. Copy your Worker's URL (looks like `https://bursa-review-reminder.YOUR-SUBDOMAIN.workers.dev`)
2. In `index.html`, find this line near the top of the `<script>` section:
   ```js
   const REVIEW_WORKER_URL = "";
   ```
   Paste your Worker URL between the quotes, then push the updated `index.html` to GitHub as usual.

Until step 5 is done, this feature is silently inactive — nothing breaks, it just doesn't do anything yet.

## How it works end-to-end
1. Customer places an order → sees a friendly "Yes, remind me 🙏" popup (only once; if they decline, never asked again on that device)
2. If they agree, the browser asks for notification permission (native prompt)
3. On allow, the site subscribes them to push and tells the Worker: "remind this subscription in 1 hour"
4. Every 10 minutes, the Worker checks for due reminders and sends them via Web Push
5. Customer taps the notification → opens directly to your Google review page

## Testing it
Since it's a 1-hour delay, testing patiently is annoying. To test faster, temporarily change `ONE_HOUR_MS` in `src/index.js` to something like `2 * 60 * 1000` (2 minutes), redeploy, place a test order, allow notifications, and wait ~10-12 minutes (2 min delay + up to one 10-min cron cycle). Remember to change it back to `60 * 60 * 1000` afterward.
