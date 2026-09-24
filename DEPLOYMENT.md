# Deployment & Cloudflare Pages Migration Guide

This guide details the deployment setup for **Mega Agent Console** on **Cloudflare Pages** and the step-by-step cutover process from the legacy Vercel deployment once a production custom domain is purchased.

---

## 1. Why Cloudflare Pages?

The console was previously deployed to Vercel (`mega-agent-console.vercel.app`) on the free Hobby tier. Vercel's Hobby terms explicitly restrict usage to non-commercial projects. Cloudflare Pages' free tier explicitly permits commercial use with generous limits suitable for high-performance static SPAs.

---

## 2. Cloudflare Pages Build Settings

When connecting this repository in the **Cloudflare Dashboard** (**Workers & Pages** > **Create application** > **Pages** > **Connect to Git**):

| Setting | Value | Notes |
| :--- | :--- | :--- |
| **Project Name** | `mega-agent-console` | Or your preferred project slug |
| **Production Branch** | `main` | Deploys on every push/merge to `main` |
| **Framework Preset** | `Vite` | Or `None` |
| **Build Command** | `npm run build` | Runs `tsc -b && vite build` |
| **Build Output Directory** | `dist` | Contains compiled static assets and `_redirects` |
| **Root Directory** | `/` | Repository root |

### Environment Variables (Production & Preview)

Set these in **Settings** > **Environment variables**:

| Variable | Recommended Value | Description |
| :--- | :--- | :--- |
| `VITE_API_MODE` | `real` | Activates real API calls to `mega-agent-api` |
| `VITE_API_BASE_URL` | `https://api.yourdomain.com/api/jobs` | Full URL to the API jobs endpoint (or active tunnel URL during staging) |
| `NODE_VERSION` | `22` | Optional; ensures Node.js 22 LTS environment |

---

## 3. SPA Routing & Redirects

Cloudflare Pages automatically serves `dist/index.html` for single-page applications via the included `_redirects` file:

- **Source File**: `public/_redirects`
- **Output File**: `dist/_redirects`
- **Rule**:
  ```plaintext
  # SPA fallback for Cloudflare Pages
  /* /index.html 200
  ```
- **Why It Matters**: Deep links, direct page refreshes, and auth token callbacks (such as `/?resetToken=...` and `/?verifyToken=...` handled in `src/utils/urlToken.ts`) return HTTP 200 and load the React application cleanly rather than triggering a 404.

---

## 4. Pre-Cutover Verification (Testing on `*.pages.dev`)

Before assigning the production domain, test the live deployment on the default Cloudflare Pages preview URL (`https://<project-name>.pages.dev`):

1. **Verify Build**: Ensure Cloudflare Pages completes `npm run build` without warnings or errors.
2. **Configure Backend CORS**: Add `https://<project-name>.pages.dev` to `CORS_ALLOWED_ORIGINS` in `mega-agent-api`'s `appsettings.json` or environment configuration.
3. **Verify App Capabilities**:
   - Log in / Sign up with email and password.
   - Test password reset and email verification flows.
   - Test Local Agent roster polling (`GET /api/agents`) and agent pairing.
   - Verify 3D digital twin lazy-loads smoothly upon clicking "View Interactive 3D Digital Twin".

---

## 5. Domain Cutover Checklist (When Domain Is Purchased)

Once the production custom domain (e.g. `console.megasuite.com` or `app.megasuite.com`) is available, execute these exact steps:

- [ ] **Step 1: Add Custom Domain in Cloudflare Pages**
  - Navigate to **Workers & Pages** > `mega-agent-console` > **Custom domains**.
  - Click **Set up a custom domain** and enter your desired hostname (e.g. `console.yourdomain.com`).

- [ ] **Step 2: Configure DNS**
  - If using Cloudflare DNS: Cloudflare will configure the CNAME record automatically.
  - If using external DNS (Route 53, GoDaddy, Namecheap):
    - Add a `CNAME` record pointing `console.yourdomain.com` to `<project-name>.pages.dev`.
    - Wait for Universal SSL certificate issuance (typically 1–5 minutes).

- [ ] **Step 3: Update API CORS & Base URL**
  - In `mega-agent-api`: Add `https://console.yourdomain.com` to `CORS_ALLOWED_ORIGINS`.
  - In Cloudflare Pages environment variables: Confirm `VITE_API_BASE_URL` points to `https://api.yourdomain.com/api/jobs`.
  - Trigger a redeploy if the base URL was modified.

- [ ] **Step 4: End-to-End Validation**
  - Visit `https://console.yourdomain.com`.
  - Confirm HTTPS certificate is active and valid.
  - Test authentication session persistence and API requests with `X-Api-Key`.
  - Confirm hard page refresh returns 200 without redirect loops.

- [ ] **Step 5: Decommission Vercel (Legacy)**
  - Once Cloudflare Pages is confirmed live and healthy:
    1. Update any bookmarks / internal links from `mega-agent-console.vercel.app` to the new custom domain.
    2. Remove or archive the project in the Vercel dashboard.
    3. Delete `vercel.json` from the repository in a clean cleanup commit.
