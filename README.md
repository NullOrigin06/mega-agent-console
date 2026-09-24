# Mega Agent Console

Web front-end for the background-agent-driven engineering workflow on top of **Mega Engineering Suite** (pressure vessel components: Tube Sheet, Bonnet Flange, and Heat Exchanger Fabrication).

## Authentication & User Accounts

The console supports **per-user accounts** rather than a flat build-time secret:
- **Sign In / Sign Up**: Simple email + password auth modal (`POST /api/auth/login`, `POST /api/auth/signup`).
- **Session Storage**: The returned `{ userId, apiKey }` is saved to browser storage (`localStorage`) and sent as the `X-Api-Key` header on all `/api/*` requests.
- **Session Expiration**: Automatic 401 handling invalidates the session and returns the user to the login screen cleanly.
- **Account Indicator**: Header displays the active user email with a 1-click Sign Out action.

## Multi-Agent CAD Pairing

CAD generation runs on the engineer's workstation (using local GstarCAD/AutoCAD) rather than on the central server:
- **Local Agent Roster**: `GET /api/agents` retrieves all workstations paired to the user's account, displaying real-time Online/Offline status.
- **Pairing Code Flow**: Connect additional workstations using the 6-digit code shown in the Mega Local Agent desktop app.
- **Workstation Selection**: In the Drawing tab, when multiple online agents are available, a workstation selector lets the user choose which machine receives the generation command (`POST /api/jobs/{id}/generate-drawing`).

## Mock & Real Modes

- **Mock Mode (`VITE_API_MODE=mock`)**: Fully offline interactive mode. Any email/password will log in, sample agents are available, and drawings simulate generation.
- **Real Mode (`VITE_API_MODE=real`)**: Connects to `mega-agent-api` (`http://localhost:5299/api/jobs` or relative `/api/jobs` when served same-origin from the API's `wwwroot`).

## Getting Started

```bash
npm install
npm run dev
```

For production builds:
```bash
npm run build
```
The compiled output in `dist/` can be copied into `mega-agent-api/wwwroot/` for same-origin deployment.

## Deployment

### Cloudflare Pages (recommended)

Vercel's free Hobby tier is non-commercial-use only per its own terms —
not valid for an actual business tool. Cloudflare Pages' free tier
explicitly allows commercial use and has no meaningful limit for a static
SPA like this one, so it's the recommended target going forward.

1. In the Cloudflare dashboard, create a Pages project connected to this
   GitHub repo.
2. Build settings:
   - Build command: `npm run build`
   - Output directory: `dist`
3. Project environment variables:
   ```
   VITE_API_MODE=real
   VITE_API_BASE_URL=https://api.your-domain.com/api/jobs
   ```
4. `public/_redirects` (already in this repo) tells Cloudflare Pages to
   serve `index.html` for every path with a 200, so this client-side app's
   own routing (`?resetToken=`/`?verifyToken=` on the root path — see
   `src/utils/urlToken.ts`) keeps working on a hard refresh or direct link.
5. Attach a custom domain (e.g. `app.your-domain.com`) as a Pages custom
   domain, and set `CORS_ALLOWED_ORIGINS` on the API to that same origin.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the detailed step-by-step cutover checklist and DNS configuration once a custom domain is acquired.


### Vercel (legacy)

`vercel.json`'s rewrite currently points at a temporary Cloudflare quick
tunnel and predates the per-user account / Cloudflare Pages work above —
kept for now since it's still a live deployment, but new work should
target Cloudflare Pages instead. Retire this once Cloudflare Pages is
confirmed working.

### CI

`.github/workflows/ci.yml` runs `npm ci`, `npm run lint`, `npx tsc -b`, and
`npm run build` on every push/PR to `main`.

