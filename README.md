# BATTERD — Partner Ledger & Purchase Tracker

A shared, live web app for the five BATTERD partners to track:

- **Expenses** paid personally by each partner (photo + AI receipt scan, amount, date, category, who paid, reimbursed flag).
- **Equity-weighted settle-up** — each partner has an equity share; the app shows who has paid more or less than their fair share and the minimal transfers to square up.
- **Purchase tracker** — equipment & packaging orders moving through a pipeline (Researching → Quoted → Ordered → Delivered).

Static site (GitHub Pages) + Supabase (Postgres, Storage, Realtime, Edge Function for AI receipt reading). All devices share one live database.

## Files
- `index.html`, `app.js`, `styles.css`, `config.js` — the app
- `schema.sql` — database tables + policies (run once on the Supabase project)
- `supabase/functions/analyze-receipt` — Claude vision receipt reader (Edge Function)
- `.github/workflows/keepalive.yml` — keeps the free-tier project awake

## Config
`config.js` holds the Supabase URL + **publishable** (public) key, the five partners with equity %, and the expense/purchase categories. Edit partners or categories there.

## AI receipt scan
Deploy/update the Edge Function with `./deploy-function.sh` (reads the Anthropic key locally; nothing secret is committed).
