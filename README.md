# Sello

Membership and loyalty app for small businesses (cafés, beauty) in Puerto Vallarta.

- **Customers** open a link or QR, sign up, and get a pass with a QR code. No download, no login.
- **Staff / owners** log in, scan or search a customer, confirm payment, and add stamps.
- Works with weak signal: the customer's last pass is saved on their phone.

Built as a web app (PWA): React + Vite, with Supabase for the database and logins.

## Pages

| Address | Who | What |
| --- | --- | --- |
| `/join/<business-slug>` | Customer | Pick a membership and sign up |
| `/pass/<token>` | Customer | The pass: QR, stamps, history |
| `/staff` | Business | Login, check-in, panel (owner only) |

## First-time setup

1. **Database.** In Supabase, open *SQL Editor → New query*, paste all of `supabase/schema.sql`, and click *Run*.
2. **Logins.** In Supabase, *Authentication → Sign In / Providers → Email*: while testing, turn **Confirm email** off.
   Before real use, turn it back on and set *Authentication → URL Configuration → Site URL* to your live address.
3. **Run it** (needs Node 20+): `npm install`, then `npm run dev`.
4. **Publish it**: import this repository in Vercel. Defaults work (Vite is detected automatically).

## Database updates

If you already ran `supabase/schema.sql`, run any newer file from `supabase/updates/` once, in date order.
Fresh installs only need `schema.sql`, which always includes every update.

## Phone numbers

Customers pick a country and type the local number. We store it in full international digits (Mexico = `52` + 10 digits).
Some WhatsApp sending services want Mexican mobiles as `521` + 10 digits; convert at sending time, not in the database.

## Keys and secrets

`src/supabase.js` contains the Supabase project URL and **publishable** key. Both are public by design and safe to commit.
Real protection comes from the row-level security rules in `supabase/schema.sql`.

**Never** commit the Supabase *secret* / *service_role* key, or any Stripe, Conekta or WhatsApp keys. Keep them in `.env` (ignored by git).

## Not built yet

Online payments (memberships are confirmed by hand at the counter), WhatsApp reminders, loyalty points, Apple/Google Wallet passes,
the business directory, staff-invite flow, and offline stamping for the staff app.

`sello-wireframes.html` is the interactive design mockup for all of the above.


## Points, rewards and the directory

Run `supabase/updates/2026-10-26-points-directory.sql` once (fresh installs get it from `schema.sql`).

- Owners turn points on in **Dashboard > Points & rewards**: either fixed points per visit (added automatically with each stamp) or points per amount spent (staff types the bill).
- Rewards are a menu (name + points cost). Staff taps **Redeem** on the customer's screen; balances can never go below zero.
- **Explore** (`/explore`) is the public directory. Businesses are listed by default and can switch it off in the Dashboard. Only businesses with at least one visible membership appear.

## Wallet passes (Google / Apple)

The "Add to Wallet" buttons stay hidden until the secrets exist. Add them in Vercel > Project > Settings > Environment Variables, then redeploy.

Google Wallet (free): `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_WALLET_PRIVATE_KEY` (the service account key; `\n` line breaks are fine).

Apple Wallet (needs the Apple Developer account, USD 99/yr): `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID`, `APPLE_SIGNER_CERT`, `APPLE_SIGNER_KEY` (both base64 of the PEM files), `APPLE_WWDR_CERT` (base64 of Apple's WWDR certificate), optional `APPLE_SIGNER_KEY_PASSPHRASE`.

A wallet pass is a snapshot taken when it is added (name, plan, points then). The QR code always works because it only holds the private pass link; live updating of the points shown inside the wallet is a later step.
