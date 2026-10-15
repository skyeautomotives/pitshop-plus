# Pitstop Plus

A simple, mobile-friendly web app for automobile workshops to create, save, search and print customer repair bills.

- **Many workshops, one app:** any workshop can **register** from the sign-in page (workshop name, owner's name, username and password) and gets its own private space. Each workshop sees only its own bills, complaints, staff and reports, and its bill and complaint numbers start at 1.

- **New bill:** customer and vehicle details, any number of parts or work items (free text and price), a required labour charge, and optional painting and washing. Totals update as you type.
- **Complaints:** record what the customer reports (free text), the date, who attended them, notes, and status (Open / Resolved). Enter the vehicle number first; if the vehicle has been seen before, the app offers to fill in the customer's details.
- **Bills ↔ complaints:** when creating or editing a bill, tick which of that vehicle's complaints the work addresses. This is optional, and a bill can address several complaints. A complaint can also have several bills. Saving the bill marks its complaints **Resolved**; if a bill is edited to untick a complaint that no other bill covers, it goes back to **Open**.
- **Find bills:** one search box that matches customer name, phone number or vehicle number. It shows matching bills (with the complaints each addresses), matching complaints (with who attended and their bills), and shortcuts to each vehicle's history.
- **Vehicle history:** complaints and bills for one vehicle, together in date order. Filters show **complaints without a bill** and **bills without a complaint**.
- **Print / Save PDF:** a clean printable bill with your workshop's name, address and phone.
- **Send on WhatsApp:** opens WhatsApp (the app on phones, WhatsApp Web on computers) with the customer's number and the bill summary filled in. Staff only press Send. 10-digit numbers are treated as Indian (+91). No WhatsApp Business account is needed.
- **Unsaved-bill protection:** the app warns before you leave a bill you haven't saved. An unfinished new bill is also kept on the device and restored the next time you open **New bill**.

Built with React, TypeScript, Vite and Supabase (Postgres plus Auth).

## 1. Supabase setup

1. Create a project at [supabase.com](https://supabase.com/dashboard).
2. **Create the database.** Open **SQL Editor → New query**, paste the contents of each file below in order, and click **Run** for each:
   - `supabase/migrations/0001_billing_schema.sql`
   - `supabase/migrations/0002_bills.sql`
   - `supabase/migrations/0003_staff.sql`
   - `supabase/migrations/0004_complaints.sql`
   - `supabase/migrations/0005_attended_by_required.sql`
   - `supabase/migrations/0006_resolve_on_bill.sql`
   - `supabase/migrations/0007_staff_tracking.sql`
   - `supabase/migrations/0008_usernames.sql`
   - `supabase/migrations/0009_delivery_and_discount.sql`
   - `supabase/migrations/0010_item_quantity.sql`
   - `supabase/migrations/0011_multi_shop.sql`

   Run each file only once.
3. **Deploy the registration function.** This powers the **Register your workshop** page. Open **Edge Functions → Deploy a new function → Via Editor**, name it `register-shop`, paste the contents of `supabase/functions/register-shop/index.ts`, and click **Deploy**. Then open the function's **Settings** and turn **off** "Verify JWT with legacy secret" (visitors registering aren't signed in yet). Using the CLI instead: `npx supabase functions deploy register-shop --no-verify-jwt --project-ref <ref>`.
4. **Deploy the login-management function.** This lets the owner add and remove logins from **Settings**. Open **Edge Functions → Deploy a new function → Via Editor**, name it `manage-staff`, paste the contents of `supabase/functions/manage-staff/index.ts`, and click **Deploy**. Then open the function's **Settings** and turn **off** "Verify JWT with legacy secret" (the function checks the caller itself). Using the CLI instead: `npx supabase functions deploy manage-staff --no-verify-jwt --project-ref <ref>`.
5. **Turn off public sign-ups.** Open **Authentication → Sign In / Providers** and turn off **Allow new users to sign up**. Workshops register through the `register-shop` function instead, which creates the login and the workshop together. Even if sign-ups stay on, logins that don't belong to a workshop can't see any bills.
6. **Get the public keys.** Open **Project Settings → API Keys** and copy the **Project URL** and the **publishable** (or legacy **anon**) key.

### How access is protected

- Every login belongs to one workshop (`staff.shop_id`), and every bill, complaint and settings row belongs to one workshop. Row Level Security only shows a login the rows of its own workshop. Visitors who aren't logged in see nothing.
- **Owner** logins can change their workshop's Settings and add or remove its logins. **Staff** logins can create, edit, search, print and send bills.
- New workshops are created by the `register-shop` Edge Function, and logins are added and removed by the `manage-staff` Edge Function. Both run on Supabase's servers with the service-role key; `manage-staff` re-checks on every call that the caller is an owner and only touches logins of the caller's own workshop.
- Database functions that run with elevated rights (`save_bill`, `set_staff_name`, `staff_names`, …) only read and write the caller's own workshop.
- Bills and complaints for the same vehicle are matched by the registration number with spaces, dashes and case ignored (`KL 39 W 0890` = `kl-39w0890`). There are no separate customer or vehicle tables.
- Bill-to-complaint links (`bill_complaints`) are written only by `save_bill`, which rejects a complaint that belongs to a different vehicle.
- Bills are saved only through the `save_bill` database function. It checks the labour charge and calculates the subtotal and grand total, so stored totals always match the items, including after edits.
- The frontend uses only the publishable/anon key. **Never put the `service_role` / secret key in `.env` or in the frontend.** Every `VITE_` variable is visible in the browser.

## 2. Run locally

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env     # then fill in the two values from step 1.5
npm run dev              # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm test` | Run the billing-logic tests |
| `npm run typecheck` | Check TypeScript |
| `npm run build` | Production build into `dist/` |

`.env` is listed in `.gitignore` and is never committed. Only `.env.example`, which holds placeholders, is in the repository.

## 3. GitHub

The repository already exists. To connect a new copy:

```bash
git remote add origin https://github.com/<your-account>/<repo>.git
git push -u origin main
```

On every push and pull request, GitHub Actions (`.github/workflows/ci.yml`) runs the type check, the tests and the build.

## 4. Deploy (GitHub Pages)

`.github/workflows/pages.yml` builds the app and publishes it on every push to `main`. The site is at `https://<user>.github.io/<repo>/`.

1. **Settings → Pages → Build and deployment → Source:** choose **GitHub Actions**. Don't use "Deploy from a branch": that publishes the unbuilt source code and shows a blank page.
2. **Settings → Secrets and variables → Actions:**
   - **Variables** tab → `VITE_SUPABASE_URL` = your Project URL
   - **Secrets** tab → `VITE_SUPABASE_ANON_KEY` = the publishable/anon key (never the service_role key)
3. **Actions → Deploy to GitHub Pages → Run workflow**, or push a commit.
4. In Supabase, open **Authentication → URL Configuration** and set **Site URL** to the Pages address.

## Deploy (Netlify, alternative)

The app is a static website (HTML, CSS, JavaScript) that talks to Supabase. Node.js is only needed to *build* it; the host runs the build for you.

1. Sign in at [netlify.com](https://app.netlify.com) with GitHub.
2. Click **Add new site → Import an existing project → GitHub**, allow access, and pick this repository.
3. Set the build settings: **Build command** `npm run build`, **Publish directory** `dist`.
4. Under **Environment variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Use the same values as your `.env`; never use the service_role key.
5. Click **Deploy**. When it finishes, rename the site under **Site configuration → Change site name** (e.g. `your-workshop.netlify.app`).
6. In Supabase, open **Authentication → URL Configuration** and set **Site URL** to that address.

Every push to `main` redeploys automatically. `public/_redirects` makes page links such as `/bills/…` work after a refresh. Netlify's free plan allows commercial use. Cloudflare Pages works the same way, with the same build command, output folder and variables.

## Deploy (Vercel, alternative)

1. Sign in at [vercel.com](https://vercel.com) with GitHub and click **Add New → Project**. Import the repository.
2. Vercel detects Vite automatically. Under **Environment Variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Click **Deploy**. Every push to `main` then deploys automatically. `vercel.json` makes page links such as `/bills/…` work after a refresh.
4. In Supabase, open **Authentication → URL Configuration** and set **Site URL** to your Vercel address.

Netlify, Cloudflare Pages and similar hosts work the same way: build command `npm run build`, output folder `dist`, the same two environment variables, and a rewrite of all paths to `/index.html`.

## Using the app

- **Staff logins** (Settings, owner only): add a login with a name, email and password, then tell the person their password. **Change password** sets a new one. **Remove** stops that person signing in; bills they created are kept.
- **Settings:** enter the workshop name, address and phone that are printed on bills. Tick **Allow bills with a labour charge of ₹0** only if the workshop wants zero-labour bills. By default the labour charge must be above ₹0.
- **New bill:** customer name, phone, vehicle number, date received and labour charge are required. Address and expected pickup are optional. Press **Enter** in an item's price box to jump to a new row.
- **Painting and washing** are optional. Tick one to enter its charge.
- **Editing** a saved bill recalculates and saves all totals again.
