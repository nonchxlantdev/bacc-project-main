# Cloudflare Workers Hosting — Design (Sub-project 1 of the Cloudflare migration)

**Date:** 2026-10-08
**Status:** Approved in brainstorming, pending written-spec review
**Repo:** `bacc-project-main`

## Context

The BACC portal will soft-launch at **`bacc.visionforgestudio.app`**, and the whole stack moves to Cloudflare. The main reason is cost and database space: D1's free tier is 5 GB, against Supabase's 500 MB. The migration is split into four sub-projects. Each one gets its own spec, plan and verification:

1. **Hosting on Cloudflare Workers** ← *this spec*
2. **Replace authentication.** A login system that runs on Cloudflare. `AuthContext` is the only consumer.
3. **D1 data layer.** An 18-table SQLite schema, a Worker API with role checks that replace the 36 RLS policies, SQLite immutability triggers, NOC/WO numbering in the Worker, and an `http` repository adapter (`VITE_DATA_SOURCE=d1`). Photo uploads, incident attachments and stored PDF exports are **off by construction** here, which is where the soft-launch lockdown lives.
4. **Security review and pilot go-live.** Re-run the 2026-09-03 audit checks against the Worker API, seed pilot users, smoke test, and open to testers.

Sub-project 1 changes **where the app runs, not what it talks to**. When it's done, the app is served from a Cloudflare Worker on the new subdomain and still uses the existing Supabase backend. That proves the riskiest port (PDF export without a filesystem) on its own, before any data-layer work starts.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Host | One Cloudflare Worker serving static assets and `/api/*` | D1 bindings (sub-project 3) only work from Workers. Cloudflare is steering new projects to Workers over Pages Functions. |
| Plan | **Workers Paid ($5/mo)** | The free plan caps CPU at 10 ms per request, and pdf-lib overlay on a 200–550 KB form needs far more. Paid allows a 30 s default. The same plan raises D1 limits for sub-project 3. |
| PDF export location | Server-side, unchanged logic | Identical output. The server keeps control of which approved base PDF is used. Least code change on a compliance export. |
| Dev tooling | `@cloudflare/vite-plugin` | `npm run dev` runs the real Worker in workerd, so dev and prod share one code path. `vite.pdf-api.js` is deleted. Local D1 comes for free in sub-project 3. |
| Access gate | **None.** The subdomain is public, protected by app login | User decision. |
| Subdomain | `bacc.visionforgestudio.app` | User decision. The `visionforgestudio.app` zone is already on Cloudflare. |

## 1. Architecture and files

```
wrangler.jsonc            NEW   one Worker, "bacc-portal"
worker/index.js           NEW   fetch() router for /api/*
worker/http.js            NEW   request/response wrapper (method, body cap, errors, headers)
worker/formAssets.js      NEW   GENERATED manifest: approved PDFs + field maps + schemas
scripts/build-form-manifest.mjs  NEW   writes worker/formAssets.js
api/*.js                  CHANGED  only the pure build*() functions remain; Vercel handlers removed
api/_shared.js            CHANGED  no node:fs/path; reads from formAssets; requireUser(request, env)
server/overlayChecklistPdf.js  CHANGED  dataUriToBytes uses atob/Uint8Array, not Buffer
server/overlay*.js, reportPdf.js  unchanged (already pure pdf-lib)
public/_headers           NEW   security headers for static assets
vite.config.js            CHANGED  + cloudflare() plugin; pdfExportApiPlugin removed
vite.pdf-api.js           DELETED
vercel.json               DELETED at cutover (kept during parallel run)
.github/workflows/verify.yml  CHANGED  + deploy job
package.json              CHANGED  + wrangler, @cloudflare/vite-plugin; predev/prebuild run the manifest script
```

`wrangler.jsonc` essentials:

```jsonc
{
  "name": "bacc-portal",
  "main": "worker/index.js",
  "compatibility_date": "<date of implementation>",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "limits": { "cpu_ms": 30000 },
  "observability": { "enabled": true },
  "routes": [{ "pattern": "bacc.visionforgestudio.app", "custom_domain": true }],
  "vars": { "SUPABASE_URL": "...", "SUPABASE_ANON_KEY": "..." }
}
```

`nodejs_compat` stays on so that supabase-js, `crypto.randomUUID` and any remaining Node-isms run unchanged. Removing Node dependencies from server code is not a goal of this sub-project.

**The client is unchanged.** It already calls same-origin `/api/...` through `src/lib/apiFetch.js` with the Supabase session JWT. Route paths stay exactly the same:

