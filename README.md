# Carrier Priority

The broker is no longer necessary.

Full-stack SaaS freight load board for owner-operators and small fleets.
This build completes the working UI (`App.jsx`) and services layer
(`server/services/index.js`) you provided into a runnable application:
database, routes, auth, seed data, config, and deployment files.

## What's in this build

| Priority | Status | Where |
|---|---|---|
| 1 — DB connection layer | Done | `server/db/index.js` |
| 2 — Split route files | Done | `server/routes/*.js` |
| 3 — DB schema (18 tables) | Done | `server/db/schema.js` |
| 3 — Seed data | Done | `server/db/seed.js` |
| 4 — Vite config | Done | `vite.config.js` |
| 5 — `.env.example` | Done | `.env.example` |
| 6 — Third-party API stubs | Already present in your `services/index.js`, wired into routes | `server/services/index.js` + routes |
| 7 — Auth flow | Done | `server/routes/auth.js` |
| 8 — Scoring engine wiring | Done | `server/routes/loads.js` (`GET /api/loads`) |
| 9 — Fraud + double-brokering wiring | Done | `server/routes/loads.js`, `fraud.js`, `drivers.js`, `trucks.js` |
| 10 — Deployment config | Done | `Dockerfile`, `railway.json`, `render.yaml` |

## What is **not** done yet (needs your input before it's production-safe)

1. **Frontend is not yet wired to the API.** `src/App.jsx` still runs on
   its in-memory mock arrays (`LOADS`, `INVOICES`, etc.) exactly as you
   built it — nothing was deleted. Pointing its `useState` calls at
   `fetch('/api/...')` is a real, separate pass over a 2,200-line file
   and touches business logic in every module (load board, drivers,
   fleet, invoices, fraud guard, trust score). I did not want to make
   that call unilaterally — tell me if you want it done next and I'll
   go module by module.
2. **Real third-party credentials.** Every integration (Stripe, Dwolla,
   Plaid, Samsara/Motive, Twilio, SendGrid, Mapbox, DocuSign, DAT,
   Truckstop, FMCSA SAFER, Middesk) is still the mock/stub logic you
   already wrote in `services/index.js`. Nothing was changed there.
   Fill in `.env` and those stubs start hitting real endpoints where
   the code already shows the real call shape in comments.
3. **Money transmission / broker-registration legal review** — flagged
   in your own master context (Section 15) as pending. Not something
   code can resolve.
4. **React Native mobile app, IFTA reporting module** — out of scope
   for this pass; the web PWA driver view already exists inside `App.jsx`.
5. **Database migrations haven't been generated or run.** See setup
   below — this is one command, but I can't run it here since it needs
   a real Postgres instance.

## Local setup

```bash
npm install
cp .env.example .env        # then fill in DATABASE_URL at minimum
npm run db:generate         # drizzle-kit generates SQL from schema.js
npm run db:migrate          # applies it to your database
npm run db:seed             # loads demo data (Stewart Trucking LLC, 3 drivers, 8 loads...)
npm run server:dev          # backend on :3001
npm run dev                 # frontend on :5173 (proxies /api to :3001)
```

Demo login after seeding: `stewart@carrierpriority.com` / `ChangeMe123!`

Health check: `GET http://localhost:3001/health`

## Deploying

- **Railway**: `railway.json` is configured for a Dockerfile build with
  health-checked restarts.
- **Render**: `render.yaml` provisions a Postgres instance, the API as a
  Docker web service, and the frontend as a static site in one blueprint.
- Either way, set every variable from `.env.example` in the platform's
  environment settings before first deploy — the server logs a fatal
  warning at boot if `DATABASE_URL` is missing rather than failing silently.

## Notes on decisions I made without asking

- Kept `drivers`/`trucks` verification and fraud-flag creation as
  on-demand endpoints (`POST /api/drivers/:id/verify`, etc.) rather than
  fully automatic background jobs, since the automatic triggers (on
  booking, during transit, on POD) need real webhook events from
  Samsara/Motive/DocuSign that don't exist yet without live credentials.
  The cron scaffolding for the always-on checks (compliance alerts,
  FMCSA re-verify, invoice aging, CDL expiry, DAT sync, offer expiry)
  is wired and running — see `initCronJobs()`.
- `GET /api/loads` computes score, risk, net profit, and Quick Pay
  projection live on every request using the carrier's current trust
  score rather than caching it on the row, since the scoring formula
  depends on live carrier cost inputs. Flag if you'd rather this run
  on write and get stored instead.

Real answers.