- `POST /api/export-checklist-pdf`
- `POST /api/export-noc-register`
- `POST /api/export-work-order`
- `POST /api/export-report-pdf`
- `POST /api/generate-checklist-instances`
- `POST /api/create-user`

## 2. Porting the API

### Files without a filesystem

`scripts/build-form-manifest.mjs` runs before `dev` and `build`. It writes `worker/formAssets.js`, which **statically imports**:

- every `src/assets/forms/*.pdf` as bytes. They're copied to `worker/generated/forms/<name>.pdf.bin` because `@cloudflare/vite-plugin` imports `.bin` as `ArrayBuffer` and doesn't apply Wrangler `rules`. About 10 MB total, inside the 64 MiB Worker limit.
- every `src/data/field-maps/*.json`
- every `src/data/checklists/*.json`

It exports three lookups: `fieldMaps[key-ver]`, `basePdfs[fileName]` and `schemas[templateKey]`.

`api/_shared.js` changes:

- `loadRegistryAllowList()` builds `keys` and `basePdfs` from the manifest, not `readdirSync`. **The manifest is the allow-list**, which is tighter than a directory scan.
- `resolveFieldMap()`, `readApprovedBasePdf()` and the `loadSchema()` in `export-checklist-pdf.js` read from the manifest.
- `assertSafeKey`, `rejectClientBasePdf`, `capArray` and `LIMITS` are unchanged.

`worker/formAssets.js` is generated, so it's listed in `.gitignore` and never committed. A unit test fails if any field map's `basePdf` has no matching entry in the manifest.

### Handlers

Each Vercel `handler(req, res)` is replaced by a route entry in `worker/index.js`:

```js
const ROUTES = {
  '/api/export-checklist-pdf':        { kind: 'pdf',  auth: {},                                build: buildExport },
  '/api/export-noc-register':        { kind: 'pdf',  auth: {},                                build: buildNocRegisterExport },
  '/api/export-work-order':          { kind: 'pdf',  auth: {},                                build: buildWorkOrderExport },
  '/api/export-report-pdf':          { kind: 'pdf',  auth: {},                                build: buildReportExport },
  '/api/generate-checklist-instances': { kind: 'json', auth: { roles: ['om','coo','admin'] }, build: buildGenerateInstances, limit: 10 },
  '/api/create-user':                { kind: 'json', auth: { roles: ['admin','om'] },          build: buildCreateUser, limit: 10 },
};
```

`worker/http.js` wraps each route, in this order:

1. Return 405 with `Allow: POST` for any other method.
2. Reject with 413 if `Content-Length` is over `LIMITS.bodyBytes` (12 MB), before reading the body.
3. Rate-limit per IP. This is the existing in-memory limiter, keyed on `CF-Connecting-IP`, with per-route limits as today (20 for exports, 10 for admin routes).
4. Run `requireUser(request, env, auth)`.
5. Parse the JSON body. Malformed JSON returns 400.
6. Call `build(body, { env, user })`.
7. Return the response. PDFs go out with `application/pdf`, `Content-Disposition: attachment; filename="…"` and `Cache-Control: no-store`. JSON goes out as JSON. Errors go out as `{ error }` with `err.status`, or 500, where 5xx is logged as structured JSON, matching `sendError` today.

Unknown `/api/*` paths return 404 JSON. Non-`/api` paths never reach the Worker; static assets serve them in SPA mode.

### Auth

`requireUser(request, env, { roles })` reads `Authorization` from `request.headers`, and `SUPABASE_URL` and `SUPABASE_ANON_KEY` from `env`. Everything else is unchanged: supabase-js `getUser(token)`, the profile lookup, the role check, and 401/403/503 semantics. Sub-project 2 replaces its internals.

### create-user

The `create-user` logic moves into `buildCreateUser(body, { env })`. `SUPABASE_SERVICE_ROLE_KEY` is a **Wrangler secret** (`wrangler secret put`), never a `vars` entry and never `VITE_`-prefixed. The role and department allow-lists and the two-step profile patch are unchanged. The 503 message changes to say "Cloudflare" instead of "Vercel".

### dataUriToBytes

Replace `Buffer.from(b64, 'base64')` with an `atob` → `Uint8Array` decode, so the overlay modules run on any runtime. The Node fixtures and verify scripts keep working because Node 22 has `atob` globally.

## 3. Headers, PWA and domain

- **`public/_headers`** applies these to `/*`: the current CSP (unchanged, still allowing `*.supabase.co` and the OSM tiles), `Strict-Transport-Security: max-age=63072000; includeSubDomains` (`preload` dropped because it only applies to apex domains), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` and `Permissions-Policy`. Vite copies `public/` into `dist/`.
- **`/api` responses** get the same security headers from `worker/http.js`, because `_headers` only applies to asset responses.
- **SPA deep links** are handled by `not_found_handling: "single-page-application"`, which replaces the `vercel.json` rewrite.
- **PWA:** no changes. Workbox already denylists `/api/` from the navigation fallback and uses NetworkOnly for it.
- **Domain:** the custom-domain route makes Cloudflare create the DNS record and certificate for `bacc.visionforgestudio.app`. No manual CNAME.

## 4. Deploy, cutover and testing

### Deploy

A new `deploy` job in `.github/workflows/verify.yml` has `needs: verify`, runs only on pushes to `main`, and uses Node 22. It runs `npm ci`, then `npm run build`, then `npx wrangler deploy`.

- Build-time env comes from GitHub secrets/vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_DATA_SOURCE=supabase`.
- Deploy auth uses the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets. The token is scoped to Workers Scripts:Edit plus Zone:Workers Routes on `visionforgestudio.app` only.
- The existing `verify` job keeps building with `VITE_DATA_SOURCE: mock`, so CI needs no real secrets to pass.

**Nothing reaches the subdomain unless every `verify:*` check, including PDF placement, passes.**

### Parallel run and cutover

1. **Before merging any of this work to `main`, turn off Git auto-deploy on the Vercel project** (Settings → Git). The port removes the Vercel handlers, so a Vercel build of the new `main` would break. With auto-deploy off, Vercel keeps serving its last good production deployment, frozen.
2. Merge, let the Worker deploy, and run the smoke test (below) on `bacc.visionforgestudio.app`.
3. When it passes, delete `vercel.json` and the leftover `export const config` blocks in `api/*.js`. Keep the frozen Vercel deployment until sub-project 4 is live, then delete the project.
4. **Rollback** means telling testers to go back to the frozen Vercel URL. No DNS change is needed, because the subdomain is new.

### Tests

**Unchanged and must still pass:** `verify:palette`, `verify:content`, `verify:signoffs`, `verify:walkthrough`, `verify:pdf` (the fixtures import `server/` directly), and the existing `node --test` suite.

**New `node --test` cases:**
- **Manifest:** every field map's `basePdf` resolves to a manifest PDF. Manifest field-map keys cover all 36 registry entries. `assertSafeKey` still rejects `../`, `/` and `\0`.
- **HTTP wrapper:** 405 on GET. 413 when `Content-Length` is over the cap. 401 with no bearer token. 400 on malformed JSON. 404 on an unknown `/api` path. The error body is always `{ error: string }`. PDF responses carry the attachment `Content-Disposition`.
- **`dataUriToBytes`:** the `atob` version is byte-identical to the old `Buffer` version for PNG and JPEG data URIs.

**Parity (one-off, before cutover):** for each fixture (Annex D, PMM, VAES, C-08, the work order, the NOC register), produce the PDF through the Worker in `vite dev` and through the current Node path. Compare them with `scripts/pdf-diff.mjs`. **The bar is zero visual difference.**

**Live smoke test on `bacc.visionforgestudio.app`:**
1. Log in with an existing Supabase account.
2. Export Annex D, VAES C-08, the NOC register, a work order and a report PDF. Each downloads and opens correctly.
3. As admin, create a user. As an inspector, `create-user` and `generate-checklist-instances` return 403.
4. A `curl` with no token to any `/api` route returns 401.
5. In Workers observability, CPU time per export is recorded and well under 30 s.
6. Deep-link a refresh (for example on `/checklists/mine`) and the SPA loads.
7. Install the PWA, go offline, and confirm the shell loads.
8. Response headers on `/` and on an `/api` response include the CSP and HSTS.

## Out of scope

Each of these belongs to a later sub-project:

- Supabase Auth replacement (sub-project 2)
- D1, the Worker data API, and turning off photos and attachments (sub-project 3)
- Cloudflare's rate-limit binding replacing the in-memory limiter (sub-project 4)
- R2 for any file storage (after the pilot)
- A Cloudflare Access gate (declined)

## Risks

- **Workers bundle size:** about 10 MB of PDFs plus pdf-lib and supabase-js stays well under 64 MiB. Watch Worker startup time. Data-module PDFs are not parsed at startup, so this should be fine. Measure it in the smoke test.
- **Memory:** the 128 MB per isolate is ample for one 550 KB form plus up to 40 embedded images. The existing `LIMITS` stay in force.
- **Vite plugin and PWA plugin together:** confirm `vite-plugin-pwa` still emits `sw.js` into `dist/` when `@cloudflare/vite-plugin` is active. If not, the plan adds a fallback of running wrangler only for deploy, with dev on the plugin.
